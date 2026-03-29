from __future__ import annotations
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.intune import IntuneAdapter
from app.adapters.kandji import KandjiAdapter
from app.adapters.qualys import QualysAdapter
from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.credential import Credential
from app.schemas.credential import (
    CredentialCreate,
    CredentialResponse,
    CredentialTestResult,
)
from app.services.crypto import encrypt_credentials, decrypt_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/credentials", tags=["credentials"])

ADAPTER_MAP = {
    "intune": IntuneAdapter,
    "kandji": KandjiAdapter,
    "qualys": QualysAdapter,
}

# Fields to mask in responses
SENSITIVE_FIELDS = {"client_secret", "api_token", "password", "secret", "token", "key"}


def _mask_credentials(creds: dict[str, Any]) -> dict[str, str]:
    """Mask sensitive fields in credentials dict."""
    masked = {}
    for k, v in creds.items():
        if any(sf in k.lower() for sf in SENSITIVE_FIELDS):
            masked[k] = "********" if v else ""
        else:
            masked[k] = str(v) if v else ""
    return masked


@router.post("", response_model=CredentialResponse)
async def create_credential(
    payload: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    provider = payload.provider.lower()
    if provider not in ADAPTER_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}. Must be one of: intune, kandji, qualys")

    # Check if credential already exists for this provider
    result = await db.execute(select(Credential).where(Credential.provider == provider))
    existing = result.scalar_one_or_none()

    credentials_json = encrypt_credentials(payload.credentials)

    if existing:
        existing.credentials_json = credentials_json
        existing.is_active = payload.is_active
        credential = existing
        logger.info("Updated credentials for provider: %s", provider)
    else:
        credential = Credential(
            id=str(uuid.uuid4()),
            provider=provider,
            credentials_json=credentials_json,
            is_active=payload.is_active,
        )
        db.add(credential)
        logger.info("Created credentials for provider: %s", provider)

    await db.flush()

    return CredentialResponse(
        id=credential.id,
        provider=credential.provider,
        is_active=credential.is_active,
        last_synced_at=credential.last_synced_at,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
        credentials_masked=_mask_credentials(payload.credentials),
    )


@router.get("", response_model=list[CredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Credential).order_by(Credential.provider))
    credentials = result.scalars().all()

    responses = []
    for cred in credentials:
        try:
            creds_dict = decrypt_credentials(cred.credentials_json)
        except (ValueError, json.JSONDecodeError):
            creds_dict = {}

        responses.append(
            CredentialResponse(
                id=cred.id,
                provider=cred.provider,
                is_active=cred.is_active,
                last_synced_at=cred.last_synced_at,
                created_at=cred.created_at,
                updated_at=cred.updated_at,
                credentials_masked=_mask_credentials(creds_dict),
            )
        )
    return responses


@router.delete("/{provider}")
async def delete_credential(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Credential).where(Credential.provider == provider.lower()))
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail=f"No credentials found for provider: {provider}")

    await db.execute(delete(Credential).where(Credential.provider == provider.lower()))
    logger.info("Deleted credentials for provider: %s", provider)
    return {"message": f"Credentials for {provider} deleted successfully"}


@router.post("/{provider}/test", response_model=CredentialTestResult)
async def test_credential(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    provider = provider.lower()
    if provider not in ADAPTER_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    result = await db.execute(select(Credential).where(Credential.provider == provider))
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail=f"No credentials found for provider: {provider}")

    try:
        creds = decrypt_credentials(credential.credentials_json)
    except (ValueError, json.JSONDecodeError):
        return CredentialTestResult(
            provider=provider,
            success=False,
            message="Failed to decrypt stored credentials",
        )

    adapter_cls = ADAPTER_MAP[provider]
    adapter = adapter_cls(creds)

    try:
        success = await adapter.test_connection()
        if success:
            return CredentialTestResult(
                provider=provider,
                success=True,
                message="Connection successful",
            )
        else:
            return CredentialTestResult(
                provider=provider,
                success=False,
                message="Connection failed — check credentials",
            )
    except Exception as e:
        logger.error("Connection test failed for %s: %s", provider, str(e))
        return CredentialTestResult(
            provider=provider,
            success=False,
            message=f"Connection error: {str(e)}",
        )
