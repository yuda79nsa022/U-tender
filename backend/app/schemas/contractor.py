from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import SubscriptionStatus, VerificationStatus


class ContractorProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    company_name: str
    license_number: str | None
    primary_trade: str | None
    service_area: str | None
    verification_status: VerificationStatus
    is_suspended: bool
    avg_rating: Decimal
    review_count: int
    subscription_status: SubscriptionStatus | None
    subscription_current_period_end: datetime | None
    created_at: datetime
    email: str | None = None


class ContractorProfileUpdate(BaseModel):
    company_name: str
    license_number: str | None = None
    primary_trade: str | None = None
    service_area: str | None = None


class SubmitForReview(BaseModel):
    company_name: str
    license_number: str | None = None
