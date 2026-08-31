from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    role: UserRole  # "owner" or "contractor" — admin accounts are never self-serve
    company_name: str | None = None  # required in practice when role == contractor


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
