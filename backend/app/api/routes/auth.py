"""Authentication routes — local login, Entra ID SSO, and user management."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import hashlib
import hmac
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.app_setting import AppSetting

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    """Hash password with SHA-256 + salt from SECRET_KEY."""
    salted = f"{settings.SECRET_KEY}:{password}"
    return hashlib.sha256(salted.encode()).hexdigest()


def _verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(_hash_password(plain), hashed)


# --- Pydantic Models ---

class LoginRequest(BaseModel):
    email: str
    password: str


class SSOLoginRequest(BaseModel):
    access_token: str


class UserInfo(BaseModel):
    id: str
    email: str
    display_name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserInfo


class UserCreate(BaseModel):
    email: str
    display_name: str
    role: str = "readonly"
    password: Optional[str] = None


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str]
    role: str
    is_active: bool
    has_password: bool
    has_entra_id: bool
    last_login: Optional[datetime]
    created_at: Optional[datetime]


class SSOConfigRequest(BaseModel):
    client_id: str
    tenant_id: str
    enabled: bool = True


class SSOConfigResponse(BaseModel):
    client_id: str
    tenant_id: str
    enabled: bool
    configured: bool


# --- Helpers ---

SSO_SETTING_KEYS = {
    "client_id": "sso_entra_client_id",
    "tenant_id": "sso_entra_tenant_id",
    "enabled": "sso_entra_enabled",
}


async def _get_sso_config(db: AsyncSession) -> dict:
    """Get SSO config from DB, falling back to env vars."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(list(SSO_SETTING_KEYS.values())))
    )
    rows = {r.key: r.value for r in result.scalars().all()}

    client_id = rows.get(SSO_SETTING_KEYS["client_id"]) or settings.ENTRA_CLIENT_ID or ""
    tenant_id = rows.get(SSO_SETTING_KEYS["tenant_id"]) or settings.ENTRA_TENANT_ID or ""
    enabled_str = rows.get(SSO_SETTING_KEYS["enabled"])
    enabled = enabled_str == "true" if enabled_str is not None else bool(client_id and tenant_id)

    return {
        "client_id": client_id,
        "tenant_id": tenant_id,
        "enabled": enabled,
        "configured": bool(client_id and tenant_id),
    }

def _create_token(user: User) -> str:
    """Create a JWT token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user.id,
        "email": user.email,
        "display_name": user.display_name or user.email,
        "role": user.role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _get_or_create_sso_user(
    db: AsyncSession,
    email: str,
    display_name: str,
    entra_oid: str,
) -> User:
    """Find existing user by Entra OID or email, or create a new one."""
    # Try by Entra OID first
    result = await db.execute(select(User).where(User.entra_oid == entra_oid))
    user = result.scalar_one_or_none()
    if user:
        # Update display name if changed
        if display_name and user.display_name != display_name:
            user.display_name = display_name
        return user

    # Try by email
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user:
        # Link Entra OID to existing user
        user.entra_oid = entra_oid
        if display_name:
            user.display_name = display_name
        return user

    # Check if this is the first user — make them owner
    count_result = await db.execute(select(func.count(User.id)))
    total_users = count_result.scalar() or 0
    role = "owner" if total_users == 0 else "readonly"

    # Create new user
    user = User(
        id=str(uuid.uuid4()),
        email=email.lower(),
        display_name=display_name or email,
        entra_oid=entra_oid,
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    logger.info("Created new SSO user: %s (role: %s)", email, role)
    return user


# --- Routes ---

@router.post("/login", response_model=TokenResponse)
async def local_login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email + password (local auth)."""
    result = await db.execute(
        select(User).where(User.email == payload.email.lower(), User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not _verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = _create_token(user)
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserInfo(
            id=user.id,
            email=user.email,
            display_name=user.display_name or user.email,
            role=user.role,
        ),
    )


@router.post("/sso/entra", response_model=TokenResponse)
async def entra_id_login(
    payload: SSOLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate via Entra ID access token from MSAL.

    Frontend sends the access token obtained from MSAL.
    Backend validates it with Microsoft Graph to get user info.
    """
    # Validate the token by calling Microsoft Graph /me endpoint
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {payload.access_token}"},
                timeout=10.0,
            )

        if response.status_code != 200:
            logger.warning("Entra ID token validation failed: %s", response.text)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Microsoft token — unable to verify identity",
            )

        ms_user = response.json()
        email = (ms_user.get("mail") or ms_user.get("userPrincipalName") or "").lower()
        display_name = ms_user.get("displayName", "")
        entra_oid = ms_user.get("id", "")

        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Microsoft account has no email address",
            )

    except httpx.RequestError as e:
        logger.error("Failed to validate Entra ID token: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to communicate with Microsoft Graph API",
        )

    # Get or create user
    user = await _get_or_create_sso_user(db, email, display_name, entra_oid)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = _create_token(user)
    logger.info("SSO login successful for: %s (role: %s)", email, user.role)

    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserInfo(
            id=user.id,
            email=user.email,
            display_name=user.display_name or user.email,
            role=user.role,
        ),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user info from JWT."""
    return UserInfo(
        id=user["id"],
        email=user["email"],
        display_name=user.get("display_name", user["email"]),
        role=user["role"],
    )


# --- SSO Configuration ---

@router.get("/sso/config", response_model=SSOConfigResponse)
async def get_sso_config_public(db: AsyncSession = Depends(get_db)):
    """Public endpoint — login page needs to know if SSO is available.
    Returns client_id and tenant_id so MSAL can be initialized."""
    config = await _get_sso_config(db)
    return SSOConfigResponse(**config)


@router.put("/sso/config", response_model=SSOConfigResponse)
async def update_sso_config(
    payload: SSOConfigRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """Save SSO (Entra ID) configuration. Owner only."""
    updates = {
        SSO_SETTING_KEYS["client_id"]: payload.client_id.strip(),
        SSO_SETTING_KEYS["tenant_id"]: payload.tenant_id.strip(),
        SSO_SETTING_KEYS["enabled"]: "true" if payload.enabled else "false",
    }

    for key, value in updates.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))

    await db.commit()
    logger.info("SSO config updated by %s", user["email"])

    config = await _get_sso_config(db)
    return SSOConfigResponse(**config)


@router.delete("/sso/config")
async def delete_sso_config(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """Remove SSO configuration. Owner only."""
    for key in SSO_SETTING_KEYS.values():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            await db.delete(existing)

    await db.commit()
    logger.info("SSO config removed by %s", user["email"])
    return {"message": "SSO configuration removed"}


# --- User Management (Owner only) ---

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """List all users. Owner only."""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            role=u.role,
            is_active=u.is_active,
            has_password=u.password_hash is not None,
            has_entra_id=u.entra_oid is not None,
            last_login=u.last_login,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/users", response_model=UserResponse)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """Create a new user. Owner only."""
    if payload.role not in ("owner", "admin", "readonly"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be: owner, admin, readonly")

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User with this email already exists")

    new_user = User(
        id=str(uuid.uuid4()),
        email=payload.email.lower(),
        display_name=payload.display_name,
        role=payload.role,
        password_hash=_hash_password(payload.password) if payload.password else None,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()

    logger.info("User created by %s: %s (role: %s)", user["email"], payload.email, payload.role)

    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        display_name=new_user.display_name,
        role=new_user.role,
        is_active=new_user.is_active,
        has_password=new_user.password_hash is not None,
        has_entra_id=new_user.entra_oid is not None,
        last_login=None,
        created_at=new_user.created_at,
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """Update a user's role or status. Owner only."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        if payload.role not in ("owner", "admin", "readonly"):
            raise HTTPException(status_code=400, detail="Invalid role")
        target.role = payload.role

    if payload.display_name is not None:
        target.display_name = payload.display_name

    if payload.is_active is not None:
        # Don't let owner deactivate themselves
        if target.id == user["id"] and not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
        target.is_active = payload.is_active

    await db.commit()
    logger.info("User updated by %s: %s -> role=%s, active=%s", user["email"], target.email, target.role, target.is_active)

    return UserResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        role=target.role,
        is_active=target.is_active,
        has_password=target.password_hash is not None,
        has_entra_id=target.entra_oid is not None,
        last_login=target.last_login,
        created_at=target.created_at,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("owner")),
):
    """Delete a user. Owner only. Cannot delete yourself."""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(target)
    await db.commit()
    logger.info("User deleted by %s: %s", user["email"], target.email)
    return {"message": f"User {target.email} deleted"}


# --- Bootstrap: seed initial admin user ---

async def seed_default_admin(db: AsyncSession):
    """Create a default admin user if no users exist. For local dev only."""
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    if count == 0:
        admin = User(
            id=str(uuid.uuid4()),
            email="admin@local",
            display_name="Local Admin",
            password_hash=_hash_password("admin"),
            role="owner",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        logger.info("Seeded default admin user: admin@local / admin")
