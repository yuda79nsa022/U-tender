from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import OfferStatus


class OfferCreate(BaseModel):
    amount: Decimal
    timeline_estimate: str | None = None
    message: str | None = None


class OfferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    contractor_id: str
    amount: Decimal
    timeline_estimate: str | None
    message: str | None
    status: OfferStatus
    created_at: datetime
    updated_at: datetime
    contractor_company_name: str | None = None
    contractor_avg_rating: Decimal | None = None
    contractor_review_count: int | None = None
