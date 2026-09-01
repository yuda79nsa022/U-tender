from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.award_record import AwardRecord
from app.models.cms_content import CmsContent
from app.models.contractor import ContractorProfile
from app.models.enums import Language, ProjectStatus, SubscriptionStatus, VerificationStatus
from app.models.project import Project
from app.schemas.cms import PublicStatsOut

router = APIRouter(prefix="/public", tags=["public"])

# Fallback marketing copy shown until an admin edits it via /admin/cms —
# this is default UI copy, not fabricated data (see /public/stats below for
# the real, DB-derived numbers spec §14 requires).
DEFAULT_CMS: dict[str, dict[str, str]] = {
    "hero_heading": {"en": "Post a project. Get real offers.", "ar": "انشر مشروعك واحصل على عروض حقيقية."},
    "hero_subheading": {
        "en": "U-Tender connects property owners with verified, licensed contractors — drawings in, offers out.",
        "ar": "يربط U-Tender أصحاب العقارات بمقاولين مرخصين وموثقين — المخططات تدخل، والعروض تخرج.",
    },
    "how_it_works_title": {"en": "How it works", "ar": "كيف يعمل"},
    "how_it_works_body": {
        "en": "Owners post a project with drawings and a bid deadline. Verified, subscribed contractors submit offers. The owner picks a winner and rates the work when it's done.",
        "ar": "ينشر الملاك مشروعًا مع المخططات وموعد نهائي لتقديم العروض. يقدم المقاولون الموثقون والمشتركون عروضهم. يختار المالك الفائز ويقيّم العمل عند الانتهاء.",
    },
}


@router.get("/cms")
def public_cms(language: Language = Language.en, db: Session = Depends(get_db)) -> dict[str, str]:
    rows = db.query(CmsContent).filter(CmsContent.language == language).all()
    content = {k: v[language.value] for k, v in DEFAULT_CMS.items()}
    for row in rows:
        content[row.key] = row.value
    return content


@router.get("/stats", response_model=PublicStatsOut)
def public_stats(db: Session = Depends(get_db)) -> PublicStatsOut:
    open_tenders = db.query(Project).filter(Project.status == ProjectStatus.open).count()

    # Mirrors ContractorProfile.is_verified_active exactly — the single
    # source of truth for marketplace activation (spec P0 rule) — so this
    # count can never drift from what "verified_active" actually means
    # elsewhere in the app.
    verified_contractors = (
        db.query(ContractorProfile)
        .filter(
            ContractorProfile.is_suspended.is_(False),
            ContractorProfile.verification_status == VerificationStatus.approved,
            or_(
                ContractorProfile.subscription_status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing]),
                ContractorProfile.payment_override_active.is_(True),
            ),
        )
        .count()
    )

    awarded_projects = db.query(AwardRecord).count()
    total_awarded_value = db.query(func.coalesce(func.sum(AwardRecord.amount), 0)).scalar()

    return PublicStatsOut(
        open_tenders=open_tenders,
        verified_contractors=verified_contractors,
        awarded_projects=awarded_projects,
        total_awarded_value=total_awarded_value,
    )
