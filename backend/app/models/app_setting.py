"""Key-value settings table for app-wide configuration (SSO, etc.)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, Boolean
from app.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key = Column(String(255), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
