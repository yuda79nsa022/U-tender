from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.contractor import ContractorProfile
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest
from app.schemas.user import UserOut
from app.services.documents import ensure_document_rows

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

ACCESS_TTL_SECONDS = settings.jwt_access_ttl_minutes * 60
REFRESH_TTL_SECONDS = settings.jwt_refresh_ttl_days * 24 * 60 * 60


def _set_auth_cookies(response: Response, user_id: str) -> None:
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)
    # httpOnly so a browser-side XSS can't read the token; SameSite=lax is
    # enough since frontend and backend are same-site in production
    # deployments (reverse-proxied together) — see README for the local-dev
    # cross-origin case, which needs SameSite=None + secure over https.
    response.set_cookie("access_token", access_token, httponly=True, samesite="lax", max_age=ACCESS_TTL_SECONDS)
    response.set_cookie("refresh_token", refresh_token, httponly=True, samesite="lax", max_age=REFRESH_TTL_SECONDS)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if payload.role not in (UserRole.owner, UserRole.contractor):
        raise HTTPException(status_code=400, detail="Only owner or contractor accounts can self-register.")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
    )
    db.add(user)
    db.flush()  # assigns user.id without committing yet

    if payload.role == UserRole.contractor:
        company_name = payload.company_name or payload.full_name
        db.add(ContractorProfile(user_id=user.id, company_name=company_name))
        db.flush()
        ensure_document_rows(db, user.id)

    db.commit()
    db.refresh(user)

    _set_auth_cookies(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    _set_auth_cookies(response, user.id)
    return user


@router.post("/refresh")
def refresh(response: Response, refresh_token: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_token(refresh_token, expected_type="refresh")
    if not user_id or not db.get(User, user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    _set_auth_cookies(response, user_id)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
