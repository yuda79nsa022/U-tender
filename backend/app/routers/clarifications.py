from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_owner
from app.models.clarification import Clarification
from app.models.contractor import ContractorProfile
from app.models.enums import ProjectStatus, UserRole
from app.models.project import Project
from app.models.user import User
from app.routers.projects import _can_view_project
from app.schemas.clarification import ClarificationAnswer, ClarificationCreate, ClarificationOut
from app.services.email import notify_clarification_answered, notify_owner_new_clarification

router = APIRouter(prefix="/projects/{project_id}/clarifications", tags=["clarifications"])


def _serialize(c: Clarification, company_name: str | None) -> ClarificationOut:
    return ClarificationOut(
        id=c.id,
        project_id=c.project_id,
        contractor_id=c.contractor_id,
        question=c.question,
        answer=c.answer,
        shared_with_all=c.shared_with_all,
        created_at=c.created_at,
        answered_at=c.answered_at,
        contractor_company_name=company_name,
    )


# Visibility (spec §2.7, D-008): the owner and admin see everything. A
# contractor always sees their own questions (answer pending or not,
# shared or private) — but another contractor's question is visible only
# once it's both answered AND marked shared_with_all, so an unanswered or
# deliberately private Q&A never leaks to the rest of the field.
@router.get("", response_model=list[ClarificationOut])
def list_clarifications(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project or not _can_view_project(user, project, db):
        raise HTTPException(status_code=404, detail="Project not found.")

    rows = (
        db.query(Clarification, ContractorProfile)
        .join(ContractorProfile, Clarification.contractor_id == ContractorProfile.user_id)
        .filter(Clarification.project_id == project_id)
        .order_by(Clarification.created_at.asc())
        .all()
    )

    is_owner_or_admin = user.role == UserRole.admin or project.owner_id == user.id
    out = []
    for c, cp in rows:
        if is_owner_or_admin or c.contractor_id == user.id or (c.shared_with_all and c.answer is not None):
            out.append(_serialize(c, cp.company_name))
    return out


@router.post("", response_model=ClarificationOut, status_code=201)
def ask_clarification(
    project_id: str, payload: ClarificationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if user.role != UserRole.contractor:
        raise HTTPException(status_code=403, detail="Only contractors can ask clarification questions.")

    project = db.get(Project, project_id)
    if not project or not _can_view_project(user, project, db):
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.status != ProjectStatus.open:
        raise HTTPException(status_code=400, detail="Questions can only be asked while bidding is open.")

    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Enter a question.")

    clarification = Clarification(
        project_id=project_id, contractor_id=user.id, question=question, shared_with_all=payload.shared_with_all
    )
    db.add(clarification)
    db.commit()
    db.refresh(clarification)

    owner = db.get(User, project.owner_id)
    if owner:
        notify_owner_new_clarification(owner.email, project.title, project_id)

    profile = db.get(ContractorProfile, user.id)
    return _serialize(clarification, profile.company_name if profile else None)


@router.post("/{clarification_id}/answer", response_model=ClarificationOut)
def answer_clarification(
    project_id: str,
    clarification_id: str,
    payload: ClarificationAnswer,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")

    clarification = db.get(Clarification, clarification_id)
    if not clarification or clarification.project_id != project_id:
        raise HTTPException(status_code=404, detail="Question not found.")
    if clarification.answer is not None:
        raise HTTPException(status_code=400, detail="This question has already been answered.")

    answer = payload.answer.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Enter an answer.")

    clarification.answer = answer
    clarification.answered_at = datetime.utcnow()
    db.commit()
    db.refresh(clarification)

    contractor_user = db.get(User, clarification.contractor_id)
    if contractor_user:
        notify_clarification_answered(contractor_user.email, project.title, project_id)

    profile = db.get(ContractorProfile, clarification.contractor_id)
    return _serialize(clarification, profile.company_name if profile else None)
