from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import Language, UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: UserRole
    full_name: str | None
    phone: str | None
    language: Language
    email_verified: bool
    created_at: datetime
