import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _create_token(subject: str, ttl: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, timedelta(minutes=settings.jwt_access_ttl_minutes), "access")


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, timedelta(days=settings.jwt_refresh_ttl_days), "refresh")


@dataclass
class TokenPayload:
    user_id: str
    jti: str
    expires_at: datetime


def decode_token_payload(token: str, expected_type: str) -> TokenPayload | None:
    """Full decode, used where the token's identity (jti/exp) matters —
    e.g. revoking a specific refresh token on logout. Returns None if
    invalid, expired, or the wrong token type."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    sub, jti, exp = payload.get("sub"), payload.get("jti"), payload.get("exp")
    if not sub or not jti or not exp:
        return None
    return TokenPayload(user_id=sub, jti=jti, expires_at=datetime.fromtimestamp(exp, tz=timezone.utc))


def decode_token(token: str, expected_type: str) -> str | None:
    """Returns the user id embedded in the token, or None if invalid/expired/wrong type."""
    payload = decode_token_payload(token, expected_type)
    return payload.user_id if payload else None
