from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "ApplyPilot AI"
    api_prefix: str = "/api"
    environment: str = "development"  # development | staging | production
    debug: bool = False
    database_url: str = "sqlite:///./api_applier.db"
    secret_key: str = Field(default="change-me-in-production")
    encryption_secret: str | None = None
    access_token_expire_minutes: int = 60  # short JWT lifetime
    backend_cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    )
    storage_dir: str = "storage"
    storage_backend: str = "local"  # local | s3
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_prefix: str = ""
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_per_minute: int = 120
    search_runs_per_hour: int = 10
    queue_name: str = "arq:queue"
    frontend_url: str = "http://localhost:5173"
    password_reset_expire_minutes: int = 30
    login_fail_limit: int = 5
    login_fail_window_seconds: int = 900
    admin_email: str = "patel.prerak2798@gmail.com"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_from_email: str | None = None

    default_openai_model: str = "gpt-5.4"
    default_anthropic_model: str = "claude-opus-4-7"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate(settings)
    return settings


def _validate(settings: Settings) -> None:
    if not settings.is_production:
        return
    problems: list[str] = []
    if settings.secret_key in ("", "change-me-in-production"):
        problems.append("SECRET_KEY must be set to a strong random value in production")
    if not settings.encryption_secret or len(settings.encryption_secret) < 32:
        problems.append("ENCRYPTION_SECRET must be set and >= 32 chars in production")
    if settings.encryption_secret == settings.secret_key:
        problems.append("ENCRYPTION_SECRET must differ from SECRET_KEY")
    if "*" in settings.cors_origins:
        problems.append("BACKEND_CORS_ORIGINS must not contain '*' in production")
    if settings.debug:
        problems.append("DEBUG must be false in production")
    if settings.storage_backend == "local":
        problems.append("STORAGE_BACKEND must be 's3' in production")
    if settings.storage_backend == "s3" and not settings.s3_bucket:
        problems.append("S3_BUCKET must be set when STORAGE_BACKEND=s3")
    if settings.database_url.startswith("sqlite"):
        problems.append("DATABASE_URL must be Postgres in production, not sqlite")
    if problems:
        raise RuntimeError("Insecure production config: " + "; ".join(problems))
