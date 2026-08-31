from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_contractor_profile, get_current_user, require_approved_contractor, require_contractor
from app.models.contractor import ContractorProfile
from app.models.document import ContractorDocument, DocumentRequirement
from app.models.enums import DocumentStatus, ProjectStatus, VerificationStatus
from app.models.offer import Offer
from app.models.project import Project
from app.models.user import User
from app.schemas.contractor import ContractorProfileOut, SubmitForReview
from app.schemas.document import ContractorDocumentOut, DocumentRequirementOut
from app.schemas.project import ProjectOut
from app.services.storage import get_storage

router = APIRouter(prefix="/contractor", tags=["contractor"])


# Any authenticated contractor can read the active checklist — mirrors the
# original "requirements_read" RLS policy (using (true)) rather than the
# admin-only write endpoints under /admin/requirements.
@router.get("/requirements", response_model=list[DocumentRequirementOut])
def active_requirements(user: User = Depends(require_contractor), db: Session = Depends(get_db)):
    return db.query(DocumentRequirement).filter(DocumentRequirement.is_active.is_(True)).all()


@router.get("/feed", response_model=list[ProjectOut])
def feed(user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    # The feed itself requires verification approval (mirrors middleware.ts's
    # contractorGatedPaths) — subscription is a separate, softer gate applied
    # only to drawings and offer submission below, not to seeing the feed.
    projects = db.query(Project).filter(Project.status == ProjectStatus.open).order_by(Project.bid_deadline.asc()).all()
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
                created_at=p.created_at,
                offer_count=offer_count,
                my_offer_status=my_offers.get(p.id),
            )
        )
    return out


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
            requirement_name=r.name,
            requirement_description=r.description,
            requirement_is_required=r.is_required,
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

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="No file provided.")

    path = f"{user.id}/{requirement_id}/{int(datetime.utcnow().timestamp() * 1000)}-{file.filename}"
    get_storage().save("contractor-documents", path, content, file.content_type or "application/octet-stream")

    doc.file_path = path
    doc.status = DocumentStatus.pending
    doc.submitted_at = datetime.utcnow()
    doc.admin_note = None  # clear any prior rejection note on re-upload
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
        requirement_name=requirement.name if requirement else None,
        requirement_description=requirement.description if requirement else None,
        requirement_is_required=requirement.is_required if requirement else None,
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
        created_at=cp.created_at,
    )
