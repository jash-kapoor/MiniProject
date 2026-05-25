import logging

from fastapi import APIRouter, Depends, HTTPException
import jwt
import time

from auth import get_current_user
from config import settings
from models import User

logger = logging.getLogger("voxassess.stream")

router = APIRouter(
    prefix="/stream",
    tags=["stream"]
)

if not settings.stream_api_key:
    logger.warning(
        "STREAM_API_KEY is not set. "
        "Live video sessions will not work. "
        "Set the STREAM_API_KEY environment variable or add it to your .env file."
    )
if not settings.stream_api_secret:
    logger.warning(
        "STREAM_API_SECRET is not set. "
        "Live video sessions will not work. "
        "Set the STREAM_API_SECRET environment variable or add it to your .env file."
    )

@router.get("/token")
async def get_stream_token(current_user: User = Depends(get_current_user)):
    """
    Generate a Stream Video token for the authenticated user.
    """
    if not settings.stream_api_key or not settings.stream_api_secret:
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
    
    token = jwt.encode(payload, settings.stream_api_secret, algorithm="HS256")
    
    return {
        "token": token,
        "api_key": settings.stream_api_key,
        "user_id": user_id,
        "name": getattr(current_user, "full_name", f"User {user_id}")
    }
