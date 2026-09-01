from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import gen_uuid
from app.models.enums import Language


# Admin-editable public-site content (spec §14, §2.9 Website Management).
# One row per (key, language) — e.g. ("hero_heading", "en") and
# ("hero_heading", "ar") are two separate rows, matching the spec's
# requirement for genuinely separate Arabic/English content rather than
# one field holding both.
class CmsContent(Base):
    __tablename__ = "cms_content"
    __table_args__ = (UniqueConstraint("key", "language", name="uq_cms_key_language"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    key: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    language: Mapped[Language] = mapped_column(Enum(Language, native_enum=True), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
