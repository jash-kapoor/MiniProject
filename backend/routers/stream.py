import os
from fastapi import APIRouter, Depends, HTTPException
import jwt
import time
from auth import get_current_user
from models import User

router = APIRouter(
    prefix="/stream",
    tags=["stream"]
)

# Placeholders for Stream API config
STREAM_API_KEY = os.getenv("STREAM_API_KEY", "placeholder_api_key")
STREAM_API_SECRET = os.getenv("STREAM_API_SECRET", "placeholder_api_secret")

@router.get("/token")
async def get_stream_token(current_user: User = Depends(get_current_user)):
    """
    Generate a Stream Video token for the authenticated user.
    """
    if STREAM_API_SECRET == "placeholder_api_secret":
        # In a real app, do not proceed or use a dummy token if testing
        pass

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
