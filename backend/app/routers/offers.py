from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_contractor_profile, require_approved_contractor, require_marketplace_active_contractor
from app.models.enums import NotificationType, OfferStatus, ProjectStatus, TenderType
from app.models.offer import Offer, OfferRevision
from app.models.project import Project
from app.models.user import User
from app.schemas.offer import OfferCreate, OfferOut, OfferRevisionOut
from app.services.email import notify_owner_new_offer
from app.services.notify import notify

router = APIRouter(prefix="/projects/{project_id}/offers", tags=["offers"])


@router.get("/mine", response_model=OfferOut | None)
def my_offer(project_id: str, user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    return db.query(Offer).filter(Offer.project_id == project_id, Offer.contractor_id == user.id).first()


@router.get("/mine/history", response_model=list[OfferRevisionOut])
def my_offer_history(project_id: str, user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    offer = db.query(Offer).filter(Offer.project_id == project_id, Offer.contractor_id == user.id).first()
    if not offer:
        return []
    return (
        db.query(OfferRevision)
        .filter(OfferRevision.offer_id == offer.id)
        .order_by(OfferRevision.revision_number.asc())
        .all()
    )


def _snapshot_revision(db: Session, offer: Offer) -> None:
    """Freezes the CURRENT (pre-edit) state of this offer into an
    OfferRevision row before it gets overwritten, then bumps the counter.
    Called for every edit and every withdrawal — the row in `offers` is
    always the latest state, `offer_revisions` is the append-only trail of
    everything it used to be (spec §29, D-009)."""
    db.add(
        OfferRevision(
            offer_id=offer.id,
            revision_number=offer.revision,
            amount=offer.amount,
            timeline_estimate=offer.timeline_estimate,
            message=offer.message,
            status=offer.status,
        )
    )
    offer.revision += 1


@router.post("", response_model=OfferOut)
def submit_offer(
    project_id: str,
    payload: OfferCreate,
    user: User = Depends(require_marketplace_active_contractor),
    db: Session = Depends(get_db),
):
    profile = get_contractor_profile(user, db)

    project = db.get(Project, project_id)
    if not project or project.status != ProjectStatus.open or project.bid_deadline < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Bidding on this project is closed.")

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Enter a valid bid amount.")

    # SELECT ... FOR UPDATE: two near-simultaneous edits from the same
    # contractor (double-click, retried request) would otherwise both read
    # the same pre-edit revision number and race to write it, corrupting
    # the sequence in offer_revisions. Locking the row for the duration of
    # this transaction serializes them. (SQLite, used in this app's tests,
    # has no row-level locking and silently ignores this — the guarantee
    # is real only against MySQL, this app's actual database.)
    offer = (
        db.query(Offer)
        .filter(Offer.project_id == project_id, Offer.contractor_id == user.id)
        .with_for_update()
        .first()
    )
    if offer:
        # upsert on the (project_id, contractor_id) unique constraint — a
        # contractor revising their bid before the deadline updates the
        # same row rather than creating a duplicate, but the prior values
        # are snapshotted first so nothing is silently lost.
        _snapshot_revision(db, offer)
        offer.amount = payload.amount
        offer.timeline_estimate = payload.timeline_estimate
        offer.message = payload.message
        offer.status = OfferStatus.submitted
        offer.updated_at = datetime.utcnow()
    else:
        offer = Offer(
            project_id=project_id,
            contractor_id=user.id,
            amount=payload.amount,
            timeline_estimate=payload.timeline_estimate,
            message=payload.message,
            status=OfferStatus.submitted,
        )
        db.add(offer)
    # The tender type is a material term of the tender — once at least one
    # bid exists, the owner can no longer switch sealed <-> owner-visible
    # out from under bidders (spec §19-21, D-001). Idempotent: stays locked
    # on every subsequent revision too.
    if not project.tender_type_locked:
        project.tender_type_locked = True
    db.commit()
    db.refresh(offer)

    sealed = project.tender_type == TenderType.sealed and project.status == ProjectStatus.open
    owner = db.get(User, project.owner_id)
    if owner:
        notify_owner_new_offer(owner.email, project.title, project_id, profile.company_name, float(payload.amount), sealed=sealed)
        notify(
            db,
            owner,
            NotificationType.bid_submitted,
            link=f"/owner/projects/{project_id}",
            project_title=project.title,
            contractor_name="A contractor" if sealed else profile.company_name,
        )

    return offer


@router.post("/withdraw", response_model=OfferOut)
def withdraw_offer(project_id: str, user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    offer = (
        db.query(Offer)
        .filter(Offer.project_id == project_id, Offer.contractor_id == user.id)
        .with_for_update()
        .first()
    )
    if not offer:
        raise HTTPException(status_code=404, detail="No offer to withdraw.")
    if offer.status == OfferStatus.withdrawn:
        raise HTTPException(status_code=400, detail="This offer has already been withdrawn.")
    _snapshot_revision(db, offer)
    offer.status = OfferStatus.withdrawn
    offer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(offer)
    return offer
