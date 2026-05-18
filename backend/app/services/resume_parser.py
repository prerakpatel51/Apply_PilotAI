from pathlib import Path

from fastapi import UploadFile


SUPPORTED_SUFFIXES = {".txt", ".text", ".tex"}


def validate_resume_filename(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        allowed = ", ".join(sorted(SUPPORTED_SUFFIXES))
        raise ValueError(f"Unsupported resume format. Upload one of: {allowed}.")


def extract_resume_text(path: Path, content_type: str | None = None) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore").strip()


async def save_upload(upload: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as file:
        while chunk := await upload.read(1024 * 1024):
            file.write(chunk)
