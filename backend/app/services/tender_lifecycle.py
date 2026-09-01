from datetime import datetime

from sqlalchemy.orm import Session

from app.models.enums import OfferStatus, ProjectStatus, TenderType
from app.models.offer import Offer
from app.models.project import Project


# The single predicate behind the sealed-bid privacy rule (spec §19-21,
# D-001): while true, bidder identity/amount/message must never reach the
# owner through ANY endpoint — offers list, offer history, notifications,
# email, or clarifications. Centralized here so every call site (owner.py's
# offers list/history, clarifications.py's Q&A list) shares one definition
# instead of each re-deriving it and risking drift.
def is_sealed_and_open(project: Project) -> bool:
    return project.tender_type == TenderType.sealed and project.status == ProjectStatus.open


# Bidding isn't cron-driven — a project's deadline passing is detected
# lazily, the first time anything reads it, and written through so the
# stored status is never stale for more than one request. Only 'open'
# projects past their deadline ever move here; every other status
# (draft, under_evaluation, awarded, no_award, canceled, expired itself)
# is either not yet started or already terminal/owner-driven, so this
# never fights a manual lifecycle action.
def sync_expired_projects(db: Session) -> None:
    now = datetime.utcnow()
    stale = db.query(Project).filter(Project.status == ProjectStatus.open, Project.bid_deadline <= now).all()
    if not stale:
        return
    for project in stale:
        has_live_offer = (
            db.query(Offer.id)
            .filter(Offer.project_id == project.id, Offer.status == OfferStatus.submitted)
            .first()
            is not None
        )
        # closed: at least one live bid, waiting on the owner to evaluate.
        # expired: nobody bid (or every bid was withdrawn) — nothing to
        # evaluate, so it never needs an owner decision to leave "open".
        project.status = ProjectStatus.closed if has_live_offer else ProjectStatus.expired
    db.commit()
