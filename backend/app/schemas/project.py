from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ProjectStatus


class ProjectCreate(BaseModel):
    title: str
    address: str
    description: str | None = None
    trade: str | None = None
    bid_deadline: datetime


class DrawingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    uploaded_at: datetime
    url: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    address: str
    description: str | None
    trade: str | None
    bid_deadline: datetime
    status: ProjectStatus
    created_at: datetime
    offer_count: int = 0
    my_offer_status: str | None = None  # only populated on the contractor feed


class ProjectDetailOut(ProjectOut):
    drawings: list[DrawingOut] = []
