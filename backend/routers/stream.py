import logging
import os

from fastapi import APIRouter, Depends, HTTPException
import jwt
import time

from auth import get_current_user
from models import User

logger = logging.getLogger("voxassess.stream")

router = APIRouter(
    prefix="/stream",
    tags=["stream"]
)

# Stream API config — loaded from environment variables (no hardcoded placeholders)
STREAM_API_KEY = os.environ.get("STREAM_API_KEY")
STREAM_API_SECRET = os.environ.get("STREAM_API_SECRET")

# Startup check: warn if env vars are missing
if not STREAM_API_KEY:
    logger.warning(
        "⚠️  STREAM_API_KEY is not set. "
        "Live video sessions will not work. "
        "Set the STREAM_API_KEY environment variable or add it to your .env file."
    )
if not STREAM_API_SECRET:
    logger.warning(
        "⚠️  STREAM_API_SECRET is not set. "
        "Live video sessions will not work. "
        "Set the STREAM_API_SECRET environment variable or add it to your .env file."
    )

@router.get("/token")
async def get_stream_token(current_user: User = Depends(get_current_user)):
    """
    Generate a Stream Video token for the authenticated user.
    """
    if not STREAM_API_KEY or not STREAM_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Stream Video API keys are not configured. "
                   "Set STREAM_API_KEY and STREAM_API_SECRET environment variables."
        )

    user_id = str(current_user.id)
    
    # Create the payload for Stream JWT
    payload = {
        "user_id": user_id,
        "exp": int(time.time()) + (60 * 60 * 2) # valid for 2 hours
    }
    
    token = jwt.encode(payload, STREAM_API_SECRET, algorithm="HS256")
    
    return {
        "token": token,
        "api_key": STREAM_API_KEY,
        "user_id": user_id,
        "name": getattr(current_user, "full_name", f"User {user_id}")
    }
