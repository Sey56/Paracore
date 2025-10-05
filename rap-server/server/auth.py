import httpx
import json
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr
from typing import Optional

from .config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class CurrentUser(BaseModel):
    id: int
    email: EmailStr

async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not settings.JWT_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT_PUBLIC_KEY not configured on the server for offline validation."
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_PUBLIC_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=None,
            issuer=None
        )

        user_id = payload.get("user_id")
        email = payload.get("sub")

        if any(p is None for p in [user_id, email]):
            raise credentials_exception

        current_user = CurrentUser(
            id=int(user_id),
            email=email,
        )
        return current_user

    except JWTError as e:
        # e.g., token has expired, invalid signature, etc.
        raise credentials_exception from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during authentication: {e}")
