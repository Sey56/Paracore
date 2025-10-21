from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx
import json # Added json import
from sqlalchemy.orm import Session # Added Session import

from .. import schemas, auth, models # Added models import
from ..config import settings
from ..database_config import get_db # Added get_db import

router = APIRouter()

class TokenRequest(BaseModel):
    token: str
    invitation_token: str | None = None # Accept invitation token

@router.post("/auth/google-verify")
async def google_verify(
    request: TokenRequest,
    db: Session = Depends(get_db) # Added db dependency
):
    async with httpx.AsyncClient() as client:
        try:
            # Forward the Google ID token and any invitation token to the rap-auth-server
            payload = {"token": request.token}
            if request.invitation_token:
                payload["invitation_token"] = request.invitation_token

            auth_server_response = await client.post(
                f"{settings.AUTH_SERVER_URL}/auth/verify-google-token",
                json=payload
            )
            auth_server_response.raise_for_status()
            
            # The auth server now returns the user object and the cloud token
            # We will just pass this through to the client.
            auth_server_data = auth_server_response.json()
            
            # Extract user data from auth_server_data
            user_data = auth_server_data.get("user", {})
            user_id = user_data.get("id")
            email = user_data.get("email")
            memberships = user_data.get("memberships", [])
            active_team = user_data.get("activeTeam")
            active_role = user_data.get("activeRole")

            if not user_id or not email:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user data from auth server")

            # Find or create User in local DB
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if not user:
                user = models.User(id=user_id, email=email)
                db.add(user)
                db.commit() # Commit to get user.id if newly created
                db.refresh(user)
            elif user.email != email: # Update email if it changed
                user.email = email
                db.commit()
                db.refresh(user)

            # Find or create LocalUserProfile
            local_profile = db.query(models.LocalUserProfile).filter(models.LocalUserProfile.user_id == user_id).first()
            
            memberships_json = json.dumps(memberships) # Serialize memberships

            if not local_profile:
                local_profile = models.LocalUserProfile(
                    user_id=user_id,
                    memberships_json=memberships_json,
                    active_team_id=active_team,
                    active_role=active_role
                )
                db.add(local_profile)
            else:
                local_profile.memberships_json = memberships_json
                local_profile.active_team_id = active_team
                local_profile.active_role = active_role
            
            db.commit()
            db.refresh(local_profile)

            # The token received from auth_server is the cloud_token
            return {"user": user_data, "token": auth_server_data.get("token")}

        except httpx.HTTPStatusError as e:
            # Pass through the error from the auth server
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Authentication server error: {e.response.text}"
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not connect to authentication server: {e}"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred during authentication: {e}")

@router.get("/users/me/", response_model=schemas.CurrentUserResponse, tags=["users"])
def read_users_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user