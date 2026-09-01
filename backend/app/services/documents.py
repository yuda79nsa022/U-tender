from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import ContractorDocument, DocumentRequirement, OwnerDocument
from app.models.enums import UserRole


# Called once when a contractor account is first created, so the
# verification checklist has a "not_submitted" row per active,
# contractor-scoped requirement to render immediately. Skips requirements
# the contractor already has a row for, so re-running this (e.g. a retry)
# never duplicates one — mirrors ensureDocumentRows in the original
# src/app/contractor/verify/actions.ts.
def ensure_document_rows(db: Session, contractor_id: str) -> None:
    requirement_ids = set(
        db.scalars(
            select(DocumentRequirement.id).where(
                DocumentRequirement.is_active.is_(True), DocumentRequirement.applies_to == UserRole.contractor
            )
        ).all()
    )
    if not requirement_ids:
        return

    existing_ids = set(
        db.scalars(
            select(ContractorDocument.requirement_id).where(ContractorDocument.contractor_id == contractor_id)
        ).all()
    )

    missing_ids = requirement_ids - existing_ids
    for requirement_id in missing_ids:
        db.add(ContractorDocument(contractor_id=contractor_id, requirement_id=requirement_id))
    db.commit()


# Same idea as ensure_document_rows, for the owner-side checklist
# (civil ID, land ownership proof, or whatever else an admin adds under
# Admin -> Document requirements scoped to "owner").
def ensure_owner_document_rows(db: Session, owner_id: str) -> None:
    requirement_ids = set(
        db.scalars(
            select(DocumentRequirement.id).where(
                DocumentRequirement.is_active.is_(True), DocumentRequirement.applies_to == UserRole.owner
            )
        ).all()
    )
    if not requirement_ids:
        return

    existing_ids = set(
        db.scalars(select(OwnerDocument.requirement_id).where(OwnerDocument.owner_id == owner_id)).all()
    )

    missing_ids = requirement_ids - existing_ids
    for requirement_id in missing_ids:
        db.add(OwnerDocument(owner_id=owner_id, requirement_id=requirement_id))
    db.commit()
