from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_contractor_profile, require_approved_contractor, require_marketplace_active_contractor
from app.models.enums import OfferStatus, ProjectStatus
from app.models.offer import Offer
from app.models.project import Project
from app.models.user import User
from app.schemas.offer import OfferCreate, OfferOut
from app.services.email import notify_owner_new_offer

router = APIRouter(prefix="/projects/{project_id}/offers", tags=["offers"])


@router.get("/mine", response_model=OfferOut | None)
def my_offer(project_id: str, user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    return db.query(Offer).filter(Offer.project_id == project_id, Offer.contractor_id == user.id).first()


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

    # upsert on the (project_id, contractor_id) unique constraint — a
    # contractor revising their bid before the deadline updates the same
    # row rather than creating a duplicate.
    offer = (
        db.query(Offer).filter(Offer.project_id == project_id, Offer.contractor_id == user.id).first()
    )
    if offer:
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

    owner = db.get(User, project.owner_id)
    if owner:
        notify_owner_new_offer(owner.email, project.title, project_id, profile.company_name, float(payload.amount))

    return offer


@router.post("/withdraw", response_model=OfferOut)
def withdraw_offer(project_id: str, user: User = Depends(require_approved_contractor), db: Session = Depends(get_db)):
    offer = db.query(Offer).filter(Offer.project_id == project_id, Offer.contractor_id == user.id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="No offer to withdraw.")
    offer.status = OfferStatus.withdrawn
    offer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(offer)
    return offer
