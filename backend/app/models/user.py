"""User model for RBAC — stores local users and Entra ID-linked users."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    # Hashed password for local auth (null for SSO-only users)
    password_hash = Column(String(255), nullable=True)
    # Entra ID object ID (null for local-only users)
    entra_oid = Column(String(255), nullable=True, unique=True, index=True)
    # Role: owner, admin, readonly
    role = Column(String(20), nullable=False, default="readonly")
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
