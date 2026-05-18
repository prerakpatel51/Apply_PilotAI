from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin
from app.api.routes_auth import delete_user_data
from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.db import (
    AuditLog,
    AgentPromptConfig,
    JobListing,
    JobMatch,
    ProviderCredential,
    Resume,
    ResumeExtraction,
    SearchRun,
    User,
    UserProfile,
    UserSeenJob,
)
from app.schemas.api import (
    AdminAnalytics,
    AdminAgentPromptResponse,
    AdminAgentPromptUpdate,
    AdminAuditEntry,
    AdminCreateUserPayload,
    AdminFailedRun,
    AdminLiveRun,
    AdminQueueStats,
    AdminSystem,
    AdminUpdateUserPayload,
    AdminUserDetail,
    AdminUserSummary,
    MessageResponse,
)
from app.services.agent_prompts import DEFAULT_AGENT_PROMPTS, ensure_default_prompt_rows
from app.services.json_utils import dumps_json, loads_json


router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- helpers ----------


def _record_audit(
    db: Session,
    actor: User,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id,
            actor_email=actor.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail_json=dumps_json(detail or {}),
        )
    )


def _user_summary_from_row(
    user: User,
    runs_agg: tuple[int, int, int, int, datetime | None],
    ext_agg: tuple[int, int, int, int, datetime | None],
    cred: ProviderCredential | None,
) -> AdminUserSummary:
    last_active = max([d for d in (runs_agg[4], ext_agg[4], user.created_at) if d is not None])
    return AdminUserSummary(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_admin=bool(user.is_admin),
        is_active=bool(user.is_active),
        suspended_at=user.suspended_at,
        suspended_reason=user.suspended_reason,
        created_at=user.created_at,
        provider=cred.provider if cred else None,
        model=cred.model if cred else None,
        search_runs=runs_agg[0],
        extractions=ext_agg[0],
        prompt_tokens=runs_agg[1] + ext_agg[1],
        completion_tokens=runs_agg[2] + ext_agg[2],
        total_tokens=runs_agg[3] + ext_agg[3],
        last_active_at=last_active,
    )


def _aggregate(db: Session) -> tuple[dict[int, Any], dict[int, Any], dict[int, ProviderCredential]]:
    run_rows = db.execute(
        select(
            SearchRun.user_id,
            func.count(SearchRun.id),
            func.coalesce(func.sum(SearchRun.prompt_tokens), 0),
            func.coalesce(func.sum(SearchRun.completion_tokens), 0),
            func.coalesce(func.sum(SearchRun.total_tokens), 0),
            func.max(SearchRun.created_at),
        ).group_by(SearchRun.user_id)
    ).all()
    ext_rows = db.execute(
        select(
            ResumeExtraction.user_id,
            func.count(ResumeExtraction.id),
            func.coalesce(func.sum(ResumeExtraction.prompt_tokens), 0),
            func.coalesce(func.sum(ResumeExtraction.completion_tokens), 0),
            func.coalesce(func.sum(ResumeExtraction.total_tokens), 0),
            func.max(ResumeExtraction.updated_at),
        ).group_by(ResumeExtraction.user_id)
    ).all()
    runs_by: dict[int, Any] = {r[0]: (int(r[1]), int(r[2]), int(r[3]), int(r[4]), r[5]) for r in run_rows}
    ext_by: dict[int, Any] = {r[0]: (int(r[1]), int(r[2]), int(r[3]), int(r[4]), r[5]) for r in ext_rows}
    creds = db.scalars(
        select(ProviderCredential).where(ProviderCredential.is_active.is_(True))
    ).all()
    cred_by: dict[int, ProviderCredential] = {}
    for c in creds:
        cred_by.setdefault(c.user_id, c)
    return runs_by, ext_by, cred_by


# ---------- users ----------


@router.get("/agent-prompts", response_model=list[AdminAgentPromptResponse])
def list_agent_prompts(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminAgentPromptResponse]:
    ensure_default_prompt_rows(db)
    rows = db.scalars(select(AgentPromptConfig).order_by(AgentPromptConfig.agent_key)).all()
    return [_agent_prompt_response(row) for row in rows]


@router.put("/agent-prompts/{agent_key}", response_model=AdminAgentPromptResponse)
def update_agent_prompt(
    agent_key: str,
    payload: AdminAgentPromptUpdate,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminAgentPromptResponse:
    if agent_key not in DEFAULT_AGENT_PROMPTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent prompt not found.")
    ensure_default_prompt_rows(db)
    row = db.scalar(select(AgentPromptConfig).where(AgentPromptConfig.agent_key == agent_key))
    if row is None:
        defaults = DEFAULT_AGENT_PROMPTS[agent_key]
        row = AgentPromptConfig(agent_key=agent_key, label=defaults.label)
        db.add(row)
    row.system_prompt = payload.system_prompt.strip()
    row.task_template = payload.task_template.strip()
    row.extra_instructions = payload.extra_instructions.strip()
    row.is_enabled = payload.is_enabled
    _record_audit(db, admin, "agent_prompt_update", "agent_prompt", row.id, {"agent_key": agent_key})
    db.commit()
    db.refresh(row)
    return _agent_prompt_response(row)


@router.post("/agent-prompts/{agent_key}/reset", response_model=AdminAgentPromptResponse)
def reset_agent_prompt(
    agent_key: str,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminAgentPromptResponse:
    defaults = DEFAULT_AGENT_PROMPTS.get(agent_key)
    if defaults is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent prompt not found.")
    ensure_default_prompt_rows(db)
    row = db.scalar(select(AgentPromptConfig).where(AgentPromptConfig.agent_key == agent_key))
    if row is None:
        row = AgentPromptConfig(agent_key=agent_key)
        db.add(row)
    row.label = defaults.label
    row.system_prompt = defaults.system_prompt
    row.task_template = defaults.task_template
    row.extra_instructions = defaults.extra_instructions
    row.is_enabled = True
    _record_audit(db, admin, "agent_prompt_reset", "agent_prompt", row.id, {"agent_key": agent_key})
    db.commit()
    db.refresh(row)
    return _agent_prompt_response(row)


def _agent_prompt_response(row: AgentPromptConfig) -> AdminAgentPromptResponse:
    defaults = DEFAULT_AGENT_PROMPTS.get(row.agent_key)
    return AdminAgentPromptResponse(
        agent_key=row.agent_key,
        label=row.label or (defaults.label if defaults else row.agent_key),
        system_prompt=row.system_prompt or (defaults.system_prompt if defaults else ""),
        task_template=row.task_template or (defaults.task_template if defaults else ""),
        extra_instructions=row.extra_instructions,
        is_enabled=row.is_enabled,
        updated_at=row.updated_at,
    )


@router.get("/users", response_model=list[AdminUserSummary])
def list_users(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminUserSummary]:
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all()
    runs_by, ext_by, cred_by = _aggregate(db)
    empty = (0, 0, 0, 0, None)
    return [
        _user_summary_from_row(u, runs_by.get(u.id, empty), ext_by.get(u.id, empty), cred_by.get(u.id))
        for u in users
    ]


@router.post("/users", response_model=AdminUserSummary, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminCreateUserPayload,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserSummary:
    email = payload.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")

    full_name = payload.full_name.strip() if payload.full_name else None
    user = User(
        email=email,
        full_name=full_name or None,
        hashed_password=get_password_hash(payload.password),
        is_admin=payload.is_admin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    _record_audit(
        db,
        admin,
        "user_create",
        "user",
        user.id,
        {"email": user.email, "is_admin": bool(user.is_admin)},
    )
    db.commit()
    db.refresh(user)
    runs_by, ext_by, cred_by = _aggregate(db)
    empty = (0, 0, 0, 0, None)
    return _user_summary_from_row(user, runs_by.get(user.id, empty), ext_by.get(user.id, empty), cred_by.get(user.id))


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
def update_user(
    user_id: int,
    payload: AdminUpdateUserPayload,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserSummary:
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    changes: dict[str, Any] = {}
    if payload.is_admin is not None and payload.is_admin != user.is_admin:
        if user.id == admin.id and not payload.is_admin:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot revoke your own admin role.")
        user.is_admin = payload.is_admin
        changes["is_admin"] = payload.is_admin
    if payload.is_active is not None and payload.is_active != user.is_active:
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot suspend yourself.")
        user.is_active = payload.is_active
        if payload.is_active:
            user.suspended_at = None
            user.suspended_reason = None
        else:
            user.suspended_at = datetime.now(timezone.utc)
            user.suspended_reason = payload.suspended_reason or "Suspended by admin."
        changes["is_active"] = payload.is_active
        changes["reason"] = user.suspended_reason
    if changes:
        _record_audit(db, admin, "user_update", "user", user.id, changes)
    db.commit()
    db.refresh(user)
    runs_by, ext_by, cred_by = _aggregate(db)
    empty = (0, 0, 0, 0, None)
    return _user_summary_from_row(user, runs_by.get(user.id, empty), ext_by.get(user.id, empty), cred_by.get(user.id))


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use ‘Delete my account’ instead.")
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    email = user.email
    delete_user_data(db, user.id)
    db.delete(user)
    _record_audit(db, admin, "user_delete", "user", user_id, {"email": email})
    db.commit()
    return MessageResponse(message="User deleted.")


@router.get("/users/{user_id}/detail", response_model=AdminUserDetail)
def user_detail(
    user_id: int,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDetail:
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    runs_by, ext_by, cred_by = _aggregate(db)
    empty = (0, 0, 0, 0, None)
    summary = _user_summary_from_row(user, runs_by.get(user.id, empty), ext_by.get(user.id, empty), cred_by.get(user.id))

    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    profile_dict = None
    if profile:
        profile_dict = {
            "target_role": profile.target_role,
            "career_level": profile.career_level,
            "sponsorship_status": profile.sponsorship_status,
            "clearance_status": profile.clearance_status,
            "skills_text": profile.skills_text,
            "preferred_locations": profile.preferred_locations,
            "remote_preference": profile.remote_preference,
            "notes": profile.notes,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }
    resumes = db.scalars(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc())
    ).all()
    runs = db.scalars(
        select(SearchRun).where(SearchRun.user_id == user.id).order_by(SearchRun.created_at.desc()).limit(50)
    ).all()
    extractions = db.scalars(
        select(ResumeExtraction)
        .where(ResumeExtraction.user_id == user.id)
        .order_by(ResumeExtraction.updated_at.desc())
        .limit(50)
    ).all()

    # 14-day token timeseries.
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    daily: dict[str, int] = {}
    for r in db.scalars(
        select(SearchRun).where(SearchRun.user_id == user.id, SearchRun.created_at >= cutoff)
    ).all():
        key = r.created_at.date().isoformat()
        daily[key] = daily.get(key, 0) + int(r.total_tokens or 0)
    for e in db.scalars(
        select(ResumeExtraction).where(ResumeExtraction.user_id == user.id, ResumeExtraction.updated_at >= cutoff)
    ).all():
        key = e.updated_at.date().isoformat()
        daily[key] = daily.get(key, 0) + int(e.total_tokens or 0)
    daily_series = [{"date": d, "tokens": daily[d]} for d in sorted(daily.keys())]

    return AdminUserDetail(
        user=summary,
        profile=profile_dict,
        resumes=[
            {
                "id": r.id,
                "file_name": r.file_name,
                "content_type": r.content_type,
                "preview": r.extracted_text[:400] if r.extracted_text else "",
                "created_at": r.created_at.isoformat(),
            }
            for r in resumes
        ],
        runs=[
            {
                "id": r.id,
                "status": r.status,
                "provider": r.provider,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "total_tokens": r.total_tokens,
                "error_message": r.error_message,
                "created_at": r.created_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ],
        extractions=[
            {
                "id": e.id,
                "resume_id": e.resume_id,
                "model": e.model,
                "total_tokens": e.total_tokens,
                "updated_at": e.updated_at.isoformat() if e.updated_at else None,
            }
            for e in extractions
        ],
        daily_tokens=daily_series,
    )


# ---------- runs ----------


def _run_stage(run: SearchRun) -> tuple[str, int]:
    keywords = loads_json(run.keywords_json, {})
    queries = keywords.get("search_queries") or []
    if run.status == "pending":
        return "queued", 0
    if not queries:
        return "generating_queries", 0
    if run.completion_tokens == 0:
        return "searching_listings", len(queries)
    return "verifying_and_ranking", len(queries)


@router.get("/runs/live", response_model=list[AdminLiveRun])
def live_runs(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminLiveRun]:
    rows = db.scalars(
        select(SearchRun)
        .where(SearchRun.status.in_(("pending", "running")))
        .order_by(SearchRun.created_at.desc())
    ).all()
    out: list[AdminLiveRun] = []
    emails = {u.id: u.email for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows}))).all()}
    now = datetime.now(timezone.utc)
    for r in rows:
        stage, queries = _run_stage(r)
        created = r.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        out.append(
            AdminLiveRun(
                id=r.id,
                user_id=r.user_id,
                user_email=emails.get(r.user_id, ""),
                provider=r.provider,
                status=r.status,
                created_at=created or r.created_at,
                elapsed_seconds=(now - created).total_seconds() if created else 0.0,
                prompt_tokens=r.prompt_tokens,
                completion_tokens=r.completion_tokens,
                total_tokens=r.total_tokens,
                stage=stage,
                queries_generated=queries,
            )
        )
    return out


@router.post("/runs/{run_id}/kill", response_model=MessageResponse)
def kill_run(
    run_id: int,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    run = db.scalar(select(SearchRun).where(SearchRun.id == run_id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    if run.status in ("completed", "failed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run is not active.")
    run.status = "failed"
    run.error_message = f"Killed by admin {admin.email}."
    run.completed_at = datetime.now(timezone.utc)
    _record_audit(db, admin, "run_kill", "search_run", run.id, {"user_id": run.user_id})
    db.commit()
    return MessageResponse(message=f"Run #{run.id} marked failed. The worker will exit at its next checkpoint.")


@router.get("/runs/failed", response_model=list[AdminFailedRun])
def failed_runs(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminFailedRun]:
    rows = db.scalars(
        select(SearchRun).where(SearchRun.status == "failed").order_by(SearchRun.completed_at.desc()).limit(50)
    ).all()
    emails = {u.id: u.email for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows}))).all()}
    return [
        AdminFailedRun(
            id=r.id,
            user_id=r.user_id,
            user_email=emails.get(r.user_id, ""),
            provider=r.provider,
            error_message=r.error_message,
            fingerprint=hashlib.sha1((r.error_message or "").encode("utf-8")).hexdigest()[:10],
            created_at=r.created_at,
            completed_at=r.completed_at,
            total_tokens=r.total_tokens,
        )
        for r in rows
    ]


# ---------- audit ----------


@router.get("/audit", response_model=list[AdminAuditEntry])
def audit(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminAuditEntry]:
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)).all()
    return [
        AdminAuditEntry(
            id=r.id,
            actor_id=r.actor_id,
            actor_email=r.actor_email,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            detail=loads_json(r.detail_json, {}),
            created_at=r.created_at,
        )
        for r in rows
    ]


# ---------- queue ----------


async def _queue_stats() -> AdminQueueStats:
    """Arq stores the work queue as a sorted set scored by execute-at (ms epoch),
    and in-progress jobs as `arq:in-progress:<job_id>` keys. Read accordingly."""
    settings = get_settings()
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    try:
        queue_name = settings.queue_name
        queued = 0
        deferred = 0
        oldest: float | None = None
        try:
            now_ms = datetime.now(timezone.utc).timestamp() * 1000.0
            queued = int(await redis.zcount(queue_name, "-inf", now_ms))
            deferred = int(await redis.zcount(queue_name, f"({now_ms}", "+inf"))
            head = await redis.zrange(queue_name, 0, 0, withscores=True)
            if head:
                _, ts = head[0]
                oldest = max(0.0, (now_ms - float(ts)) / 1000.0)
        except Exception:
            # Either the key does not exist yet or has the wrong type from a previous
            # arq version. Either way, treat the queue as empty.
            pass

        in_progress = 0
        try:
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor=cursor, match="arq:in-progress:*", count=200)
                in_progress += len(keys)
                if cursor == 0:
                    break
        except Exception:
            pass

        return AdminQueueStats(
            queue_name=queue_name,
            queued=queued,
            in_progress=in_progress,
            deferred=deferred,
            failed_recent=0,
            oldest_pending_age_seconds=oldest,
        )
    finally:
        await redis.aclose()


@router.get("/queue", response_model=AdminQueueStats)
async def queue_stats(admin: Annotated[User, Depends(get_current_admin)]) -> AdminQueueStats:
    return await _queue_stats()


# ---------- analytics ----------


@router.get("/analytics", response_model=AdminAnalytics)
def analytics(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminAnalytics:
    total_users = db.scalar(select(func.count(User.id))) or 0
    with_provider = db.scalar(
        select(func.count(func.distinct(ProviderCredential.user_id))).where(ProviderCredential.is_active.is_(True))
    ) or 0
    with_resume = db.scalar(select(func.count(func.distinct(Resume.user_id)))) or 0
    with_first_run = db.scalar(select(func.count(func.distinct(SearchRun.user_id)))) or 0
    three_plus_rows = db.execute(
        select(SearchRun.user_id, func.count(SearchRun.id)).group_by(SearchRun.user_id)
    ).all()
    three_plus = sum(1 for _, c in three_plus_rows if int(c) >= 3)

    provider_mix_rows = db.execute(
        select(ProviderCredential.provider, func.count(ProviderCredential.id))
        .where(ProviderCredential.is_active.is_(True))
        .group_by(ProviderCredential.provider)
    ).all()
    model_mix_rows = db.execute(
        select(ProviderCredential.model, func.count(ProviderCredential.id))
        .where(ProviderCredential.is_active.is_(True))
        .group_by(ProviderCredential.model)
    ).all()

    avg_score = db.scalar(select(func.coalesce(func.avg(JobMatch.score), 0.0))) or 0.0
    buckets = {"0-49": 0, "50-69": 0, "70-84": 0, "85-94": 0, "95-100": 0}
    for s in db.scalars(select(JobMatch.score)).all():
        v = int(s or 0)
        key = "0-49" if v < 50 else "50-69" if v < 70 else "70-84" if v < 85 else "85-94" if v < 95 else "95-100"
        buckets[key] += 1

    src_rows = db.execute(
        select(JobListing.source, func.count(JobListing.id)).group_by(JobListing.source)
    ).all()
    company_rows = db.execute(
        select(JobListing.company, func.count(JobListing.id))
        .group_by(JobListing.company)
        .order_by(func.count(JobListing.id).desc())
        .limit(15)
    ).all()
    parse_failures = db.scalar(select(func.count(Resume.id)).where(Resume.extracted_text == "")) or 0

    yield_rows = db.execute(
        select(SearchRun.id, func.count(JobMatch.id))
        .join(JobMatch, JobMatch.run_id == SearchRun.id, isouter=True)
        .where(SearchRun.status == "completed")
        .group_by(SearchRun.id)
    ).all()
    with_results = sum(1 for _, c in yield_rows if int(c) > 0)
    no_results = sum(1 for _, c in yield_rows if int(c) == 0)

    return AdminAnalytics(
        funnel={
            "signups": int(total_users),
            "provider_connected": int(with_provider),
            "resume_uploaded": int(with_resume),
            "first_search": int(with_first_run),
            "three_plus_runs": int(three_plus),
        },
        provider_mix={p or "unknown": int(c) for p, c in provider_mix_rows},
        model_mix={m or "unknown": int(c) for m, c in model_mix_rows},
        match_score_avg=float(round(avg_score, 1)),
        match_score_buckets=buckets,
        job_sources={(s or "unknown"): int(c) for s, c in src_rows},
        top_companies=[{"company": (c or "unknown"), "count": int(n)} for c, n in company_rows],
        resume_parse_failures=int(parse_failures),
        search_yield={"with_results": with_results, "no_results": no_results},
    )


# ---------- system ----------


@router.get("/system", response_model=AdminSystem)
async def system(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminSystem:
    tables = {
        "users": User,
        "profiles": UserProfile,
        "resumes": Resume,
        "providers": ProviderCredential,
        "search_runs": SearchRun,
        "job_matches": JobMatch,
        "job_listings": JobListing,
        "seen_jobs": UserSeenJob,
        "resume_extractions": ResumeExtraction,
        "audit_logs": AuditLog,
    }
    rows = {name: int(db.scalar(select(func.count(model.id))) or 0) for name, model in tables.items()}
    total_bytes, file_count = _storage_usage()
    return AdminSystem(db_rows=rows, storage_bytes=total_bytes, storage_files=file_count, queue=await _queue_stats())


def _storage_usage() -> tuple[int, int]:
    settings = get_settings()
    if settings.storage_backend == "s3":
        try:
            import boto3
            client = boto3.client("s3", region_name=settings.s3_region)
            paginator = client.get_paginator("list_objects_v2")
            total = 0
            count = 0
            prefix = (settings.s3_prefix or "").lstrip("/")
            for page in paginator.paginate(Bucket=settings.s3_bucket, Prefix=prefix):
                for obj in page.get("Contents", []) or []:
                    total += int(obj.get("Size", 0))
                    count += 1
            return total, count
        except Exception:
            return 0, 0
    storage_dir = settings.storage_dir
    total = 0
    count = 0
    if os.path.isdir(storage_dir):
        for root, _, files in os.walk(storage_dir):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                    count += 1
                except OSError:
                    pass
    return total, count
