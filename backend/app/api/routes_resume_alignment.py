from __future__ import annotations

from pathlib import Path
import re
import shutil
import subprocess
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.db import GeneratedResume, JobMatch, Resume, ResumeExtraction, User
from app.schemas.api import GeneratedResumeResponse, GeneratedResumeUpdate, JobMatchResponse, ResumeAlignmentRequest
from app.services.agents import _active_credential, _provider_config
from app.services.agent_prompts import extra_block, get_prompt_bundle
from app.services.json_utils import loads_json
from app.services.prompt_injection import sanitize_untrusted_text, untrusted_block
from app.services.providers import make_provider
from app.services import storage
from app.services.compile_dispatcher import dispatch_compile


router = APIRouter(prefix="/resume-alignments", tags=["resume-alignments"])


LOCKED_RESUME_TEMPLATE = r"""\documentclass[a4paper,10pt]{article}

% ---------- Packages ----------
\usepackage[margin=0.45in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{hyperref}
\usepackage{tgtermes}
\usepackage[T1]{fontenc}
\usepackage{xcolor}
\usepackage{tabularx}
\usepackage{array}

% ---------- Page Setup ----------
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}

\hypersetup{
    colorlinks=true,
    urlcolor=blue,
    linkcolor=blue,
    citecolor=blue
}

% ---------- Section Formatting ----------
\titleformat{\section}
  {\Large\scshape}
  {}
  {0em}
  {}
  [\titlerule]

\titlespacing*{\section}{0pt}{3pt}{3pt}

% ---------- List Formatting ----------
\setlist[itemize]{
    leftmargin=1.2em,
    itemsep=1pt,
    topsep=2pt,
    parsep=0pt,
    partopsep=0pt
}

\renewcommand\labelitemi{$\bullet$}

% ---------- Custom Commands ----------
\newcommand{\resumeHeader}[8]{
    \begin{center}
        {\LARGE \textbf{#1}}\\
        \href{mailto:#2}{#2} \,|\, #3 \,|\, \href{#4}{LinkedIn} \,|\, \href{#5}{GitHub} \,|\, \href{#6}{LeetCode}\\
        #7\\
        #8
    \end{center}
}

\newcommand{\resumeSubheading}[4]{
    \textbf{#1} \hfill #2\\
    \textit{#3} \hfill #4
}

\newcommand{\resumeProjectHeading}[3]{
    \textbf{#1}\\
    \textit{#2} \hfill #3
}

\newcommand{\resumeEducationHeading}[4]{
    \textbf{#1} \hfill #2\\
    #3\\
    #4
}

\newcommand{\skillLine}[2]{%
    \noindent\textbf{#1:} #2\par\vspace{0pt}%
}

% ---------- Document ----------
\begin{document}
\vspace*{-35pt}

% Resume content goes here.

\end{document}
"""


@router.post("/matches/{match_id}", response_model=GeneratedResumeResponse, status_code=status.HTTP_201_CREATED)
def generate_resume_for_match(
    match_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    payload: ResumeAlignmentRequest | None = None,
    x_provider_api_key: Annotated[str | None, Header(alias="X-Provider-Api-Key")] = None,
) -> GeneratedResumeResponse:
    if not x_provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your provider key is stored only in this browser session. Re-enter it on the API provider page.",
        )
    match = _match_for_user(db, match_id, current_user.id)
    resume = _latest_resume(db, current_user.id)
    extraction = db.scalar(
        select(ResumeExtraction).where(ResumeExtraction.resume_id == resume.id, ResumeExtraction.user_id == current_user.id)
    )

    jd_override = (payload.job_description_override if payload else None) or None
    credential = _active_credential(db, current_user.id)
    provider = make_provider(_provider_config(credential, "resume_alignment", x_provider_api_key))
    latex_source = _strip_markdown_fence(
        provider.generate_text(
            get_prompt_bundle(db, "resume_alignment").system_prompt,
            _resume_alignment_prompt(db, match, resume, extraction, jd_override=jd_override),
        )
    )
    if "\\documentclass" not in latex_source or "\\begin{document}" not in latex_source:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Resume agent did not return valid LaTeX.")
    _validate_latex_source(latex_source)

    file_base = _file_base(current_user, match)
    relative_dir = Path("generated_resumes") / str(current_user.id) / f"{file_base}_{match.id}"
    latex_path = relative_dir / f"{file_base}.tex"
    storage.put_text(str(latex_path), latex_source, content_type="application/x-tex")

    generated = GeneratedResume(
        user_id=current_user.id,
        match_id=match.id,
        resume_id=resume.id,
        company=match.job.company,
        position=match.job.title,
        file_base=file_base,
        latex_path=str(latex_path),
        latex_source=latex_source,
        compile_status="not_compiled",
        model=getattr(provider.config, "model", ""),
        prompt_tokens=int(getattr(provider, "prompt_tokens", 0) or 0),
        completion_tokens=int(getattr(provider, "completion_tokens", 0) or 0),
        total_tokens=int(getattr(provider, "total_tokens", 0) or 0),
    )
    db.add(generated)
    db.commit()
    db.refresh(generated)
    _compile_generated_resume(db, generated)
    return _generated_response(generated)


@router.get("", response_model=list[GeneratedResumeResponse])
def list_generated_resumes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    match_id: int | None = None,
) -> list[GeneratedResumeResponse]:
    query = select(GeneratedResume).where(GeneratedResume.user_id == current_user.id)
    if match_id is not None:
        query = query.where(GeneratedResume.match_id == match_id)
    rows = db.scalars(query.order_by(GeneratedResume.updated_at.desc(), GeneratedResume.id.desc())).all()
    return [_generated_response(row) for row in rows]


@router.get("/{generated_id}", response_model=GeneratedResumeResponse)
def get_generated_resume(
    generated_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GeneratedResumeResponse:
    return _generated_response(_generated_for_user(db, generated_id, current_user.id))


@router.put("/{generated_id}", response_model=GeneratedResumeResponse)
def update_generated_resume(
    generated_id: int,
    payload: GeneratedResumeUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GeneratedResumeResponse:
    generated = _generated_for_user(db, generated_id, current_user.id)
    _validate_latex_source(payload.latex_source)
    generated.latex_source = payload.latex_source
    generated.compile_status = "not_compiled"
    generated.compile_log = ""
    storage.put_text(generated.latex_path, payload.latex_source, content_type="application/x-tex")
    db.commit()
    db.refresh(generated)
    return _generated_response(generated)


@router.post("/{generated_id}/compile", response_model=GeneratedResumeResponse)
def compile_generated_resume(
    generated_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GeneratedResumeResponse:
    generated = _generated_for_user(db, generated_id, current_user.id)
    _compile_generated_resume(db, generated)
    return _generated_response(generated)


@router.delete("/{generated_id}", response_model=dict[str, str])
def delete_generated_resume(
    generated_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    generated = _generated_for_user(db, generated_id, current_user.id)
    storage.delete(generated.latex_path)
    if generated.pdf_path:
        storage.delete(generated.pdf_path)
    db.delete(generated)
    db.commit()
    return {"message": "Generated resume deleted."}


@router.get("/{generated_id}/download/{kind}")
def download_generated_resume(
    generated_id: int,
    kind: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    generated = _generated_for_user(db, generated_id, current_user.id)
    if kind == "tex":
        key = generated.latex_path
        media_type = "application/x-tex"
        filename = f"{generated.file_base}.tex"
    elif kind == "pdf":
        if not generated.pdf_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF has not been compiled yet.")
        key = generated.pdf_path
        media_type = "application/pdf"
        filename = f"{generated.file_base}.pdf"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Download kind must be 'tex' or 'pdf'.")
    if not storage.exists(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated file not found.")
    if get_settings().storage_backend == "s3":
        url = storage.presigned_url(key, expires=300)
        if url:
            return RedirectResponse(url, status_code=302)
    if get_settings().storage_backend == "local":
        local = Path(get_settings().storage_dir) / key
        return FileResponse(local, media_type=media_type, filename=filename)
    data = storage.get_bytes(key)
    return Response(content=data, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _match_for_user(db: Session, match_id: int, user_id: int) -> JobMatch:
    match = db.scalar(
        select(JobMatch)
        .options(joinedload(JobMatch.job))
        .where(JobMatch.id == match_id, JobMatch.user_id == user_id)
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job match not found.")
    return match


def _latest_resume(db: Session, user_id: int) -> Resume:
    resume = db.scalar(
        select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc(), Resume.id.desc())
    )
    if resume is None or not resume.extracted_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a readable master resume first.")
    return resume


def _generated_for_user(db: Session, generated_id: int, user_id: int) -> GeneratedResume:
    generated = db.scalar(select(GeneratedResume).where(GeneratedResume.id == generated_id, GeneratedResume.user_id == user_id))
    if generated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated resume not found.")
    return generated


def _compile_generated_resume(db: Session, generated: GeneratedResume) -> None:
    # Persist source, mark pending, dispatch compile to an ephemeral worker.
    # The worker process (local subprocess or ECS RunTask) updates the DB row
    # with final status/pdf_path when done. In ECS mode the API call returns
    # immediately while the task runs asynchronously.
    storage.put_text(generated.latex_path, generated.latex_source, content_type="application/x-tex")
    pdf_key = str(Path(generated.latex_path).with_suffix(".pdf"))
    generated.compile_status = "pending"
    generated.compile_log = ""
    db.commit()
    db.refresh(generated)

    result = dispatch_compile(generated.id, generated.latex_path, pdf_key)

    # Local mode finishes synchronously: re-read the row to surface the result.
    if result.get("mode") == "local":
        db.refresh(generated)
        if result.get("returncode") not in (0, None) and generated.compile_status == "pending":
            generated.compile_status = "failed"
            generated.compile_log = _friendly_compile_log(
                (result.get("stderr") or "") + (result.get("stdout") or "")
            )
            db.commit()
            db.refresh(generated)
        return

    # ECS mode: status remains "pending" until the spawned task updates it.
    if result.get("failures"):
        generated.compile_status = "failed"
        generated.compile_log = f"ECS RunTask failed: {result['failures']}"
        db.commit()
        db.refresh(generated)


def _generated_response(generated: GeneratedResume) -> GeneratedResumeResponse:
    return GeneratedResumeResponse(
        id=generated.id,
        match_id=generated.match_id,
        resume_id=generated.resume_id,
        company=generated.company,
        position=generated.position,
        file_base=generated.file_base,
        latex_source=generated.latex_source,
        compile_status=generated.compile_status,
        compile_log=generated.compile_log or "",
        has_pdf=bool(generated.pdf_path and storage.exists(generated.pdf_path)),
        model=generated.model,
        token_usage={
            "prompt_tokens": generated.prompt_tokens,
            "completion_tokens": generated.completion_tokens,
            "total_tokens": generated.total_tokens,
        },
        created_at=generated.created_at,
        updated_at=generated.updated_at,
    )


def _friendly_compile_log(log: str) -> str:
    missing_package = re.search(r"LaTeX Error: File `([^`]+)' not found", log)
    if missing_package:
        package = missing_package.group(1)
        return (
            f"Missing LaTeX package: {package}. Rebuild the backend image after updating the Dockerfile, "
            "then recompile this resume.\n\n"
            f"{log[-6000:]}"
        )
    return log[-8000:]


def _validate_latex_source(source: str) -> None:
    blocked_patterns = {
        r"\\write18\b": "\\write18",
        r"\\input\b": "\\input",
        r"\\include\b": "\\include",
        r"\\openin\b": "\\openin",
        r"\\openout\b": "\\openout",
        r"\\read\b": "\\read",
        r"\\write\b": "\\write",
        r"\\catcode\b": "\\catcode",
        r"\\csname\b": "\\csname",
        r"\\newread\b": "\\newread",
        r"\\newwrite\b": "\\newwrite",
        r"\\usepackage\s*\{shellesc\}": "shellesc package",
    }
    for pattern, label in blocked_patterns.items():
        if re.search(pattern, source, flags=re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"LaTeX contains blocked command: {label}. Remove it before compiling.",
            )


def _resume_alignment_prompt(
    db: Session,
    match: JobMatch,
    resume: Resume,
    extraction: ResumeExtraction | None,
    jd_override: str | None = None,
) -> str:
    source_resume = _source_resume_text(resume)
    extracted_profile = loads_json(extraction.payload_json, {}) if extraction is not None else {}
    bundle = get_prompt_bundle(db, "resume_alignment")
    # User-pasted JD treated as untrusted data. Sanitized + wrapped in
    # untrusted_block so prompt injection inside it is neutralized and
    # the model is told to treat the body as data only.
    if jd_override and jd_override.strip():
        jd_block = untrusted_block("job_description_user_pasted", jd_override, 18000)
    else:
        jd_block = untrusted_block("job_description", _job_description(match), 18000)
    prompt = _render_template(
        bundle.task_template,
        {
            "resume_content": untrusted_block("master_resume", source_resume, 24000),
            "extracted_profile": untrusted_block("extracted_profile", str(extracted_profile), 12000),
            "jd": jd_block,
            "locked_template": LOCKED_RESUME_TEMPLATE,
        },
    )
    return f"{prompt}{extra_block(db, 'resume_alignment')}"


def _render_template(template: str, values: dict[str, str]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace("{" + key + "}", value)
    return rendered


def _source_resume_text(resume: Resume) -> str:
    key = resume.file_path
    if key.lower().endswith(".tex") and storage.exists(key):
        try:
            return storage.get_text(key)
        except UnicodeDecodeError:
            return storage.get_bytes(key).decode("utf-8", errors="ignore")
    return resume.extracted_text


def _job_description(match: JobMatch) -> str:
    job = match.job
    parts = [
        f"Title: {job.title}",
        f"Company: {job.company}",
        f"Location: {job.location}",
        f"Source: {job.source}",
        f"Status: {job.application_status}",
        f"Matched skills: {sanitize_untrusted_text(str(loads_json(match.skill_matches_json, [])), 4000)}",
        f"Gaps: {sanitize_untrusted_text(str(loads_json(match.skill_gaps_json, [])), 4000)}",
        f"Resume alignment notes: {sanitize_untrusted_text(str(loads_json(match.resume_alignment_json, [])), 4000)}",
        "",
        sanitize_untrusted_text(job.description, 12000),
    ]
    return "\n".join(parts)


def _file_base(user: User, match: JobMatch) -> str:
    username = (user.full_name or user.email.split("@")[0] or "user").strip()
    return "_".join(
        part for part in (_slug(username), _slug(match.job.company), _slug(match.job.title)) if part
    )[:180]


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value.strip()).strip("_").lower()
    return cleaned or "resume"


def _strip_markdown_fence(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:latex|tex)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()
