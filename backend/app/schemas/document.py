from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentStatus


class DocumentRequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    is_required: bool
    is_active: bool
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
    requirement_name: str | None = None
    requirement_description: str | None = None
    requirement_is_required: bool | None = None


class ReviewDocumentDecision(BaseModel):
    contractor_id: str
    requirement_id: str
    decision: DocumentStatus
    note: str | None = None
