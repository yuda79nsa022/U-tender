from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import ContractorDocument, DocumentRequirement


# Called once when a contractor account is first created, so the
# verification checklist has a "not_submitted" row per active requirement
# to render immediately. Skips requirements the contractor already has a
# row for, so re-running this (e.g. a retry) never duplicates one — mirrors
# ensureDocumentRows in the original src/app/contractor/verify/actions.ts.
def ensure_document_rows(db: Session, contractor_id: str) -> None:
    requirement_ids = set(
        db.scalars(select(DocumentRequirement.id).where(DocumentRequirement.is_active.is_(True))).all()
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
