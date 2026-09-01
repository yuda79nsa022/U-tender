from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentStatus


class DocumentRequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    is_required: bool
    is_active: bool
    effective_from: datetime
    created_at: datetime


class DocumentRequirementCreate(BaseModel):
    name: str
    description: str | None = None
    is_required: bool = True


class ContractorDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    contractor_id: str
    requirement_id: str
    status: DocumentStatus
    admin_note: str | None
    reviewed_at: datetime | None
    submitted_at: datetime | None
    expires_on: date | None = None
    requirement_name: str | None = None
    requirement_description: str | None = None
    requirement_is_required: bool | None = None
    # Lets the admin UI flag "approved before this requirement's terms
    # last changed" without a second round trip.
    requirement_effective_from: datetime | None = None


class ReviewDocumentDecision(BaseModel):
    contractor_id: str
    requirement_id: str
    decision: DocumentStatus
    note: str | None = None
    expires_on: date | None = None


class DocumentExpiryUpdate(BaseModel):
    expires_on: date | None = None
