from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import SubscriptionStatus, VerificationStatus


class ContractorProfile(Base):
    __tablename__ = "contractor_profiles"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    license_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    primary_trade: Mapped[str | None] = mapped_column(String(100), nullable=True)
    service_area: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, native_enum=True), nullable=False, default=VerificationStatus.incomplete
    )
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avg_rating: Mapped[Decimal] = mapped_column(Numeric(2, 1), default=Decimal("0"))
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subscription_status: Mapped[SubscriptionStatus | None] = mapped_column(
        Enum(SubscriptionStatus, native_enum=True), nullable=True
    )
    subscription_current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="contractor_profile")

    @property
    def is_subscribed(self) -> bool:
        return self.subscription_status in (SubscriptionStatus.active, SubscriptionStatus.trialing)
