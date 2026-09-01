from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClarificationCreate(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    shared_with_all: bool = True


class ClarificationAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)


class ClarificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    contractor_id: str
    question: str
    answer: str | None
    shared_with_all: bool
    created_at: datetime
    answered_at: datetime | None
    contractor_company_name: str | None = None
