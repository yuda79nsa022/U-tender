from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_contractor_profile, get_current_user, require_approved_contractor, require_contractor
from app.models.contractor import ContractorProfile
from app.models.document import ContractorDocument, DocumentRequirement
from app.models.enums import DocumentStatus, ProjectStatus, UserRole, VerificationStatus
from app.models.offer import Offer
from app.models.project import Project
from app.models.user import User
from app.schemas.contractor import ContractorProfileOut, MyBidOut, SubmitForReview
from app.schemas.document import ContractorDocumentOut, DocumentRequirementOut
from app.schemas.project import ProjectOut
from app.services.file_security import ALLOWED_DOCUMENT_EXTENSIONS, assert_allowed_extension, sanitize_path_segment
from app.services.storage import get_storage
from app.services.tender_lifecycle import sync_expired_projects

router = APIRouter(prefix="/contractor", tags=["contractor"])


# Any authenticated contractor can read the active checklist — mirrors the
# original "requirements_read" RLS policy (using (true)) rather than the
# admin-only write endpoints under /admin/requirements.
@router.get("/requirements", response_model=list[DocumentRequirementOut])
def active_requirements(user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    return (
        db.query(DocumentRequirement)
        .filter(DocumentRequirement.is_active.is_(True), DocumentRequirement.applies_to == UserRole.contractor)
        .all()
    )


@router.get("/feed", response_model=list[ProjectOut])
def feed(
    trade: str | None = None,
    search: str | None = None,
    sort: str = "deadline",  # "deadline" (closing soonest, default) | "newest"
    user: User = Depends(require_approved_contractor),
    db: Session = Depends(get_db),
):
    # The feed itself requires verification approval (mirrors middleware.ts's
    # contractorGatedPaths) — subscription is a separate, softer gate applied
    # only to drawings and offer submission below, not to seeing the feed.
    sync_expired_projects(db)
    query = db.query(Project).filter(Project.status == ProjectStatus.open, Project.is_suspended.is_(False))

    if trade and trade.strip():
        query = query.filter(Project.trade.ilike(f"%{trade.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(Project.title.ilike(term), Project.address.ilike(term), Project.description.ilike(term)))

    query = query.order_by(Project.created_at.desc()) if sort == "newest" else query.order_by(Project.bid_deadline.asc())
    projects = query.all()
    my_offers = {o.project_id: o.status.value for o in db.query(Offer).filter(Offer.contractor_id == user.id).all()}

    out = []
    for p in projects:
        offer_count = db.query(Offer).filter(Offer.project_id == p.id).count()
        out.append(
            ProjectOut(
                id=p.id,
                owner_id=p.owner_id,
                title=p.title,
                address=p.address,
                description=p.description,
                trade=p.trade,
                bid_deadline=p.bid_deadline,
                status=p.status,
                tender_type=p.tender_type,
                tender_type_locked=p.tender_type_locked,
                created_at=p.created_at,
                offer_count=offer_count,
                my_offer_status=my_offers.get(p.id),
            )
        )
    return out


@router.get("/feed/trades", response_model=list[str])
def feed_trades(user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    """Distinct trades among currently open projects, for populating the
    feed's filter control — only values actually worth filtering by."""
    sync_expired_projects(db)
    rows = (
        db.query(Project.trade)
        .filter(Project.status == ProjectStatus.open, Project.trade.isnot(None))
        .distinct()
        .order_by(Project.trade.asc())
        .all()
    )
    return [r[0] for r in rows if r[0]]


@router.get("/my-bids", response_model=list[MyBidOut])
def my_bids(user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    """Every offer this contractor has ever placed, across all projects —
    the dashboard's single source for 'active bids' / 'won' counts and the
    My Bids list. Requires only the role, not verification/payment: a
    contractor should always be able to see what they've already bid on
    even if their access later lapses."""
    sync_expired_projects(db)
    rows = (
        db.query(Offer, Project)
        .join(Project, Offer.project_id == Project.id)
        .filter(Offer.contractor_id == user.id)
        .order_by(Offer.updated_at.desc())
        .all()
    )
    return [
        MyBidOut(
            project_id=p.id,
            project_title=p.title,
            project_address=p.address,
            project_status=p.status,
            bid_deadline=p.bid_deadline,
            offer_id=o.id,
            amount=o.amount,
            offer_status=o.status,
            revision=o.revision,
            updated_at=o.updated_at,
        )
        for o, p in rows
    ]


@router.get("/profile", response_model=ContractorProfileOut)
def profile(user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    cp = get_contractor_profile(user, db)
    return ContractorProfileOut(**_profile_fields(cp), email=user.email)


@router.get("/documents", response_model=list[ContractorDocumentOut])
def list_documents(user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    rows = (
        db.query(ContractorDocument, DocumentRequirement)
        .join(DocumentRequirement, ContractorDocument.requirement_id == DocumentRequirement.id)
        .filter(ContractorDocument.contractor_id == user.id)
        .all()
    )
    return [
        ContractorDocumentOut(
            id=d.id,
            contractor_id=d.contractor_id,
            requirement_id=d.requirement_id,
            status=d.status,
            admin_note=d.admin_note,
            reviewed_at=d.reviewed_at,
            submitted_at=d.submitted_at,
            expires_on=d.expires_on,
            requirement_name=r.name,
            requirement_description=r.description,
            requirement_is_required=r.is_required,
            requirement_effective_from=r.effective_from,
        )
        for d, r in rows
    ]


@router.post("/documents/{requirement_id}/upload", response_model=ContractorDocumentOut)
async def upload_document(
    requirement_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_contractor),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(ContractorDocument)
        .filter(ContractorDocument.contractor_id == user.id, ContractorDocument.requirement_id == requirement_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document requirement not found for this contractor.")

    assert_allowed_extension(file.filename, ALLOWED_DOCUMENT_EXTENSIONS)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="No file provided.")

    safe_name = sanitize_path_segment(file.filename)
    path = f"{user.id}/{requirement_id}/{int(datetime.utcnow().timestamp() * 1000)}-{safe_name}"
    get_storage().save("contractor-documents", path, content, file.content_type or "application/octet-stream")

    doc.file_path = path
    doc.status = DocumentStatus.pending
    doc.submitted_at = datetime.utcnow()
    doc.admin_note = None  # clear any prior rejection note on re-upload
    doc.expires_on = None  # a fresh submission needs a fresh review before any expiry applies
    db.commit()
    db.refresh(doc)

    requirement = db.get(DocumentRequirement, requirement_id)
    return ContractorDocumentOut(
        id=doc.id,
        contractor_id=doc.contractor_id,
        requirement_id=doc.requirement_id,
        status=doc.status,
        admin_note=doc.admin_note,
        reviewed_at=doc.reviewed_at,
        submitted_at=doc.submitted_at,
        expires_on=doc.expires_on,
        requirement_name=requirement.name if requirement else None,
        requirement_description=requirement.description if requirement else None,
        requirement_is_required=requirement.is_required if requirement else None,
        requirement_effective_from=requirement.effective_from if requirement else None,
    )


@router.post("/submit-for-review", response_model=ContractorProfileOut)
def submit_for_review(payload: SubmitForReview, user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    docs = (
        db.query(ContractorDocument, DocumentRequirement)
        .join(DocumentRequirement, ContractorDocument.requirement_id == DocumentRequirement.id)
        .filter(ContractorDocument.contractor_id == user.id)
        .all()
    )
    missing_required = any(r.is_required and d.status == DocumentStatus.not_submitted for d, r in docs)
    if missing_required:
        raise HTTPException(status_code=400, detail="All required documents must be uploaded before submitting for review.")

    cp = get_contractor_profile(user, db)
    cp.company_name = payload.company_name
    cp.license_number = payload.license_number
    cp.verification_status = VerificationStatus.pending_review
    db.commit()
    db.refresh(cp)
    return ContractorProfileOut(**_profile_fields(cp), email=user.email)


def _profile_fields(cp: ContractorProfile) -> dict:
    return dict(
        user_id=cp.user_id,
        company_name=cp.company_name,
        license_number=cp.license_number,
        primary_trade=cp.primary_trade,
        service_area=cp.service_area,
        verification_status=cp.verification_status,
        is_suspended=cp.is_suspended,
        avg_rating=cp.avg_rating,
        review_count=cp.review_count,
        subscription_status=cp.subscription_status,
        subscription_current_period_end=cp.subscription_current_period_end,
        payment_override_active=cp.payment_override_active,
        marketplace_status=cp.marketplace_status,
        created_at=cp.created_at,
    )
