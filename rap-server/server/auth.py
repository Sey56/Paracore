import httpx
import json
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr
from typing import Optional, List # Added List
from sqlalchemy.orm import Session # Added Session
from .database_config import get_db # Added get_db
from . import models # Added models

from .config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class Membership(BaseModel): # Define Membership here as it's part of CurrentUser
    team_id: int
    team_name: str
    role: str

class CurrentUser(BaseModel):
    id: int
    email: EmailStr
    memberships: List[Membership] = []
    activeTeam: Optional[int] = None
    activeRole: Optional[str] = None

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db) # Add db dependency
) -> CurrentUser:
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

        # Query local database for full user profile
        local_profile = db.query(models.LocalUserProfile).filter(models.LocalUserProfile.user_id == user_id).first()

        if not local_profile:
            # If no local profile, return basic user info (or raise error if profile is mandatory)
            # For now, let's return basic info, frontend might handle missing memberships
            current_user = CurrentUser(
                id=int(user_id),
                email=email,
            )
            return current_user

        memberships = json.loads(local_profile.memberships_json) if local_profile.memberships_json else []
        
        current_user = CurrentUser(
            id=int(user_id),
            email=email,
            memberships=[Membership(**m) for m in memberships], # Convert dicts to Membership models
            activeTeam=local_profile.active_team_id,
            activeRole=local_profile.active_role,
        )
        return current_user

    except JWTError as e:
        raise credentials_exception from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during authentication: {e}")