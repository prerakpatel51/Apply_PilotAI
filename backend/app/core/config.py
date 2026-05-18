from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "ApplyPilot AI"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./api_applier.db"
    secret_key: str = Field(default="change-me-in-production")
    encryption_secret: str | None = None
    access_token_expire_minutes: int = 60 * 24 * 7
    backend_cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    )
    storage_dir: str = "storage"
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_per_minute: int = 120
    search_runs_per_hour: int = 10
    queue_name: str = "arq:queue"
    frontend_url: str = "http://localhost:5173"
    password_reset_expire_minutes: int = 30
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
