from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.db import get_db
from app.models.contractor import ContractorProfile
from app.models.enums import UserRole
from app.models.user import User


# Mirrors src/middleware.ts's first check: is there a valid session at all.
# Reads the access token from an httpOnly cookie set at login, same as the
# original app relied on Supabase's auth cookie rather than a header token
# the frontend has to manage itself.
def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_token(access_token, expected_type="access")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return user


# Mirrors middleware.ts's second check: does the caller's role match the
# route they're hitting (e.g. only 'admin' may reach /admin/*).
def require_role(*roles: UserRole):
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _check


require_admin = require_role(UserRole.admin)
require_owner = require_role(UserRole.owner)
require_contractor = require_role(UserRole.contractor)


# Mirrors middleware.ts's contractor-specific third check: verification and
# suspension state must be re-derived on every request, not just at login,
# since an admin can flip either at any time.
def require_approved_contractor(user: User = Depends(require_contractor), db: Session = Depends(get_db)) -> User:
    profile = db.get(ContractorProfile, user.id)
    if not profile or profile.verification_status.value != "approved" or profile.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not_approved",  # frontend redirects to /contractor/status on this code
        )
    return user


def get_contractor_profile(user: User, db: Session) -> ContractorProfile:
    profile = db.get(ContractorProfile, user.id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor profile not found")
    return profile
