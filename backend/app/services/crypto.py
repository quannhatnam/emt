"""Credential encryption/decryption using Fernet symmetric encryption."""
from __future__ import annotations

import base64
import hashlib
import json
import logging
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

logger = logging.getLogger(__name__)


def _derive_fernet_key(secret: str) -> bytes:
    """Derive a valid 32-byte Fernet key from an arbitrary string.

    Fernet requires a URL-safe base64-encoded 32-byte key.
    We use SHA-256 to derive a consistent 32-byte key from any input string.
    """
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet() -> Fernet:
    """Get a Fernet instance using the configured encryption key."""
    settings = get_settings()
    key = _derive_fernet_key(settings.CREDENTIALS_ENCRYPTION_KEY)
    return Fernet(key)


def encrypt_credentials(credentials: dict[str, Any]) -> str:
    """Encrypt a credentials dict to an opaque string for DB storage."""
    fernet = _get_fernet()
    plaintext = json.dumps(credentials).encode("utf-8")
    return fernet.encrypt(plaintext).decode("utf-8")


def decrypt_credentials(encrypted: str) -> dict[str, Any]:
    """Decrypt stored credential string back to a dict.

    Falls back to plain JSON parsing for backward compatibility with
    credentials that were stored before encryption was added.
    """
    fernet = _get_fernet()
    try:
        decrypted = fernet.decrypt(encrypted.encode("utf-8"))
        return json.loads(decrypted)
    except (InvalidToken, Exception):
        # Backward compatibility: try parsing as plain JSON
        # This handles credentials stored before encryption was enabled
        try:
            result = json.loads(encrypted)
            if isinstance(result, dict):
                logger.warning(
                    "Found unencrypted credentials in DB — will be re-encrypted on next save"
                )
                return result
        except json.JSONDecodeError:
            pass
        raise ValueError("Failed to decrypt credentials — invalid key or corrupted data")
