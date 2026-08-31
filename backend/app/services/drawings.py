import re
import time

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.project import ProjectDrawing
from app.services.storage import Storage
from app.services.zip_utils import extract_zip, is_zip_filename

_UNSAFE_CHARS = re.compile(r"[^a-zA-Z0-9._-]")


# Storage paths can't safely contain arbitrary characters from a zip
# entry's internal path — keep the slashes (they become subfolders,
# matching the zip's own folder structure) but strip anything else that
# could break a path segment. Ported from src/lib/drawings.ts.
def _sanitize_path_segment(name: str) -> str:
    return "/".join(_UNSAFE_CHARS.sub("_", part) for part in name.split("/"))


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
        content = await file.read()
        if not content:
            continue

        if is_zip_filename(file.filename, file.content_type):
            try:
                entries = extract_zip(content)
            except Exception:
                failed += 1
                continue

            for entry in entries:
                path = f"{project_id}/{int(time.time() * 1000)}-{_sanitize_path_segment(entry.name)}"
                try:
                    storage.save("project-drawings", path, entry.content, entry.content_type)
                except Exception:
                    failed += 1
                    continue
                db.add(ProjectDrawing(project_id=project_id, file_path=path, file_name=entry.name))
                uploaded += 1
            continue

        path = f"{project_id}/{int(time.time() * 1000)}-{_sanitize_path_segment(file.filename)}"
        try:
            storage.save("project-drawings", path, content, file.content_type or "application/octet-stream")
        except Exception:
            failed += 1
            continue
        db.add(ProjectDrawing(project_id=project_id, file_path=path, file_name=file.filename))
        uploaded += 1

    db.commit()
    return {"uploaded": uploaded, "failed": failed}
