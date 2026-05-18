from fastapi import Header, HTTPException, status
from config import settings


def require_internal_key(x_internal_key: str = Header(...)):
    """Validate shared secret sent by analytics-service on every internal call."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal key")
