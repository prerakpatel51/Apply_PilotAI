from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.security import decrypt_text, encrypt_text
from app.db.session import get_db
from app.models.db import ProviderCredential, User
from app.schemas.api import MessageResponse, ProviderCredentialPayload, ProviderCredentialResponse
from app.services.agents import default_model_for
from app.services.json_utils import dumps_json, loads_json
from app.services.providers import TASK_MODEL_KEYS


router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[ProviderCredentialResponse])
def list_provider_credentials(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ProviderCredentialResponse]:
    credentials = db.scalars(
        select(ProviderCredential)
        .where(ProviderCredential.user_id == current_user.id)
        .order_by(ProviderCredential.updated_at.desc())
    ).all()
    return [_provider_response(item) for item in credentials]


@router.post("", response_model=ProviderCredentialResponse, status_code=status.HTTP_201_CREATED)
def upsert_provider_credential(
    payload: ProviderCredentialPayload,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProviderCredentialResponse:
    if payload.provider not in ("openai", "anthropic"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 'openai' and 'anthropic' providers are supported.",
        )
    model = (payload.model or default_model_for(payload.provider)).strip()
    task_models = _normalized_task_models(payload.provider, model, payload.task_models)
    model = task_models.get("job_search") or model
    encrypted_payload = encrypt_text(
        dumps_json(
            {
                "provider": payload.provider,
                "task_models": task_models,
            }
        )
    )

    credential = db.scalar(
        select(ProviderCredential).where(
            ProviderCredential.user_id == current_user.id,
            ProviderCredential.provider == payload.provider,
        )
    )
    if credential is None:
        credential = ProviderCredential(user_id=current_user.id, provider=payload.provider, model=model)
        db.add(credential)

    db.query(ProviderCredential).filter(ProviderCredential.user_id == current_user.id).update({"is_active": False})
    credential.model = model
    credential.encrypted_payload = encrypted_payload
    credential.is_active = True
    db.commit()
    db.refresh(credential)
    return _provider_response(credential)


@router.post("/{credential_id}/activate", response_model=ProviderCredentialResponse)
def activate_provider_credential(
    credential_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProviderCredentialResponse:
    credential = db.scalar(
        select(ProviderCredential).where(
            ProviderCredential.id == credential_id,
            ProviderCredential.user_id == current_user.id,
        )
    )
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider credential not found.")

    db.query(ProviderCredential).filter(ProviderCredential.user_id == current_user.id).update({"is_active": False})
    credential.is_active = True
    db.commit()
    db.refresh(credential)
    return _provider_response(credential)


@router.delete("/{credential_id}", response_model=MessageResponse)
def delete_provider_credential(
    credential_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    credential = db.scalar(
        select(ProviderCredential).where(
            ProviderCredential.id == credential_id,
            ProviderCredential.user_id == current_user.id,
        )
    )
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider credential not found.")

    db.delete(credential)
    db.commit()
    return MessageResponse(message="Provider removed.")


def _provider_response(credential: ProviderCredential) -> ProviderCredentialResponse:
    payload: dict[str, Any] = {}
    try:
        payload = loads_json(decrypt_text(credential.encrypted_payload), {})
    except Exception:
        payload = {}
    return ProviderCredentialResponse(
        id=credential.id,
        provider=credential.provider,  # type: ignore[arg-type]
        model=credential.model,
        base_url=None,
        task_models=_normalized_task_models(
            credential.provider,
            credential.model,
            payload.get("task_models") if isinstance(payload.get("task_models"), dict) else {},
        ),
        is_active=credential.is_active,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


def _normalized_task_models(provider: str, default_model: str, task_models: dict[str, Any] | None) -> dict[str, str]:
    fallback = (default_model or default_model_for(provider)).strip()
    models = task_models or {}
    return {
        key: str(models.get(key) or fallback).strip()
        for key in TASK_MODEL_KEYS
    }
