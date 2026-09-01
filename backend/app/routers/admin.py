from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.contractor import ContractorProfile
from app.models.document import ContractorDocument, DocumentRequirement
from app.models.enums import DocumentStatus, VerificationStatus
from app.models.payment_override import PaymentOverride
from app.models.review import Review
from app.models.user import User
from app.schemas.contractor import ContractorProfileOut, ContractorProfileUpdate
from app.schemas.document import (
    ContractorDocumentOut,
    DocumentExpiryUpdate,
    DocumentRequirementCreate,
    DocumentRequirementOut,
    ReviewDocumentDecision,
)
from app.services.audit import log_action
from app.services.storage import get_storage

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- document requirements ----------

@router.get("/requirements", response_model=list[DocumentRequirementOut])
def list_requirements(db: Session = Depends(get_db)):
    return db.query(DocumentRequirement).order_by(DocumentRequirement.created_at.desc()).all()


@router.post("/requirements", response_model=DocumentRequirementOut, status_code=201)
def add_requirement(payload: DocumentRequirementCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Document name is required.")
    req = DocumentRequirement(
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        is_required=payload.is_required,
        created_by=admin.id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


class RequirementPatch(BaseModel):
    is_required: bool | None = None
    is_active: bool | None = None


@router.patch("/requirements/{requirement_id}", response_model=DocumentRequirementOut)
def patch_requirement(
    requirement_id: str, payload: RequirementPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    req = db.get(DocumentRequirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found.")
    # A requirement newly turning mandatory (optional -> required) changes
    # what "compliant" means — bumping effective_from lets the review UI
    # flag any already-approved document that was submitted under the old,
    # looser terms as due for a fresh look (spec §48 versioning). Toggling
    # the other direction, or is_active alone, doesn't retroactively affect
    # anyone, so it doesn't move the date.
    if payload.is_required is True and req.is_required is False:
        req.effective_from = datetime.utcnow()
        log_action(
            db,
            actor_id=admin.id,
            action="requirement.made_required",
            target_type="document_requirement",
            target_id=requirement_id,
            previous_value="False",
            new_value="True",
        )
    if payload.is_required is not None:
        req.is_required = payload.is_required
    if payload.is_active is not None:
        # Soft-remove: deactivate rather than hard-delete, so existing
        # contractor_documents rows referencing this requirement stay
        # intact for audit history.
        req.is_active = payload.is_active
    db.commit()
    db.refresh(req)
    return req


# ---------- review queue ----------

@router.get("/review/queue")
def review_queue(db: Session = Depends(get_db)):
    profiles = (
        db.query(ContractorProfile)
        .filter(
            ContractorProfile.verification_status.in_(
                [VerificationStatus.pending_review, VerificationStatus.changes_requested]
            )
        )
        .order_by(ContractorProfile.created_at.asc())
        .all()
    )
    result = []
    for cp in profiles:
        docs = (
            db.query(ContractorDocument, DocumentRequirement)
            .join(DocumentRequirement, ContractorDocument.requirement_id == DocumentRequirement.id)
            .filter(ContractorDocument.contractor_id == cp.user_id)
            .all()
        )
        expiry = 60 * 60 * 24  # admin review links: fixed 24h window, not deadline-tied like drawings
        storage = get_storage()
        result.append(
            {
                "contractor": ContractorProfileOut(**_profile_fields(cp), email=None),
                "documents": [
                    {
                        **ContractorDocumentOut(
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
                        ).model_dump(),
                        "url": storage.signed_url("contractor-documents", d.file_path, expiry) if d.file_path else None,
                    }
                    for d, r in docs
                ],
            }
        )
    return result


@router.post("/review/documents", response_model=ContractorDocumentOut)
def review_document(payload: ReviewDocumentDecision, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    doc = (
        db.query(ContractorDocument)
        .filter(
            ContractorDocument.contractor_id == payload.contractor_id,
            ContractorDocument.requirement_id == payload.requirement_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc.status = payload.decision
    doc.admin_note = (payload.note or "Document rejected — please re-upload.") if payload.decision == DocumentStatus.rejected else None
    doc.reviewed_by = admin.id
    doc.reviewed_at = datetime.utcnow()
    if payload.decision == DocumentStatus.approved:
        doc.expires_on = payload.expires_on
    db.commit()

    # A single rejected document sends the whole application back to
    # "changes requested" immediately, so the contractor sees it without
    # the admin needing a separate reject-application step.
    if payload.decision == DocumentStatus.rejected:
        cp = db.get(ContractorProfile, payload.contractor_id)
        if cp:
            cp.verification_status = VerificationStatus.changes_requested
            db.commit()

    db.refresh(doc)
    return doc


@router.patch("/documents/{document_id}/expiry", response_model=ContractorDocumentOut)
def set_document_expiry(document_id: str, payload: DocumentExpiryUpdate, db: Session = Depends(get_db)):
    doc = db.get(ContractorDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    doc.expires_on = payload.expires_on
    db.commit()
    db.refresh(doc)
    requirement = db.get(DocumentRequirement, doc.requirement_id)
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


@router.post("/review/contractors/{contractor_id}/approve", response_model=ContractorProfileOut)
def approve_contractor(contractor_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    docs = (
        db.query(ContractorDocument, DocumentRequirement)
        .join(DocumentRequirement, ContractorDocument.requirement_id == DocumentRequirement.id)
        .filter(ContractorDocument.contractor_id == contractor_id)
        .all()
    )
    # Guard: every required document must be approved before the overall
    # application can be approved. Prevents a mis-click from activating an
    # under-verified contractor.
    missing_approval = any(r.is_required and d.status != DocumentStatus.approved for d, r in docs)
    if missing_approval:
        raise HTTPException(status_code=400, detail="All required documents must be approved before approving this contractor.")

    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    previous = cp.verification_status.value
    cp.verification_status = VerificationStatus.approved
    db.commit()
    db.refresh(cp)
    log_action(
        db,
        actor_id=admin.id,
        action="verification_status.set",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=previous,
        new_value=VerificationStatus.approved.value,
    )
    return cp


@router.post("/review/contractors/{contractor_id}/reject", response_model=ContractorProfileOut)
def reject_application(contractor_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    previous = cp.verification_status.value
    cp.verification_status = VerificationStatus.changes_requested
    db.commit()
    db.refresh(cp)
    log_action(
        db,
        actor_id=admin.id,
        action="verification_status.set",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=previous,
        new_value=VerificationStatus.changes_requested.value,
    )
    return cp


# ---------- contractor management ----------

@router.get("/contractors", response_model=list[ContractorProfileOut])
def list_contractors(db: Session = Depends(get_db)):
    rows = db.query(ContractorProfile, User).join(User, ContractorProfile.user_id == User.id).all()
    return [ContractorProfileOut(**_profile_fields(cp), email=u.email) for cp, u in rows]


@router.get("/contractors/{contractor_id}")
def contractor_detail(contractor_id: str, db: Session = Depends(get_db)):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    user = db.get(User, contractor_id)
    docs = (
        db.query(ContractorDocument, DocumentRequirement)
        .join(DocumentRequirement, ContractorDocument.requirement_id == DocumentRequirement.id)
        .filter(ContractorDocument.contractor_id == contractor_id)
        .all()
    )
    return {
        "contractor": ContractorProfileOut(**_profile_fields(cp), email=user.email if user else None),
        "documents": [
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
            for d, r in docs
        ],
    }


@router.patch("/contractors/{contractor_id}", response_model=ContractorProfileOut)
def update_contractor(contractor_id: str, payload: ContractorProfileUpdate, db: Session = Depends(get_db)):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    if not payload.company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required.")

    cp.company_name = payload.company_name.strip()
    cp.license_number = payload.license_number or None
    cp.primary_trade = payload.primary_trade or None
    cp.service_area = payload.service_area or None
    db.commit()
    db.refresh(cp)
    user = db.get(User, contractor_id)
    return ContractorProfileOut(**_profile_fields(cp), email=user.email if user else None)


class VerificationStatusPatch(BaseModel):
    status: VerificationStatus


@router.post("/contractors/{contractor_id}/verification-status", response_model=ContractorProfileOut)
def set_verification_status(
    contractor_id: str,
    payload: VerificationStatusPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    previous = cp.verification_status.value
    cp.verification_status = payload.status
    db.commit()
    db.refresh(cp)
    log_action(
        db,
        actor_id=admin.id,
        action="verification_status.set",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=previous,
        new_value=payload.status.value,
    )
    return cp


class SuspendPatch(BaseModel):
    suspended: bool


@router.post("/contractors/{contractor_id}/suspend", response_model=ContractorProfileOut)
def set_suspended(
    contractor_id: str,
    payload: SuspendPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    previous = cp.is_suspended
    cp.is_suspended = payload.suspended
    db.commit()
    db.refresh(cp)
    log_action(
        db,
        actor_id=admin.id,
        action="contractor.suspend" if payload.suspended else "contractor.reactivate",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=str(previous),
        new_value=str(payload.suspended),
    )
    return cp


# ---------- payment override (spec P0: admin can activate a verified
# contractor's marketplace access without a real subscription, but only
# with a recorded reason — every grant/revoke is audited) ----------

class PaymentOverrideGrant(BaseModel):
    reason: str


@router.post("/contractors/{contractor_id}/payment-override", response_model=ContractorProfileOut)
def grant_payment_override(
    contractor_id: str,
    payload: PaymentOverrideGrant,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reason is required to grant a payment override.")

    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")

    previous = cp.payment_override_active
    db.add(PaymentOverride(contractor_id=contractor_id, granted_by=admin.id, reason=reason))
    cp.payment_override_active = True
    db.commit()
    db.refresh(cp)

    log_action(
        db,
        actor_id=admin.id,
        action="payment_override.grant",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=str(previous),
        new_value="True",
        reason=reason,
    )

    user = db.get(User, contractor_id)
    return ContractorProfileOut(**_profile_fields(cp), email=user.email if user else None)


class PaymentOverrideRevoke(BaseModel):
    reason: str | None = None


@router.post("/contractors/{contractor_id}/payment-override/revoke", response_model=ContractorProfileOut)
def revoke_payment_override(
    contractor_id: str,
    payload: PaymentOverrideRevoke,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cp = db.get(ContractorProfile, contractor_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Contractor not found.")

    previous = cp.payment_override_active
    active = (
        db.query(PaymentOverride)
        .filter(PaymentOverride.contractor_id == contractor_id, PaymentOverride.revoked_at.is_(None))
        .order_by(PaymentOverride.created_at.desc())
        .first()
    )
    if active:
        active.revoked_by = admin.id
        active.revoked_at = datetime.utcnow()
    cp.payment_override_active = False
    db.commit()
    db.refresh(cp)

    log_action(
        db,
        actor_id=admin.id,
        action="payment_override.revoke",
        target_type="contractor_profile",
        target_id=contractor_id,
        previous_value=str(previous),
        new_value="False",
        reason=payload.reason,
    )

    user = db.get(User, contractor_id)
    return ContractorProfileOut(**_profile_fields(cp), email=user.email if user else None)


@router.get("/contractors/{contractor_id}/payment-overrides")
def list_payment_overrides(contractor_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(PaymentOverride)
        .filter(PaymentOverride.contractor_id == contractor_id)
        .order_by(PaymentOverride.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "granted_by": r.granted_by,
            "reason": r.reason,
            "created_at": r.created_at,
            "revoked_by": r.revoked_by,
            "revoked_at": r.revoked_at,
        }
        for r in rows
    ]


@router.get("/contractors/{contractor_id}/audit-log")
def contractor_audit_log(contractor_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.target_type == "contractor_profile", AuditLog.target_id == contractor_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "actor_id": r.actor_id,
            "action": r.action,
            "previous_value": r.previous_value,
            "new_value": r.new_value,
            "reason": r.reason,
            "created_at": r.created_at,
        }
        for r in rows
    ]


# Permanently removes the contractor's account, which cascades through
# contractor_profiles → contractor_documents/offers via FK ON DELETE
# CASCADE. Blocked if the contractor has any reviews on record — those are
# part of the platform's public reputation history and reviews.contractor_id
# has no cascade by design, so a hard delete would otherwise violate that
# foreign key. Suspend instead to preserve history while cutting access.
@router.delete("/contractors/{contractor_id}", status_code=204)
def delete_contractor(contractor_id: str, db: Session = Depends(get_db)):
    review_count = db.query(Review).filter(Review.contractor_id == contractor_id).count()
    if review_count > 0:
        raise HTTPException(
            status_code=400,
            detail="This contractor has completed projects with reviews on record. Suspend the account instead of deleting it, to keep that history intact.",
        )

    docs_with_files = (
        db.query(ContractorDocument.file_path)
        .filter(ContractorDocument.contractor_id == contractor_id, ContractorDocument.file_path.isnot(None))
        .all()
    )
    paths = [p[0] for p in docs_with_files if p[0]]
    if paths:
        get_storage().delete("contractor-documents", paths)

    user = db.get(User, contractor_id)
    if not user:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    db.delete(user)  # cascades to contractor_profiles -> contractor_documents/offers
    db.commit()
    return None


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
