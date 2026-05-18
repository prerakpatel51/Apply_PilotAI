from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.db import Resume, ResumeExtraction, User, UserProfile
from app.schemas.api import (
    MessageResponse,
    ProfilePayload,
    ProfileResponse,
    ResumeExtractionResponse,
    ResumeResponse,
)
from app.services.agents import run_resume_extraction
from app.services.json_utils import dumps_json, loads_json
from app.services.resume_parser import extract_resume_text, save_upload, validate_resume_filename


router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def get_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProfileResponse:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == current_user.id))
    if profile is None:
        return ProfileResponse()
    return ProfileResponse(
        id=profile.id,
        target_role=profile.target_role,
        alternative_titles=profile.alternative_titles,
        sponsorship_status=profile.sponsorship_status,
        skills_text=profile.skills_text,
        preferred_locations=profile.preferred_locations,
        remote_preference=profile.remote_preference,
        career_level=profile.career_level,
        clearance_status=profile.clearance_status,
        notes=profile.notes,
        updated_at=profile.updated_at,
    )


@router.put("", response_model=ProfileResponse)
def save_profile(
    payload: ProfilePayload,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProfileResponse:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == current_user.id))
    if profile is None:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    profile.target_role = payload.target_role.strip()
    profile.alternative_titles = payload.alternative_titles.strip()
    profile.sponsorship_status = payload.sponsorship_status.strip()
    profile.skills_text = payload.skills_text.strip()
    profile.preferred_locations = payload.preferred_locations.strip()
    profile.remote_preference = payload.remote_preference
    profile.career_level = payload.career_level.strip()
    profile.clearance_status = payload.clearance_status.strip()
    profile.notes = payload.notes.strip()
    db.commit()
    db.refresh(profile)
    return ProfileResponse(
        id=profile.id,
        target_role=profile.target_role,
        alternative_titles=profile.alternative_titles,
        sponsorship_status=profile.sponsorship_status,
        skills_text=profile.skills_text,
        preferred_locations=profile.preferred_locations,
        remote_preference=profile.remote_preference,
        career_level=profile.career_level,
        clearance_status=profile.clearance_status,
        notes=profile.notes,
        updated_at=profile.updated_at,
    )


@router.post("/resume", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> ResumeResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume filename is required.")

    try:
        validate_resume_filename(file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    suffix = Path(file.filename).suffix.lower()
    relative_path = Path("resumes") / str(current_user.id) / f"{uuid4().hex}{suffix}"
    data = await _read_upload_bytes(file)
    from app.services import storage as _storage
    _storage.put_bytes(str(relative_path), data, content_type=file.content_type or "application/octet-stream")

    try:
        extracted_text = _decode_resume_bytes(data)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not read resume: {exc}") from exc

    resume = Resume(
        user_id=current_user.id,
        file_name=file.filename,
        file_path=str(relative_path),
        content_type=file.content_type,
        extracted_text=extracted_text,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _resume_response(resume)


@router.get("/resumes", response_model=list[ResumeResponse])
def list_resumes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ResumeResponse]:
    resumes = db.scalars(
        select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.created_at.desc(), Resume.id.desc())
    ).all()
    return [_resume_response(resume) for resume in resumes]


@router.delete("/resumes/{resume_id}", response_model=MessageResponse)
def delete_resume(
    resume_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    resume = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    from app.services import storage as _storage
    _storage.delete(resume.file_path)
    db.delete(resume)
    db.commit()
    return MessageResponse(message="Resume deleted.")


@router.post(
    "/resume/{resume_id}/extract",
    response_model=ResumeExtractionResponse,
    status_code=status.HTTP_200_OK,
)
def extract_resume_profile(
    resume_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    x_provider_api_key: Annotated[str | None, Header(alias="X-Provider-Api-Key")] = None,
) -> ResumeExtractionResponse:
    if not x_provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your provider key is stored only in this browser session. Re-enter it on the API provider page.",
        )
    resume = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    if not resume.extracted_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume has no readable text.")

    try:
        payload, provider = run_resume_extraction(db, current_user.id, resume, x_provider_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - provider errors bubble up to client
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Extraction failed: {exc}") from exc

    extraction = db.scalar(select(ResumeExtraction).where(ResumeExtraction.resume_id == resume.id))
    if extraction is None:
        extraction = ResumeExtraction(resume_id=resume.id, user_id=current_user.id)
        db.add(extraction)

    extraction.payload_json = dumps_json(payload)
    extraction.model = getattr(provider, "config", None).model if getattr(provider, "config", None) else ""
    extraction.prompt_tokens = int(getattr(provider, "prompt_tokens", 0) or 0)
    extraction.completion_tokens = int(getattr(provider, "completion_tokens", 0) or 0)
    extraction.total_tokens = int(getattr(provider, "total_tokens", 0) or 0)
    db.commit()
    db.refresh(extraction)
    return _extraction_response(extraction, resume)


@router.get("/resume/{resume_id}/extract", response_model=ResumeExtractionResponse)
def get_resume_extraction(
    resume_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ResumeExtractionResponse:
    resume = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    extraction = db.scalar(select(ResumeExtraction).where(ResumeExtraction.resume_id == resume.id))
    if extraction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No extraction yet.")
    return _extraction_response(extraction, resume)


def _extraction_response(extraction: ResumeExtraction, resume: Resume) -> ResumeExtractionResponse:
    return ResumeExtractionResponse(
        id=extraction.id,
        resume_id=extraction.resume_id,
        file_name=resume.file_name,
        payload=loads_json(extraction.payload_json, {}),
        model=extraction.model,
        token_usage={
            "prompt_tokens": extraction.prompt_tokens,
            "completion_tokens": extraction.completion_tokens,
            "total_tokens": extraction.total_tokens,
        },
        created_at=extraction.created_at,
        updated_at=extraction.updated_at,
    )


def _resume_response(resume: Resume) -> ResumeResponse:
    preview = " ".join(resume.extracted_text.split())[:500]
    return ResumeResponse(
        id=resume.id,
        file_name=resume.file_name,
        content_type=resume.content_type,
        extracted_preview=preview,
        created_at=resume.created_at,
    )


async def _read_upload_bytes(upload) -> bytes:
    chunks: list[bytes] = []
    total = 0
    max_bytes = 5 * 1024 * 1024  # 5 MB hard cap
    while chunk := await upload.read(1024 * 1024):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Resume exceeds 5 MB.")
        chunks.append(chunk)
    return b"".join(chunks)


def _decode_resume_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore").strip()
