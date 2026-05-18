from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, select, text

from app.db.session import SessionLocal, engine
from app.models.db import Base, ProviderCredential, SearchRun, User
from app.core.security import decrypt_text, encrypt_text
from app.services.agent_prompts import ensure_default_prompt_rows
from app.services.json_utils import dumps_json, loads_json


ADMIN_SEED_EMAILS = {"patel.prerak2798@gmail.com"}


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_search_run_token_columns()
    _ensure_search_run_metadata_columns()
    _ensure_user_profile_columns()
    _ensure_user_admin_column()
    _ensure_user_suspend_columns()
    _ensure_user_password_reset_columns()
    _ensure_generated_resume_columns()
    _ensure_agent_prompt_config_columns()
    _seed_agent_prompts()
    _seed_admins()
    _sweep_orphan_runs()
    _purge_bedrock_credentials()
    _strip_persisted_provider_keys()


def _ensure_user_profile_columns() -> None:
    inspector = inspect(engine)
    if "user_profiles" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("user_profiles")}
    additions: list[tuple[str, str]] = []
    if "clearance_status" not in existing:
        additions.append(("clearance_status", "VARCHAR(200) DEFAULT '' NOT NULL"))
    if "alternative_titles" not in existing:
        additions.append(("alternative_titles", "TEXT DEFAULT '' NOT NULL"))

    if not additions:
        return

    with engine.begin() as connection:
        for column, ddl in additions:
            connection.execute(text(f"ALTER TABLE user_profiles ADD COLUMN {column} {ddl}"))


def _ensure_user_admin_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    if "is_admin" in existing:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL"))


def _ensure_search_run_token_columns() -> None:
    inspector = inspect(engine)
    if "search_runs" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("search_runs")}
    missing = [
        column
        for column in ("prompt_tokens", "completion_tokens", "total_tokens")
        if column not in existing
    ]
    if not missing:
        return

    with engine.begin() as connection:
        for column in missing:
            connection.execute(text(f"ALTER TABLE search_runs ADD COLUMN {column} INTEGER DEFAULT 0 NOT NULL"))


def _ensure_search_run_metadata_columns() -> None:
    inspector = inspect(engine)
    if "search_runs" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("search_runs")}
    with engine.begin() as connection:
        if "model" not in existing:
            connection.execute(text("ALTER TABLE search_runs ADD COLUMN model VARCHAR(255) DEFAULT '' NOT NULL"))
        if "user_run_number" not in existing:
            connection.execute(text("ALTER TABLE search_runs ADD COLUMN user_run_number INTEGER NULL"))

    with SessionLocal() as db:
        users = db.scalars(select(User)).all()
        changed = False
        for user in users:
            rows = db.scalars(
                select(SearchRun)
                .where(SearchRun.user_id == user.id)
                .order_by(SearchRun.created_at.asc(), SearchRun.id.asc())
            ).all()
            for index, run in enumerate(rows, start=1):
                if run.user_run_number != index:
                    run.user_run_number = index
                    changed = True
        if changed:
            db.commit()


def _ensure_user_suspend_columns() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "is_active" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL"))
        if "suspended_at" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL"))
        if "suspended_reason" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN suspended_reason VARCHAR(500) NULL"))


def _ensure_user_password_reset_columns() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "password_reset_token_hash" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(128) NULL"))
        if "password_reset_expires_at" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_reset_expires_at TIMESTAMP NULL"))


def _ensure_generated_resume_columns() -> None:
    inspector = inspect(engine)
    if "generated_resumes" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("generated_resumes")}
    additions = {
        "compile_status": "VARCHAR(40) DEFAULT 'not_compiled' NOT NULL",
        "compile_log": "TEXT DEFAULT '' NOT NULL",
        "model": "VARCHAR(255) DEFAULT '' NOT NULL",
        "prompt_tokens": "INTEGER DEFAULT 0 NOT NULL",
        "completion_tokens": "INTEGER DEFAULT 0 NOT NULL",
        "total_tokens": "INTEGER DEFAULT 0 NOT NULL",
    }
    with engine.begin() as connection:
        for column, ddl in additions.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE generated_resumes ADD COLUMN {column} {ddl}"))


def _ensure_agent_prompt_config_columns() -> None:
    inspector = inspect(engine)
    if "agent_prompt_configs" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("agent_prompt_configs")}
    additions = {
        "label": "VARCHAR(160) DEFAULT '' NOT NULL",
        "system_prompt": "TEXT DEFAULT '' NOT NULL",
        "task_template": "TEXT DEFAULT '' NOT NULL",
        "extra_instructions": "TEXT DEFAULT '' NOT NULL",
        "is_enabled": "BOOLEAN DEFAULT 1 NOT NULL",
        "updated_at": "TIMESTAMP NULL",
    }
    with engine.begin() as connection:
        for column, ddl in additions.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE agent_prompt_configs ADD COLUMN {column} {ddl}"))


def _seed_agent_prompts() -> None:
    inspector = inspect(engine)
    if "agent_prompt_configs" not in inspector.get_table_names():
        return
    with SessionLocal() as db:
        ensure_default_prompt_rows(db)


def _sweep_orphan_runs() -> None:
    """If a search run was left mid-flight (worker crash, app restart), mark it failed
    so the UI doesn't show a forever-pending row."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    with SessionLocal() as db:
        rows = db.scalars(
            select(SearchRun).where(
                SearchRun.status.in_(("pending", "running")),
                SearchRun.created_at < cutoff,
            )
        ).all()
        for run in rows:
            run.status = "failed"
            run.error_message = "Run was interrupted by a worker restart and has been marked failed."
            run.completed_at = datetime.now(timezone.utc)
        db.commit()


def _purge_bedrock_credentials() -> None:
    """Bedrock support was removed; drop any saved credentials so users can't attempt
    to run a pipeline with an unsupported provider."""
    inspector = inspect(engine)
    if "provider_credentials" not in inspector.get_table_names():
        return
    with SessionLocal() as db:
        rows = db.scalars(select(ProviderCredential).where(ProviderCredential.provider == "bedrock")).all()
        for row in rows:
            db.delete(row)
        db.commit()


def _strip_persisted_provider_keys() -> None:
    """Provider keys are session-only now. Preserve model/task metadata, remove old keys."""
    inspector = inspect(engine)
    if "provider_credentials" not in inspector.get_table_names():
        return
    with SessionLocal() as db:
        rows = db.scalars(select(ProviderCredential)).all()
        changed = False
        for row in rows:
            try:
                payload = loads_json(decrypt_text(row.encrypted_payload), {})
            except Exception:
                continue
            if "api_key" not in payload:
                continue
            payload.pop("api_key", None)
            row.encrypted_payload = encrypt_text(dumps_json(payload))
            changed = True
        if changed:
            db.commit()


def _seed_admins() -> None:
    if not ADMIN_SEED_EMAILS:
        return
    with SessionLocal() as db:
        for email in ADMIN_SEED_EMAILS:
            user = db.scalar(select(User).where(User.email == email.lower()))
            if user is not None and not user.is_admin:
                user.is_admin = True
        db.commit()
