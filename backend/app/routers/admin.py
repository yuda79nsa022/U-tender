from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.cms_content import CmsContent
from app.models.contractor import ContractorProfile
from app.models.document import ContractorDocument, DocumentRequirement, OwnerDocument
from app.models.enums import DocumentStatus, Language, NotificationType, UserRole, VerificationStatus
from app.models.offer import Offer
from app.models.owner import OwnerProfile
from app.models.payment_override import PaymentOverride
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.schemas.cms import CmsContentOut, CmsContentUpsert
from app.schemas.contractor import ContractorProfileOut, ContractorProfileUpdate
from app.schemas.document import (
    ContractorDocumentOut,
    DocumentExpiryUpdate,
    DocumentRequirementCreate,
    DocumentRequirementOut,
    OwnerDocumentOut,
    ReviewDocumentDecision,
    ReviewOwnerDocumentDecision,
)
from app.schemas.owner import OwnerProfileOut
from app.services.audit import log_action
from app.services.notify import notify
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
        applies_to=payload.applies_to,
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
    _get_active_contractor_profile(db, payload.contractor_id)

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

    requirement = db.get(DocumentRequirement, payload.requirement_id)
    contractor_user = db.get(User, payload.contractor_id)
    if contractor_user and requirement and payload.decision in (DocumentStatus.approved, DocumentStatus.rejected):
        notification_type = (
            NotificationType.document_approved if payload.decision == DocumentStatus.approved else NotificationType.document_rejected
        )
        notify(db, contractor_user, notification_type, link="/contractor/status", requirement_name=requirement.name)

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
    contractor_user = db.get(User, contractor_id)
    if contractor_user:
        notify(db, contractor_user, NotificationType.verification_activated, link="/contractor/dashboard")
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

def _get_active_contractor_profile(db: Session, contractor_id: str) -> ContractorProfile:
    """Same reasoning as _get_active_owner_profile below (defined once
    OwnerProfile existed and this mirror was written to match): the
    documented way to create an admin is to sign up as an owner OR
    contractor and flip the role column, which leaves a real
    contractor_profiles row behind for an account that's no longer a
    contractor. Every mutation below goes through this instead of a bare
    db.get(ContractorProfile, contractor_id)."""
    cp = db.get(ContractorProfile, contractor_id)
    user = db.get(User, contractor_id)
    if not cp or not user or user.role != UserRole.contractor:
        raise HTTPException(status_code=404, detail="Contractor not found.")
    return cp


@router.get("/contractors", response_model=list[ContractorProfileOut])
def list_contractors(db: Session = Depends(get_db)):
    rows = (
        db.query(ContractorProfile, User)
        .join(User, ContractorProfile.user_id == User.id)
        .filter(User.role == UserRole.contractor)
        .all()
    )
    return [ContractorProfileOut(**_profile_fields(cp), email=u.email) for cp, u in rows]


@router.get("/contractors/{contractor_id}")
def contractor_detail(contractor_id: str, db: Session = Depends(get_db)):
    cp = _get_active_contractor_profile(db, contractor_id)
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
    cp = _get_active_contractor_profile(db, contractor_id)
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
    cp = _get_active_contractor_profile(db, contractor_id)
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
    cp = _get_active_contractor_profile(db, contractor_id)
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
    contractor_user = db.get(User, contractor_id)
    if contractor_user:
        notify(
            db,
            contractor_user,
            NotificationType.contractor_suspended if payload.suspended else NotificationType.contractor_reactivated,
            link="/contractor/dashboard",
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

    cp = _get_active_contractor_profile(db, contractor_id)

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
    if user:
        notify(db, user, NotificationType.payment_override_granted, link="/contractor/dashboard")
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
    cp = _get_active_contractor_profile(db, contractor_id)

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
    if user:
        notify(db, user, NotificationType.payment_override_revoked, link="/contractor/dashboard")
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


# ---------- public-site CMS (spec §14, §2.9) ----------

class CmsEntry(BaseModel):
    key: str
    en: str
    ar: str


@router.get("/cms", response_model=list[CmsEntry])
def list_cms(db: Session = Depends(get_db)):
    from app.routers.public import DEFAULT_CMS

    keys = set(DEFAULT_CMS.keys()) | {row.key for row in db.query(CmsContent.key).distinct().all()}
    overrides = {(row.key, row.language): row.value for row in db.query(CmsContent).all()}

    def resolve(key: str, lang: Language) -> str:
        if (key, lang) in overrides:
            return overrides[(key, lang)]
        return DEFAULT_CMS.get(key, {}).get(lang.value, "")

    return [CmsEntry(key=k, en=resolve(k, Language.en), ar=resolve(k, Language.ar)) for k in sorted(keys)]


@router.put("/cms/{key}/{language}", response_model=CmsContentOut)
def upsert_cms(
    key: str, language: Language, payload: CmsContentUpsert, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    row = db.query(CmsContent).filter(CmsContent.key == key, CmsContent.language == language).first()
    previous = row.value if row else None
    if row:
        row.value = payload.value
    else:
        row = CmsContent(key=key, language=language, value=payload.value)
        db.add(row)
    db.commit()
    db.refresh(row)

    log_action(
        db,
        actor_id=admin.id,
        action="cms.update",
        target_type="cms_content",
        target_id=f"{key}:{language.value}",
        previous_value=previous,
        new_value=payload.value,
    )
    return row


@router.delete("/cms/{key}/{language}", status_code=204)
def reset_cms(key: str, language: Language, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Removes an admin override, reverting the public site back to the
    built-in default copy for this key/language."""
    row = db.query(CmsContent).filter(CmsContent.key == key, CmsContent.language == language).first()
    if row:
        previous_value = row.value
        db.delete(row)
        db.commit()
        log_action(
            db,
            actor_id=admin.id,
            action="cms.reset",
            target_type="cms_content",
            target_id=f"{key}:{language.value}",
            previous_value=previous_value,
            new_value=None,
        )
    return None


# Permanently removes the contractor's account, which cascades through
# contractor_profiles → contractor_documents/offers via FK ON DELETE
# CASCADE. Blocked if the contractor has any reviews on record — those are
# part of the platform's public reputation history and reviews.contractor_id
# has no cascade by design, so a hard delete would otherwise violate that
# foreign key. Suspend instead to preserve history while cutting access.
@router.delete("/contractors/{contractor_id}", status_code=204)
def delete_contractor(contractor_id: str, db: Session = Depends(get_db)):
    _get_active_contractor_profile(db, contractor_id)  # 404s outright for a since-promoted admin account

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


# ---------- owner management (mirrors the contractor management section
# above: list/detail, document review, verification approve/reject,
# suspend, delete) ----------

def _owner_fields(op: OwnerProfile, user: User | None) -> dict:
    return dict(
        user_id=op.user_id,
        verification_status=op.verification_status,
        is_suspended=op.is_suspended,
        marketplace_status=op.marketplace_status,
        created_at=op.created_at,
        email=user.email if user else None,
        full_name=user.full_name if user else None,
    )


def _get_active_owner_profile(db: Session, owner_id: str) -> OwnerProfile:
    """Looks up an OwnerProfile, but only for a user whose CURRENT role is
    still owner (see list_owners' comment above for why this matters: an
    admin created via the documented "sign up as owner, flip the role"
    path still has a real owner_profiles row underneath). Every owner
    mutation endpoint below goes through this rather than a bare
    db.get(OwnerProfile, owner_id), so none of them can act on a
    since-promoted account."""
    op = db.get(OwnerProfile, owner_id)
    user = db.get(User, owner_id)
    if not op or not user or user.role != UserRole.owner:
        raise HTTPException(status_code=404, detail="Owner not found.")
    return op


def _owner_documents(db: Session, owner_id: str) -> list[OwnerDocumentOut]:
    rows = (
        db.query(OwnerDocument, DocumentRequirement)
        .join(DocumentRequirement, OwnerDocument.requirement_id == DocumentRequirement.id)
        .filter(OwnerDocument.owner_id == owner_id)
        .all()
    )
    return [
        OwnerDocumentOut(
            id=d.id,
            owner_id=d.owner_id,
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


@router.get("/owners", response_model=list[OwnerProfileOut])
def list_owners(db: Session = Depends(get_db)):
    # Filtered to users whose CURRENT role is still owner: the documented
    # way to create an admin account is to sign up as an owner (or
    # contractor) and flip that row's role in the database (see README's
    # "Create your first admin"), which leaves a real owner_profiles row
    # behind for an account that is no longer an owner. Without this
    # filter, every admin created that way would show up in this list and
    # be manageable as if they were a property owner.
    rows = (
        db.query(OwnerProfile, User)
        .join(User, OwnerProfile.user_id == User.id)
        .filter(User.role == UserRole.owner)
        .all()
    )
    project_counts = dict(db.query(Project.owner_id, func.count(Project.id)).group_by(Project.owner_id).all())
    return [
        OwnerProfileOut(**_owner_fields(op, u), project_count=project_counts.get(op.user_id, 0)) for op, u in rows
    ]


@router.get("/owners/{owner_id}")
def owner_detail(owner_id: str, db: Session = Depends(get_db)):
    op = db.get(OwnerProfile, owner_id)
    user = db.get(User, owner_id)
    if not op or not user or user.role != UserRole.owner:
        raise HTTPException(status_code=404, detail="Owner not found.")
    project_count = db.query(Project).filter(Project.owner_id == owner_id).count()
    return {
        "owner": OwnerProfileOut(**_owner_fields(op, user), project_count=project_count),
        "documents": _owner_documents(db, owner_id),
    }


@router.post("/review/owner-documents", response_model=OwnerDocumentOut)
def review_owner_document(
    payload: ReviewOwnerDocumentDecision, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    doc = (
        db.query(OwnerDocument)
        .filter(OwnerDocument.owner_id == payload.owner_id, OwnerDocument.requirement_id == payload.requirement_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    _get_active_owner_profile(db, payload.owner_id)

    doc.status = payload.decision
    doc.admin_note = (payload.note or "Document rejected — please re-upload.") if payload.decision == DocumentStatus.rejected else None
    doc.reviewed_by = admin.id
    doc.reviewed_at = datetime.utcnow()
    if payload.decision == DocumentStatus.approved:
        doc.expires_on = payload.expires_on
    db.commit()

    if payload.decision == DocumentStatus.rejected:
        op = db.get(OwnerProfile, payload.owner_id)
        if op:
            op.verification_status = VerificationStatus.changes_requested
            db.commit()

    requirement = db.get(DocumentRequirement, payload.requirement_id)
    owner_user = db.get(User, payload.owner_id)
    if owner_user and requirement and payload.decision in (DocumentStatus.approved, DocumentStatus.rejected):
        notification_type = (
            NotificationType.owner_document_approved
            if payload.decision == DocumentStatus.approved
            else NotificationType.owner_document_rejected
        )
        notify(db, owner_user, notification_type, link="/owner/status", requirement_name=requirement.name)

    db.refresh(doc)
    return doc


@router.post("/review/owners/{owner_id}/approve", response_model=OwnerProfileOut)
def approve_owner(owner_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    op = _get_active_owner_profile(db, owner_id)

    docs = (
        db.query(OwnerDocument, DocumentRequirement)
        .join(DocumentRequirement, OwnerDocument.requirement_id == DocumentRequirement.id)
        .filter(OwnerDocument.owner_id == owner_id)
        .all()
    )
    missing_approval = any(r.is_required and d.status != DocumentStatus.approved for d, r in docs)
    if missing_approval:
        raise HTTPException(status_code=400, detail="All required documents must be approved before approving this owner.")

    previous = op.verification_status.value
    op.verification_status = VerificationStatus.approved
    db.commit()
    db.refresh(op)
    log_action(
        db,
        actor_id=admin.id,
        action="owner_verification_status.set",
        target_type="owner_profile",
        target_id=owner_id,
        previous_value=previous,
        new_value=VerificationStatus.approved.value,
    )
    owner_user = db.get(User, owner_id)
    if owner_user:
        notify(db, owner_user, NotificationType.owner_verification_activated, link="/owner/dashboard")
    return OwnerProfileOut(**_owner_fields(op, owner_user))


@router.post("/review/owners/{owner_id}/reject", response_model=OwnerProfileOut)
def reject_owner_application(owner_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    op = _get_active_owner_profile(db, owner_id)
    previous = op.verification_status.value
    op.verification_status = VerificationStatus.changes_requested
    db.commit()
    db.refresh(op)
    log_action(
        db,
        actor_id=admin.id,
        action="owner_verification_status.set",
        target_type="owner_profile",
        target_id=owner_id,
        previous_value=previous,
        new_value=VerificationStatus.changes_requested.value,
    )
    user = db.get(User, owner_id)
    return OwnerProfileOut(**_owner_fields(op, user))


class OwnerSuspendPatch(BaseModel):
    suspended: bool


@router.post("/owners/{owner_id}/suspend", response_model=OwnerProfileOut)
def set_owner_suspended(
    owner_id: str, payload: OwnerSuspendPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    op = _get_active_owner_profile(db, owner_id)
    previous = op.is_suspended
    op.is_suspended = payload.suspended
    db.commit()
    db.refresh(op)
    log_action(
        db,
        actor_id=admin.id,
        action="owner.suspend" if payload.suspended else "owner.reactivate",
        target_type="owner_profile",
        target_id=owner_id,
        previous_value=str(previous),
        new_value=str(payload.suspended),
    )
    owner_user = db.get(User, owner_id)
    if owner_user:
        notify(
            db,
            owner_user,
            NotificationType.owner_suspended if payload.suspended else NotificationType.owner_reactivated,
            link="/owner/dashboard",
        )
    return OwnerProfileOut(**_owner_fields(op, owner_user))


# Permanently removes the owner's account. Unlike delete_contractor
# (which only cascades to that contractor's own documents/offers —
# projects and other bidders' data are untouched), projects.owner_id has
# ON DELETE CASCADE: deleting an owner would silently wipe every project
# they ever posted, including drawings, clarifications, and every
# CONTRACTOR'S offers/reviews on those projects — data that belongs to
# other users, not just this owner. That blast radius is too large for a
# routine "remove this account" action, so deletion is blocked outright
# once the owner has posted anything; suspend instead.
@router.delete("/owners/{owner_id}", status_code=204)
def delete_owner(owner_id: str, db: Session = Depends(get_db)):
    _get_active_owner_profile(db, owner_id)  # 404s outright for a since-promoted admin account

    project_count = db.query(Project).filter(Project.owner_id == owner_id).count()
    if project_count > 0:
        raise HTTPException(
            status_code=400,
            detail="This owner has posted projects. Suspend the account instead of deleting it, to keep that project and offer history intact for the contractors involved.",
        )

    docs_with_files = (
        db.query(OwnerDocument.file_path)
        .filter(OwnerDocument.owner_id == owner_id, OwnerDocument.file_path.isnot(None))
        .all()
    )
    paths = [p[0] for p in docs_with_files if p[0]]
    if paths:
        get_storage().delete("owner-documents", paths)

    user = db.get(User, owner_id)
    if not user:
        raise HTTPException(status_code=404, detail="Owner not found.")
    db.delete(user)  # cascades to owner_profiles -> owner_documents
    db.commit()
    return None


# ---------- all offers, across every project (platform-wide operational
# visibility for admins) — unlike the owner-facing endpoint this doesn't
# redact sealed-and-still-open bids: the sealed-tender rule exists to stop
# the AWARDING party from favoring a bidder they recognize, a concern that
# doesn't apply to the platform operator, who can already see the award
# record and audit log for any project regardless of seal status. ----------

@router.get("/offers")
def list_all_offers(db: Session = Depends(get_db)):
    rows = (
        db.query(Offer, Project, ContractorProfile)
        .join(Project, Offer.project_id == Project.id)
        .outerjoin(ContractorProfile, Offer.contractor_id == ContractorProfile.user_id)
        .order_by(Offer.created_at.desc())
        .all()
    )
    return [
        {
            "id": o.id,
            "project_id": p.id,
            "project_title": p.title,
            "project_status": p.status,
            "tender_type": p.tender_type,
            "contractor_id": o.contractor_id,
            "contractor_company_name": cp.company_name if cp else None,
            "amount": str(o.amount) if o.amount is not None else None,
            "timeline_estimate": o.timeline_estimate,
            "status": o.status,
            "revision": o.revision,
            "created_at": o.created_at,
            "updated_at": o.updated_at,
        }
        for o, p, cp in rows
    ]


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
