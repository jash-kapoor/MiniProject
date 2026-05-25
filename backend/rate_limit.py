from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


limiter = Limiter(key_func=get_remote_address, headers_enabled=True)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    response = JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please retry later."},
    )
    response.headers["Retry-After"] = "60"
    return response
