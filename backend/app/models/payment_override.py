from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import gen_uuid


# The audited record behind ContractorProfile.payment_override_active
# (spec §10, D-003, checklist P0 "Admin override for Contractor A must not
# unlock Contractor B"). One contractor can have many rows over time
# (granted, revoked, granted again) — history is never deleted, only
# revoked_at/revoked_by get filled in.
class PaymentOverride(Base):
    __tablename__ = "payment_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    contractor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contractor_profiles.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    granted_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    revoked_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
