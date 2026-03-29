from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Index, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    serial_number = Column(String(255), index=True, nullable=True)
    hostname = Column(String(255), index=True, nullable=True)
    platform = Column(String(50), nullable=True)  # windows/macos/ios/android
    os_version = Column(String(100), nullable=True)
    model = Column(String(255), nullable=True)
    assigned_user = Column(String(255), nullable=True)
    assigned_user_email = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    compliance_status = Column(String(50), default="unknown")  # compliant/non_compliant/unknown
    encryption_enabled = Column(Boolean, nullable=True)
    firewall_enabled = Column(Boolean, nullable=True)
    antivirus_active = Column(Boolean, nullable=True)
    last_checkin = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(50), nullable=False)  # intune/kandji/qualys
    source_id = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=True)
    mac_address = Column(String(17), nullable=True)
    is_managed = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    apps = relationship("App", back_populates="device", cascade="all, delete-orphan")
    vulnerabilities = relationship("Vulnerability", back_populates="device", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_devices_source_source_id", "source", "source_id", unique=True),
    )
