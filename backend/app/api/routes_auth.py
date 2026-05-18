from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import hashlib
import secrets
import smtplib
import ssl
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models.db import (
    JobMatch,
    GeneratedResume,
    ProviderCredential,
    Resume,
    ResumeExtraction,
    SearchRun,
    User,
    UserProfile,
    UserSeenJob,
)
from app.schemas.api import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    MessageResponse,
    ResetPasswordRequest,
    SigninRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/signin", response_model=TokenResponse)
def signin(payload: SigninRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ForgotPasswordResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    message = "If an account exists for that email, a password reset link has been sent."
    if user is None:
        return ForgotPasswordResponse(message=message)

    settings = get_settings()
    token = secrets.token_urlsafe(32)
    reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    user.password_reset_token_hash = _hash_reset_token(token)
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_expire_minutes
    )

    if not settings.smtp_host:
        db.commit()
        return ForgotPasswordResponse(message=message, reset_url=reset_url)

    try:
        _send_password_reset_email(user.email, reset_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    db.commit()
    return ForgotPasswordResponse(message=message)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    token_hash = _hash_reset_token(payload.token)
    user = db.scalar(select(User).where(User.password_reset_token_hash == token_hash))
    if user is None or user.password_reset_expires_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired.")

    expires_at = _as_aware_utc(user.password_reset_expires_at)
    if expires_at < datetime.now(timezone.utc):
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired.")

    user.hashed_password = get_password_hash(payload.password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    db.commit()
    return MessageResponse(message="Password updated. You can sign in with your new password.")


@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_admin=bool(current_user.is_admin),
    )


@router.delete("/me", response_model=MessageResponse)
def delete_me(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    delete_user_data(db, current_user.id)
    db.delete(current_user)
    db.commit()
    return MessageResponse(message="Account deleted.")


def delete_user_data(db: Session, user_id: int) -> None:
    # Children without a cascade rule on User. Order matters to satisfy FKs.
    for model in (GeneratedResume, JobMatch, UserSeenJob, SearchRun, ResumeExtraction, Resume, ProviderCredential, UserProfile):
        rows = db.scalars(select(model).where(model.user_id == user_id)).all()
        for row in rows:
            db.delete(row)
    db.flush()


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _send_password_reset_email(to_email: str, reset_url: str) -> None:
    settings = get_settings()
    if not settings.smtp_host:
        raise RuntimeError("SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD.")

    from_email = settings.smtp_from_email or settings.admin_email
    message = EmailMessage()
    message["Subject"] = "Reset your ApplyPilot AI password"
    message["From"] = from_email
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "Use this link to reset your ApplyPilot AI password:",
                "",
                reset_url,
                "",
                f"This link expires in {settings.password_reset_expire_minutes} minutes.",
                "If you did not request this, you can ignore this email.",
            ]
        )
    )

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.starttls(context=ssl.create_default_context())
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError("SMTP authentication failed. Gmail requires an app password, not your normal account password.") from exc
    except (OSError, smtplib.SMTPException) as exc:
        raise RuntimeError("Could not send password reset email. Check SMTP settings.") from exc
