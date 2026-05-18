from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.db import GeneratedResume, JobMatch, ProviderCredential, SearchRun, User, UserSeenJob
from app.queue import enqueue_search_run
from app.services.rate_limit import enforce_search_rate_limit
from app.schemas.api import JobListingResponse, JobMatchResponse, MessageResponse, SearchRunResponse, SeenJobResponse
from app.services.json_utils import loads_json


router = APIRouter(prefix="/search-runs", tags=["search"])


@router.post("", response_model=SearchRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_search_run(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    x_provider_api_key: Annotated[str | None, Header(alias="X-Provider-Api-Key")] = None,
) -> SearchRunResponse:
    if not x_provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your provider key is stored only in this browser session. Re-enter it on the API provider page.",
        )
    credential = db.scalar(
        select(ProviderCredential)
        .where(ProviderCredential.user_id == current_user.id, ProviderCredential.is_active.is_(True))
        .order_by(ProviderCredential.updated_at.desc(), ProviderCredential.id.desc())
    )
    if credential is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Save an active API provider first.")

    # Per-user run quota (Redis counter, hourly window).
    settings = get_settings()
    await enforce_search_rate_limit(current_user.id, settings.search_runs_per_hour)

    # One in-flight run per user.
    in_flight = db.scalar(
        select(SearchRun).where(
            SearchRun.user_id == current_user.id,
            SearchRun.status.in_(("pending", "running")),
        )
    )
    if in_flight is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Run #{in_flight.id} is still {in_flight.status}. Wait for it to finish.",
        )

    next_number = int(
        db.scalar(select(func.coalesce(func.max(SearchRun.user_run_number), 0)).where(SearchRun.user_id == current_user.id))
        or 0
    ) + 1
    run = SearchRun(
        user_id=current_user.id,
        provider=credential.provider,
        model=credential.model,
        user_run_number=next_number,
        status="pending",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    await enqueue_search_run(run.id, x_provider_api_key)
    return _run_response(run)


@router.get("", response_model=list[SearchRunResponse])
def list_search_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SearchRunResponse]:
    runs = db.scalars(
        select(SearchRun).where(SearchRun.user_id == current_user.id).order_by(SearchRun.created_at.desc())
    ).all()
    return [_run_response(run) for run in runs]


@router.get("/seen-jobs", response_model=list[SeenJobResponse])
def list_seen_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SeenJobResponse]:
    seen_jobs = db.scalars(
        select(UserSeenJob)
        .options(joinedload(UserSeenJob.job))
        .where(UserSeenJob.user_id == current_user.id)
        .order_by(UserSeenJob.last_seen_at.desc())
        .limit(80)
    ).all()
    return [
        SeenJobResponse(
            id=item.id,
            first_seen_at=item.first_seen_at,
            last_seen_at=item.last_seen_at,
            job=_job_response(item.job),
        )
        for item in seen_jobs
    ]


@router.get("/{run_id}", response_model=SearchRunResponse)
def get_search_run(
    run_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SearchRunResponse:
    run = db.scalar(select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found.")
    return _run_response(run)


@router.get("/{run_id}/matches", response_model=list[JobMatchResponse])
def get_search_matches(
    run_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[JobMatchResponse]:
    run = db.scalar(select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found.")

    matches = db.scalars(
        select(JobMatch)
        .options(joinedload(JobMatch.job))
        .where(JobMatch.run_id == run_id, JobMatch.user_id == current_user.id)
        .order_by(JobMatch.is_new_to_user.desc(), JobMatch.score.desc())
    ).all()
    return [_match_response(match) for match in matches]


@router.get("/{run_id}/matches/{match_id}", response_model=JobMatchResponse)
def get_search_match(
    run_id: int,
    match_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobMatchResponse:
    match = db.scalar(
        select(JobMatch)
        .options(joinedload(JobMatch.job))
        .where(
            JobMatch.id == match_id,
            JobMatch.run_id == run_id,
            JobMatch.user_id == current_user.id,
        )
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job match not found.")
    return _match_response(match)


@router.delete("/seen-jobs", response_model=MessageResponse)
def clear_seen_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    rows = db.scalars(select(UserSeenJob).where(UserSeenJob.user_id == current_user.id)).all()
    for row in rows:
        db.delete(row)
    db.commit()
    return MessageResponse(message=f"Cleared {len(rows)} seen job(s).")


@router.delete("/seen-jobs/{seen_id}", response_model=MessageResponse)
def delete_seen_job(
    seen_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    seen = db.scalar(select(UserSeenJob).where(UserSeenJob.id == seen_id, UserSeenJob.user_id == current_user.id))
    if seen is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seen job not found.")
    db.delete(seen)
    db.commit()
    return MessageResponse(message="Seen job removed.")


@router.delete("/{run_id}", response_model=MessageResponse)
def delete_search_run(
    run_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    run = db.scalar(select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found.")
    if run.status in ("pending", "running"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wait for the run to finish, or kill it from Admin.")
    generated = db.scalars(select(GeneratedResume).where(GeneratedResume.user_id == current_user.id, GeneratedResume.match_id.in_(
        select(JobMatch.id).where(JobMatch.run_id == run_id, JobMatch.user_id == current_user.id)
    ))).all()
    for row in generated:
        db.delete(row)
    # JobMatch rows cascade via relationship cascade="all, delete-orphan" on SearchRun.matches
    db.delete(run)
    db.commit()
    return MessageResponse(message=f"Search run #{run_id} deleted.")


@router.delete("/{run_id}/matches/{match_id}", response_model=MessageResponse)
def delete_search_match(
    run_id: int,
    match_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    match = db.scalar(
        select(JobMatch).where(
            JobMatch.id == match_id,
            JobMatch.run_id == run_id,
            JobMatch.user_id == current_user.id,
        )
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job match not found.")

    generated = db.scalars(
        select(GeneratedResume).where(GeneratedResume.user_id == current_user.id, GeneratedResume.match_id == match.id)
    ).all()
    for row in generated:
        db.delete(row)
    db.delete(match)
    db.commit()
    return MessageResponse(message="Job removed from this search.")


def _run_response(run: SearchRun) -> SearchRunResponse:
    return SearchRunResponse(
        id=run.id,
        user_run_number=run.user_run_number,
        provider=run.provider,
        model=run.model or None,
        status=run.status,
        keywords=loads_json(run.keywords_json, {}),
        token_usage={
            "prompt_tokens": run.prompt_tokens,
            "completion_tokens": run.completion_tokens,
            "total_tokens": run.total_tokens,
        },
        error_message=run.error_message,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


def _match_response(match: JobMatch) -> JobMatchResponse:
    job = match.job
    return JobMatchResponse(
        id=match.id,
        score=match.score,
        skill_matches=loads_json(match.skill_matches_json, []),
        skill_gaps=loads_json(match.skill_gaps_json, []),
        resume_alignment=loads_json(match.resume_alignment_json, []),
        rationale=match.rationale,
        is_new_to_user=match.is_new_to_user,
        job=_job_response(job),
    )


def _job_response(job) -> JobListingResponse:
    description = (job.description or "").strip()
    # Backfill from raw_json for legacy rows where ranking step stripped the
    # JD before persistence.
    if not description:
        raw = loads_json(job.raw_json or "{}", {}) if hasattr(job, "raw_json") else {}
        discovery = raw.get("discovery") if isinstance(raw, dict) else {}
        ranking = raw.get("ranking") if isinstance(raw, dict) else {}
        parts: list[str] = []
        for src in (discovery or {}), (ranking or {}):
            if not isinstance(src, dict):
                continue
            d = str(src.get("description") or "").strip()
            if d and d not in parts:
                parts.append(d)
            ex = str(src.get("source_excerpt") or "").strip()
            if ex and ex not in parts:
                parts.append(f"Evidence from listing: {ex}")
        # Older rows have raw_json as the bare ranking item (no nested keys).
        if isinstance(raw, dict) and "description" in raw:
            d = str(raw.get("description") or "").strip()
            if d and d not in parts:
                parts.append(d)
        if isinstance(raw, dict) and "source_excerpt" in raw:
            ex = str(raw.get("source_excerpt") or "").strip()
            if ex and ex not in parts:
                parts.append(f"Evidence from listing: {ex}")
        if parts:
            description = "\n\n".join(parts)
        else:
            description = "No description was captured. Score was based on title, company, location and your profile."
    return JobListingResponse(
        id=job.id,
        title=job.title,
        company=job.company,
        location=job.location,
        url=job.url,
        source=job.source,
        posted_at=job.posted_at,
        application_status=job.application_status,
        description=description,
    )
