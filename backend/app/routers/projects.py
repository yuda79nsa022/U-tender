from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.db import get_db
from app.deps import get_current_user
from app.models.contractor import ContractorProfile
from app.models.enums import UserRole
from app.models.offer import Offer
from app.models.project import Project, ProjectDrawing
from app.models.user import User
from app.schemas.project import DrawingOut, ProjectCreate, ProjectDetailOut
from app.services.drawings import upload_drawings_for_project
from app.services.storage import drawing_url_expiry_seconds, get_storage

router = APIRouter(prefix="/projects", tags=["projects"])


def _can_view_project(user: User, project: Project, db: Session) -> bool:
    if user.role == UserRole.admin or project.owner_id == user.id:
        return True
    if user.role != UserRole.contractor:
        return False
    if project.status.value not in ("open", "closed", "awarded"):
        return False
    profile = db.get(ContractorProfile, user.id)
    return bool(profile and profile.verification_status.value == "approved" and not profile.is_suspended)


@router.post("", response_model=ProjectDetailOut, status_code=201)
async def create_project(
    title: str = Form(...),
    address: str = Form(...),
    description: str | None = Form(None),
    trade: str | None = Form(None),
    bid_deadline: str = Form(...),
    drawings: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owners can post projects.")

    from datetime import datetime

    project = Project(
        owner_id=user.id,
        title=title,
        address=address,
        description=description or None,
        trade=trade or None,
        bid_deadline=datetime.fromisoformat(bid_deadline),
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    real_files = [f for f in drawings if f.filename]
    if real_files:
        await upload_drawings_for_project(db, get_storage(), project.id, real_files)
        db.refresh(project)

    return _serialize_detail(project, db)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project or not _can_view_project(user, project, db):
        raise HTTPException(status_code=404, detail="Project not found.")
    return _serialize_detail(project, db)


@router.post("/{project_id}/drawings", response_model=ProjectDetailOut)
async def add_drawings(
    project_id: str,
    drawings: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")

    real_files = [f for f in drawings if f.filename]
    await upload_drawings_for_project(db, get_storage(), project_id, real_files)
    db.refresh(project)
    return _serialize_detail(project, db)


@router.get("/{project_id}/drawings-zip")
def download_drawings_zip(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import io
    import zipfile

    project = db.get(Project, project_id)
    if not project or not _can_view_project(user, project, db):
        raise HTTPException(status_code=404, detail="Project not found.")

    drawings = db.query(ProjectDrawing).filter(ProjectDrawing.project_id == project_id).all()
    if not drawings:
        raise HTTPException(status_code=404, detail="No drawings on this project.")

    storage = get_storage()
    buffer = io.BytesIO()
    included = 0
    with zipfile.ZipFile(buffer, "w") as zf:
        for d in drawings:
            content = storage.download("project-drawings", d.file_path)
            if content is None:
                continue
            zf.writestr(d.file_name, content)
            included += 1

    if included == 0:
        raise HTTPException(status_code=404, detail="No accessible drawings.")

    buffer.seek(0)
    safe_title = "".join(c for c in project.title if c.isalnum() or c in " _-").strip().replace(" ", "-") or "drawings"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}-drawings.zip"'},
    )


def _serialize_detail(project: Project, db: Session) -> ProjectDetailOut:
    offer_count = db.query(Offer).filter(Offer.project_id == project.id).count()
    storage = get_storage()
    expiry = drawing_url_expiry_seconds(project.bid_deadline)
    drawing_rows = db.query(ProjectDrawing).filter(ProjectDrawing.project_id == project.id).all()
    drawings = [
        DrawingOut(
            id=d.id,
            file_name=d.file_name,
            uploaded_at=d.uploaded_at,
            url=storage.signed_url("project-drawings", d.file_path, expiry),
        )
        for d in drawing_rows
    ]
    return ProjectDetailOut(
        id=project.id,
        owner_id=project.owner_id,
        title=project.title,
        address=project.address,
        description=project.description,
        trade=project.trade,
        bid_deadline=project.bid_deadline,
        status=project.status,
        created_at=project.created_at,
        offer_count=offer_count,
        drawings=drawings,
    )
