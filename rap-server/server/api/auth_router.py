from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx
from .. import schemas, auth
from ..config import settings

router = APIRouter()

class TokenRequest(BaseModel):
    token: str
    invitation_token: str | None = None # Accept invitation token

@router.post("/auth/google-verify")
async def google_verify(request: TokenRequest):
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
            
            # The token received from auth_server is the cloud_token
            return {"user": auth_server_data.get("user"), "token": auth_server_data.get("token")}

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

@router.get("/users/me/", response_model=schemas.CurrentUserResponse, tags=["users"])
def read_users_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user