import zipfile
from dataclasses import dataclass
from io import BytesIO

JUNK_SUFFIXES = (".DS_Store", "Thumbs.db", "desktop.ini")

# Zip-bomb / resource-exhaustion limits (spec §70). Checked against
# ZipInfo.file_size — the uncompressed size recorded in the zip's central
# directory — BEFORE any bytes are read, so a bomb never gets far enough
# to actually allocate the memory it's trying to exhaust.
MAX_ZIP_ENTRIES = 1000
MAX_ENTRY_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # 200MB per file
MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024  # 500MB per archive


class ZipSecurityError(Exception):
    pass


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
# src/lib/zip.ts, then hardened per spec §70: entry-count/size limits
# checked against zip metadata before extraction, so a zip bomb is
# rejected before any bytes are decompressed into memory.
def extract_zip(content: bytes) -> list[ExtractedFile]:
    results: list[ExtractedFile] = []
    total_uncompressed = 0

    with zipfile.ZipFile(BytesIO(content)) as zf:
        real_entries = [info for info in zf.infolist() if not info.is_dir() and not _is_junk(info.filename)]

        if len(real_entries) > MAX_ZIP_ENTRIES:
            raise ZipSecurityError(f"Archive contains too many files (max {MAX_ZIP_ENTRIES}).")

        for info in real_entries:
            if info.file_size > MAX_ENTRY_UNCOMPRESSED_BYTES:
                raise ZipSecurityError(f"'{info.filename}' is too large when extracted.")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ZipSecurityError("Archive is too large when extracted.")

        for info in real_entries:
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
