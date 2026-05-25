import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from config import settings


ALLOWED_AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
}
ALLOWED_AUDIO_EXTENSIONS = set(ALLOWED_AUDIO_TYPES.values())


def secure_filename(filename: str) -> str:
    candidate = Path(filename or "upload").name
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "_", candidate).strip("._")
    return candidate or f"upload_{uuid.uuid4().hex}"


async def validate_audio_upload(file: UploadFile) -> tuple[bytes, str]:
    original_name = secure_filename(file.filename or "audio.webm")
    extension = Path(original_name).suffix.lower()
    content_type = (file.content_type or "").split(";")[0].strip().lower()

    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported audio MIME type")
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio file extension")

    content = await file.read()
    max_size = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="Audio file exceeds 50MB limit")
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")

    return content, original_name
