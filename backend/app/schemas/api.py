from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


ProviderName = Literal["openai", "anthropic"]


_COMMON_PASSWORDS = {
    "password", "password1", "12345678", "123456789", "qwerty123",
    "letmein1", "welcome1", "admin1234", "iloveyou1", "abc12345",
}


def _validate_password_strength(value: str) -> str:
    if len(value) < 12:
        raise ValueError("Password must be at least 12 characters.")
    if len(value) > 256:
        raise ValueError("Password too long.")
    classes = sum([
        any(c.islower() for c in value),
        any(c.isupper() for c in value),
        any(c.isdigit() for c in value),
        any(not c.isalnum() for c in value),
    ])
    if classes < 3:
        raise ValueError("Password must include 3 of: lowercase, uppercase, digit, symbol.")
    if value.lower() in _COMMON_PASSWORDS:
        raise ValueError("Password is too common.")
    return value


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32)
    password: str = Field(min_length=12, max_length=256)

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_admin: bool = False


class AdminUserSummary(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_admin: bool
    is_active: bool = True
    suspended_at: datetime | None = None
    suspended_reason: str | None = None
    created_at: datetime
    provider: str | None = None
    model: str | None = None
    search_runs: int = 0
    extractions: int = 0
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    last_active_at: datetime | None = None


class AdminCreateUserPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    full_name: str | None = None
    is_admin: bool = False


class AdminUpdateUserPayload(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None
    suspended_reason: str | None = None


class AdminAgentPromptResponse(BaseModel):
    agent_key: str
    label: str
    system_prompt: str
    task_template: str = ""
    extra_instructions: str = ""
    is_enabled: bool = True
    updated_at: datetime | None = None


class AdminAgentPromptUpdate(BaseModel):
    system_prompt: str = Field(min_length=20)
    task_template: str = ""
    extra_instructions: str = ""
    is_enabled: bool = True


class AdminLiveRun(BaseModel):
    id: int
    user_id: int
    user_email: EmailStr
    provider: str
    status: str
    created_at: datetime
    elapsed_seconds: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    stage: str
    queries_generated: int


class AdminFailedRun(BaseModel):
    id: int
    user_id: int
    user_email: EmailStr
    provider: str
    error_message: str | None
    fingerprint: str
    created_at: datetime
    completed_at: datetime | None
    total_tokens: int


class AdminQueueStats(BaseModel):
    queue_name: str
    queued: int
    in_progress: int
    deferred: int
    failed_recent: int
    oldest_pending_age_seconds: float | None = None


class AdminAuditEntry(BaseModel):
    id: int
    actor_id: int | None
    actor_email: str | None
    action: str
    target_type: str | None
    target_id: int | None
    detail: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AdminAnalytics(BaseModel):
    funnel: dict[str, int]
    provider_mix: dict[str, int]
    model_mix: dict[str, int]
    match_score_avg: float
    match_score_buckets: dict[str, int]
    job_sources: dict[str, int]
    top_companies: list[dict[str, Any]]
    resume_parse_failures: int
    search_yield: dict[str, int]


class AdminSystem(BaseModel):
    db_rows: dict[str, int]
    storage_bytes: int
    storage_files: int
    queue: AdminQueueStats


class AdminUserDetail(BaseModel):
    user: AdminUserSummary
    profile: dict[str, Any] | None = None
    resumes: list[dict[str, Any]] = Field(default_factory=list)
    runs: list[dict[str, Any]] = Field(default_factory=list)
    extractions: list[dict[str, Any]] = Field(default_factory=list)
    daily_tokens: list[dict[str, Any]] = Field(default_factory=list)


class ProfilePayload(BaseModel):
    target_role: str = ""
    alternative_titles: str = ""
    sponsorship_status: str = ""
    skills_text: str = ""
    preferred_locations: str = ""
    remote_preference: bool = True
    career_level: str = ""
    clearance_status: str = ""
    notes: str = ""


class ProfileResponse(ProfilePayload):
    id: int | None = None
    updated_at: datetime | None = None


class ResumeResponse(BaseModel):
    id: int
    file_name: str
    content_type: str | None = None
    extracted_preview: str
    created_at: datetime


class ResumeExtractionResponse(BaseModel):
    id: int
    resume_id: int
    file_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    model: str
    token_usage: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class GeneratedResumeResponse(BaseModel):
    id: int
    match_id: int | None = None
    resume_id: int | None = None
    company: str
    position: str
    file_base: str
    latex_source: str
    compile_status: str
    compile_log: str = ""
    has_pdf: bool = False
    model: str = ""
    token_usage: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class GeneratedResumeUpdate(BaseModel):
    latex_source: str = Field(min_length=1)


class ProviderCredentialPayload(BaseModel):
    provider: ProviderName
    api_key: str | None = Field(default=None, min_length=8)
    model: str | None = None
    base_url: str | None = None
    task_models: dict[str, str] = Field(default_factory=dict)


class ProviderCredentialResponse(BaseModel):
    id: int
    provider: ProviderName
    model: str
    base_url: str | None = None
    task_models: dict[str, str] = Field(default_factory=dict)
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SearchRunResponse(BaseModel):
    id: int
    user_run_number: int | None = None
    provider: str
    model: str | None = None
    status: str
    keywords: dict[str, Any] = Field(default_factory=dict)
    token_usage: dict[str, int] = Field(default_factory=dict)
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class JobListingResponse(BaseModel):
    id: int
    title: str
    company: str
    location: str
    url: str
    source: str
    posted_at: str
    application_status: str
    description: str


class JobMatchResponse(BaseModel):
    id: int
    score: float
    skill_matches: list[str]
    skill_gaps: list[str]
    resume_alignment: list[str]
    rationale: str
    is_new_to_user: bool
    job: JobListingResponse


class SeenJobResponse(BaseModel):
    id: int
    first_seen_at: datetime
    last_seen_at: datetime
    job: JobListingResponse


class MessageResponse(BaseModel):
    message: str
