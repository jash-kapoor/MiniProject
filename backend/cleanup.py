import asyncio
import time
from pathlib import Path

from config import settings
from logger import logger


async def cleanup_old_recordings():
    """Background task that runs every 24 hours to delete recordings older than retention period."""
    while True:
        try:
            recordings_dir = settings.recordings_dir
            if recordings_dir.exists():
                cutoff = time.time() - (settings.recording_retention_days * 86400)
                deleted = 0
                for file_path in recordings_dir.iterdir():
                    if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                        file_path.unlink()
                        deleted += 1
                if deleted:
                    logger.info("Cleanup: deleted %d old recordings", deleted)
        except Exception:
            logger.exception("Recording cleanup failed")
        await asyncio.sleep(86400)  # Run every 24 hours
