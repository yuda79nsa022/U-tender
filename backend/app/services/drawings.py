import time

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.project import ProjectDrawing
from app.services.file_security import ALLOWED_DRAWING_EXTENSIONS, assert_allowed_extension, sanitize_path_segment
from app.services.storage import Storage
from app.services.zip_utils import ZipSecurityError, extract_zip, is_zip_filename


# Used by both project creation and "add more drawings" on an existing
# project. A zip is transparently extracted into one project_drawings row
# per file inside it; anything else is uploaded as-is. One bad file/zip
# entry doesn't block the rest — each is best-effort.
async def upload_drawings_for_project(
    db: Session, storage: Storage, project_id: str, files: list[UploadFile]
) -> dict[str, int]:
    uploaded = 0
    failed = 0

    for file in files:
        if not file or not file.filename:
            continue
        assert_allowed_extension(file.filename, ALLOWED_DRAWING_EXTENSIONS)
        content = await file.read()
        if not content:
            continue

        if is_zip_filename(file.filename, file.content_type):
            try:
                entries = extract_zip(content)
            except ZipSecurityError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except Exception:
                failed += 1
                continue

            for entry in entries:
                path = f"{project_id}/{int(time.time() * 1000)}-{sanitize_path_segment(entry.name)}"
                try:
                    storage.save("project-drawings", path, entry.content, entry.content_type)
                except Exception:
                    failed += 1
                    continue
                db.add(ProjectDrawing(project_id=project_id, file_path=path, file_name=entry.name))
                uploaded += 1
            continue

        path = f"{project_id}/{int(time.time() * 1000)}-{sanitize_path_segment(file.filename)}"
        try:
            storage.save("project-drawings", path, content, file.content_type or "application/octet-stream")
        except Exception:
            failed += 1
            continue
        db.add(ProjectDrawing(project_id=project_id, file_path=path, file_name=file.filename))
        uploaded += 1

    db.commit()
    return {"uploaded": uploaded, "failed": failed}
