import zipfile
from dataclasses import dataclass
from io import BytesIO

JUNK_SUFFIXES = (".DS_Store", "Thumbs.db", "desktop.ini")


def _is_junk(path: str) -> bool:
    if path.startswith("__MACOSX/"):
        return True
    return any(path.endswith(suffix) for suffix in JUNK_SUFFIXES)


def guess_content_type(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "dwg": "application/acad",
    }.get(ext, "application/octet-stream")


@dataclass
class ExtractedFile:
    name: str  # relative path inside the zip, e.g. "floor-plans/level-1.pdf"
    content: bytes
    content_type: str


# Extracts every real file out of an uploaded .zip, skipping directory
# entries and common OS junk (macOS resource forks, Thumbs.db, etc.) that
# would otherwise show up as confusing extra "drawings." Ported from
# src/lib/zip.ts.
def extract_zip(content: bytes) -> list[ExtractedFile]:
    results: list[ExtractedFile] = []
    with zipfile.ZipFile(BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            if _is_junk(info.filename):
                continue
            data = zf.read(info.filename)
            if not data:
                continue
            results.append(ExtractedFile(name=info.filename, content=data, content_type=guess_content_type(info.filename)))
    return results


def is_zip_filename(filename: str, content_type: str | None) -> bool:
    return (
        filename.lower().endswith(".zip")
        or content_type == "application/zip"
        or content_type == "application/x-zip-compressed"
    )
