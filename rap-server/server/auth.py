import httpx
import json
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr
from typing import Optional, List # Added List
from sqlalchemy.orm import Session # Added Session
from database_config import get_db
import models
from config import settings

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
        # LOCAL MODE BYPASS
        if token == "rap-local-token":
            local_email = "local@paracore.app"
            local_user = db.query(models.User).filter(models.User.email == local_email).first()
            
            if not local_user:
                # Create the local user if it doesn't exist
                # Use a specific ID range or let DB handle it. Since sqlite is local, auto-increment is fine.
                local_user = models.User(email=local_email)
                db.add(local_user)
                db.commit()
                db.refresh(local_user)

            # Check for existing profile or create one
            local_profile = db.query(models.LocalUserProfile).filter(models.LocalUserProfile.user_id == local_user.id).first()
            if not local_profile:
                local_profile = models.LocalUserProfile(
                    user_id=local_user.id,
                    active_role="owner",
                    active_team_id=0, # Dummy team ID
                    memberships_json='[{"team_id": 0, "team_name": "Local Team", "role": "owner", "owner_id": 0}]'
                )
                db.add(local_profile)
                db.commit()

            return CurrentUser(
                id=local_user.id,
                email=local_email,
                memberships=[Membership(team_id=0, team_name="Local Team", role="owner", owner_id=0)],
                activeTeam=0,
                activeRole="owner"
            )

        # STANDARD CLOUD VALIDATION
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