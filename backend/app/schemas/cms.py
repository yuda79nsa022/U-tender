from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import Language


class CmsContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    language: Language
    value: str
    updated_at: datetime


class CmsContentUpsert(BaseModel):
    value: str


class PublicStatsOut(BaseModel):
    open_tenders: int
    verified_contractors: int
    awarded_projects: int
    total_awarded_value: Decimal
