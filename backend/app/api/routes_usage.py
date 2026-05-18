from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.db import ProviderCredential, ResumeExtraction, SearchRun, User


router = APIRouter(prefix="/usage", tags=["usage"])


class TokenBreakdown(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class CurrentRun(BaseModel):
    id: int
    user_run_number: int | None = None
    status: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    started_at: datetime
    updated_at: datetime | None = None


class UsageEvent(BaseModel):
    kind: str  # "search_run" | "resume_extraction"
    id: int
    label: str
    status: str
    provider: str | None = None
    model: str | None = None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    at: datetime


class UsageResponse(BaseModel):
    provider: str | None = None
    model: str | None = None
    lifetime: TokenBreakdown = Field(default_factory=TokenBreakdown)
    search_runs: TokenBreakdown = Field(default_factory=TokenBreakdown)
    extractions: TokenBreakdown = Field(default_factory=TokenBreakdown)
    current_run: CurrentRun | None = None
    last_run_total: int = 0
    events: list[UsageEvent] = Field(default_factory=list)
    server_time: datetime


@router.get("", response_model=UsageResponse)
def get_usage(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UsageResponse:
    credential = db.scalar(
        select(ProviderCredential)
        .where(ProviderCredential.user_id == current_user.id, ProviderCredential.is_active.is_(True))
        .order_by(ProviderCredential.updated_at.desc(), ProviderCredential.id.desc())
    )

    runs_sum = db.execute(
        select(
            func.coalesce(func.sum(SearchRun.prompt_tokens), 0),
            func.coalesce(func.sum(SearchRun.completion_tokens), 0),
            func.coalesce(func.sum(SearchRun.total_tokens), 0),
        ).where(SearchRun.user_id == current_user.id)
    ).one()

    ext_sum = db.execute(
        select(
            func.coalesce(func.sum(ResumeExtraction.prompt_tokens), 0),
            func.coalesce(func.sum(ResumeExtraction.completion_tokens), 0),
            func.coalesce(func.sum(ResumeExtraction.total_tokens), 0),
        ).where(ResumeExtraction.user_id == current_user.id)
    ).one()

    search_runs = TokenBreakdown(
        prompt_tokens=int(runs_sum[0] or 0),
        completion_tokens=int(runs_sum[1] or 0),
        total_tokens=int(runs_sum[2] or 0),
    )
    extractions = TokenBreakdown(
        prompt_tokens=int(ext_sum[0] or 0),
        completion_tokens=int(ext_sum[1] or 0),
        total_tokens=int(ext_sum[2] or 0),
    )
    lifetime = TokenBreakdown(
        prompt_tokens=search_runs.prompt_tokens + extractions.prompt_tokens,
        completion_tokens=search_runs.completion_tokens + extractions.completion_tokens,
        total_tokens=search_runs.total_tokens + extractions.total_tokens,
    )

    active = db.scalar(
        select(SearchRun)
        .where(SearchRun.user_id == current_user.id, SearchRun.status.in_(("pending", "running")))
        .order_by(SearchRun.created_at.desc(), SearchRun.id.desc())
    )
    current_run = None
    if active is not None:
        current_run = CurrentRun(
            id=active.id,
            user_run_number=active.user_run_number,
            status=active.status,
            prompt_tokens=int(active.prompt_tokens or 0),
            completion_tokens=int(active.completion_tokens or 0),
            total_tokens=int(active.total_tokens or 0),
            started_at=active.created_at,
            updated_at=active.completed_at,
        )

    last_run_total = 0
    last_run = db.scalar(
        select(SearchRun)
        .where(SearchRun.user_id == current_user.id)
        .order_by(SearchRun.created_at.desc(), SearchRun.id.desc())
    )
    if last_run is not None:
        last_run_total = int(last_run.total_tokens or 0)

    recent_runs = db.scalars(
        select(SearchRun)
        .where(SearchRun.user_id == current_user.id)
        .order_by(SearchRun.created_at.desc(), SearchRun.id.desc())
        .limit(25)
    ).all()
    recent_exts = db.scalars(
        select(ResumeExtraction)
        .where(ResumeExtraction.user_id == current_user.id)
        .order_by(ResumeExtraction.updated_at.desc(), ResumeExtraction.id.desc())
        .limit(25)
    ).all()

    events: list[UsageEvent] = []
    for r in recent_runs:
        events.append(
            UsageEvent(
                kind="search_run",
                id=r.id,
                label=f"Search run #{r.user_run_number or r.id}",
                status=r.status,
                provider=r.provider,
                model=r.model or None,
                prompt_tokens=int(r.prompt_tokens or 0),
                completion_tokens=int(r.completion_tokens or 0),
                total_tokens=int(r.total_tokens or 0),
                at=r.completed_at or r.created_at,
            )
        )
    for e in recent_exts:
        events.append(
            UsageEvent(
                kind="resume_extraction",
                id=e.id,
                label=f"Resume extraction #{e.id}",
                status="completed",
                provider=credential.provider if credential else None,
                model=e.model or (credential.model if credential else None),
                prompt_tokens=int(e.prompt_tokens or 0),
                completion_tokens=int(e.completion_tokens or 0),
                total_tokens=int(e.total_tokens or 0),
                at=e.updated_at,
            )
        )
    events.sort(key=lambda ev: ev.at, reverse=True)
    events = events[:40]

    return UsageResponse(
        provider=credential.provider if credential else None,
        model=credential.model if credential else None,
        lifetime=lifetime,
        search_runs=search_runs,
        extractions=extractions,
        current_run=current_run,
        last_run_total=last_run_total,
        events=events,
        server_time=datetime.utcnow(),
    )
