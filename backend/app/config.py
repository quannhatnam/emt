from __future__ import annotations
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Unified Device Dashboard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite+aiosqlite:///./devices.db"

    SYNC_INTERVAL_MINUTES: int = 30

    # Auth settings
    SECRET_KEY: str = "change-me-in-production-use-a-real-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    # Encryption key for credentials storage (Fernet-compatible base64 key)
    CREDENTIALS_ENCRYPTION_KEY: str = "ZmVybmV0LWtleS1jaGFuZ2UtbWUtaW4tcHJvZA=="

    # Entra ID (Azure AD) SSO — set these to enable Microsoft SSO
    ENTRA_CLIENT_ID: str = ""  # Application (client) ID from Azure App Registration
    ENTRA_TENANT_ID: str = ""  # Directory (tenant) ID

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
