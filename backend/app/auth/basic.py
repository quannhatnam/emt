from __future__ import annotations
import hashlib
import hmac
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

logger = logging.getLogger(__name__)

security = HTTPBasic()


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# Default admin user for development
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": _hash_password("admin"),
    }
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hmac.compare_digest(_hash_password(plain_password), hashed_password)


def authenticate_user(username: str, password: str) -> dict | None:
    user = USERS_DB.get(username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


async def get_current_user(
    credentials: HTTPBasicCredentials = Depends(security),
) -> dict:
    user = authenticate_user(credentials.username, credentials.password)
    if user is None:
        logger.warning("Failed authentication attempt for user: %s", credentials.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return user
