from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_owner
from app.models.contractor import ContractorProfile
from app.models.enums import OfferStatus, ProjectStatus
from app.models.offer import Offer
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.schemas.offer import OfferOut
from app.schemas.project import ProjectOut
from app.schemas.review import ReviewCreate, ReviewOut
from app.services.email import notify_contractor_offer_decision
from app.services.tender_lifecycle import sync_expired_projects

router = APIRouter(prefix="/owner", tags=["owner"])


def _get_owned_project(project_id: str, user: User, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("/projects", response_model=list[ProjectOut])
def dashboard(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    sync_expired_projects(db)
    projects = (
        db.query(Project).filter(Project.owner_id == user.id).order_by(Project.created_at.desc()).all()
    )
    out = []
    for p in projects:
        offer_count = db.query(Offer).filter(Offer.project_id == p.id).count()
        out.append(ProjectOut(**_project_fields(p), offer_count=offer_count))
    return out


@router.get("/projects/{project_id}/offers", response_model=list[OfferOut])
def list_offers(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    project = _get_owned_project(project_id, user, db)

    offers = (
        db.query(Offer, ContractorProfile)
        .join(ContractorProfile, Offer.contractor_id == ContractorProfile.user_id)
        .filter(Offer.project_id == project_id)
        .order_by(Offer.amount.asc())
        .all()
    )
    return [
        OfferOut(
            id=o.id,
            project_id=o.project_id,
            contractor_id=o.contractor_id,
            amount=o.amount,
            timeline_estimate=o.timeline_estimate,
            message=o.message,
            status=o.status,
            created_at=o.created_at,
            updated_at=o.updated_at,
            contractor_company_name=cp.company_name,
            contractor_avg_rating=cp.avg_rating,
            contractor_review_count=cp.review_count,
        )
        for o, cp in offers
    ]


@router.post("/projects/{project_id}/offers/{offer_id}/approve", response_model=ProjectOut)
def approve_offer(project_id: str, offer_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    sync_expired_projects(db)
    project = _get_owned_project(project_id, user, db)
    # Awarding is only meaningful once bidding has actually stopped — the
    # full lifecycle (spec §2.12) makes "open" and "draft" ineligible, not
    # just "already awarded". A deadline that just passed is caught by the
    # sync_expired_projects() call above before this check runs.
    if project.status not in (ProjectStatus.closed, ProjectStatus.under_evaluation):
        detail = (
            "This project has already been awarded, canceled, or has no award."
            if project.status in (ProjectStatus.awarded, ProjectStatus.canceled, ProjectStatus.no_award, ProjectStatus.expired)
            else "Close bidding before awarding an offer."
        )
        raise HTTPException(status_code=400, detail=detail)

    winning_offer = db.get(Offer, offer_id)
    if not winning_offer or winning_offer.project_id != project_id:
        raise HTTPException(status_code=404, detail="Offer not found.")

    other_offers = (
        db.query(Offer).filter(Offer.project_id == project_id, Offer.id != offer_id).all()
    )

    winning_offer.status = OfferStatus.approved
    winning_offer.updated_at = datetime.utcnow()
    for o in other_offers:
        o.status = OfferStatus.rejected
        o.updated_at = datetime.utcnow()
    project.status = ProjectStatus.awarded
    db.commit()

    # Best-effort — notification failures never roll back the award itself.
    winner_user = db.get(User, winning_offer.contractor_id)
    if winner_user:
        notify_contractor_offer_decision(winner_user.email, project.title, approved=True)
    for o in other_offers:
        loser_user = db.get(User, o.contractor_id)
        if loser_user:
            notify_contractor_offer_decision(loser_user.email, project.title, approved=False)

    db.refresh(project)
    offer_count = db.query(Offer).filter(Offer.project_id == project_id).count()
    return ProjectOut(**_project_fields(project), offer_count=offer_count)


# ---------- lifecycle actions (spec §2.12 full tender lifecycle) ----------
# Every transition below is an explicit owner decision; the only automatic
# one is open -> closed/expired, handled lazily by sync_expired_projects.

def _project_response(project: Project, db: Session) -> ProjectOut:
    offer_count = db.query(Offer).filter(Offer.project_id == project.id).count()
    return ProjectOut(**_project_fields(project), offer_count=offer_count)


@router.post("/projects/{project_id}/publish", response_model=ProjectOut)
def publish_project(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    project = _get_owned_project(project_id, user, db)
    if project.status != ProjectStatus.draft:
        raise HTTPException(status_code=400, detail="Only a draft project can be published.")
    if project.bid_deadline <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Set a bid deadline in the future before publishing.")
    project.status = ProjectStatus.open
    db.commit()
    db.refresh(project)
    return _project_response(project, db)


@router.post("/projects/{project_id}/close", response_model=ProjectOut)
def close_project(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Manually stop accepting bids before the deadline — e.g. the owner is
    satisfied with what's in hand and wants to move straight to evaluation."""
    project = _get_owned_project(project_id, user, db)
    if project.status != ProjectStatus.open:
        raise HTTPException(status_code=400, detail="Only an open project can be closed.")
    project.status = ProjectStatus.closed
    db.commit()
    db.refresh(project)
    return _project_response(project, db)


@router.post("/projects/{project_id}/start-evaluation", response_model=ProjectOut)
def start_evaluation(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    sync_expired_projects(db)
    project = _get_owned_project(project_id, user, db)
    if project.status != ProjectStatus.closed:
        raise HTTPException(status_code=400, detail="Only a closed project can enter evaluation.")
    project.status = ProjectStatus.under_evaluation
    db.commit()
    db.refresh(project)
    return _project_response(project, db)


@router.post("/projects/{project_id}/no-award", response_model=ProjectOut)
def mark_no_award(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    sync_expired_projects(db)
    project = _get_owned_project(project_id, user, db)
    if project.status not in (ProjectStatus.closed, ProjectStatus.under_evaluation):
        raise HTTPException(status_code=400, detail="Only a closed or under-evaluation project can be marked no-award.")
    project.status = ProjectStatus.no_award
    db.commit()
    db.refresh(project)
    return _project_response(project, db)


@router.post("/projects/{project_id}/cancel", response_model=ProjectOut)
def cancel_project(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    sync_expired_projects(db)
    project = _get_owned_project(project_id, user, db)
    if project.status not in (ProjectStatus.draft, ProjectStatus.open, ProjectStatus.closed, ProjectStatus.under_evaluation):
        raise HTTPException(status_code=400, detail="This project can no longer be canceled.")
    project.status = ProjectStatus.canceled
    db.commit()
    db.refresh(project)
    return _project_response(project, db)


@router.get("/projects/{project_id}/review", response_model=ReviewOut | None)
def get_review(project_id: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return db.query(Review).filter(Review.project_id == project_id).first()


@router.post("/reviews", response_model=ReviewOut)
def submit_review(payload: ReviewCreate, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    project = db.get(Project, payload.project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.status != ProjectStatus.awarded:
        raise HTTPException(status_code=400, detail="You can only review a project after it's awarded.")

    existing = db.query(Review).filter(Review.project_id == payload.project_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="A review already exists for this project.")

    review = Review(
        project_id=payload.project_id,
        owner_id=user.id,
        contractor_id=payload.contractor_id,
        rating=payload.rating,
        comment=payload.comment or None,
    )
    db.add(review)
    db.commit()

    # Recompute the contractor's public average rather than trusting an
    # incrementally-maintained counter, so it can never drift out of sync.
    all_reviews = db.query(Review.rating).filter(Review.contractor_id == payload.contractor_id).all()
    review_count = len(all_reviews)
    avg_rating = round(sum(r[0] for r in all_reviews) / review_count, 1) if review_count else 0

    profile = db.get(ContractorProfile, payload.contractor_id)
    if profile:
        profile.avg_rating = avg_rating
        profile.review_count = review_count
        db.commit()

    db.refresh(review)
    return review


def _project_fields(p: Project) -> dict:
    return dict(
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
    )
