import json
import os as _os

import auth
import httpx
from config import settings
from database_config import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas

router = APIRouter()

class VerifyGoogleCodeRequest(BaseModel):
    code: str
    redirect_uri: str

class TokenRequest(BaseModel):
    token: str
    invitation_token: str | None = None # Accept invitation token

@router.post("/auth/google-verify")
async def google_verify(
    request: TokenRequest,
    db: Session = Depends(get_db) # Added db dependency
):
    async with httpx.AsyncClient(timeout=10.0) as client:
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

@router.post("/auth/verify-google-code")
async def verify_google_code_local(request: VerifyGoogleCodeRequest):
    """Forward Google auth code to Railway. Falls back to local exchange only if Railway is unreachable."""
    import httpx as _hx

    # 1. Try Railway first (it handles Google exchange + email allowlist + DB)
    try:
        async with _hx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{settings.AUTH_SERVER_URL}/auth/verify-google-code",
                json={"code": request.code, "redirect_uri": request.redirect_uri},
            )
            resp.raise_for_status()
            return resp.json()
    except _hx.HTTPStatusError as e:
        # Railway returned an error (invalid code, not allowed, etc.) — pass through
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except (_hx.RequestError, _hx.TimeoutException):
        # Railway is unreachable — fall through to local fallback
        pass

    # 2. Local fallback (only when Railway is completely unreachable)
    from google.oauth2 import id_token as gid
    from google.auth.transport import requests as greq
    from jose import jwt as jjwt
    from datetime import datetime, timedelta, timezone

    _env = {}
    _env_path = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "..", "..", "rap-auth-server", "server", ".env"))
    try:
        with open(_env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    _env[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass

    gid_client = _env.get("GOOGLE_CLIENT_ID_DESKTOP", "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com")
    gid_secret = _env.get("GOOGLE_CLIENT_SECRET_DESKTOP", "")

    if not gid_secret:
        raise HTTPException(status_code=503, detail="Authentication server unavailable and no local fallback configured.")

    async with _hx.AsyncClient(timeout=15.0) as client:
        tr = await client.post("https://oauth2.googleapis.com/token", data={
            "code": request.code, "client_id": gid_client,
            "client_secret": gid_secret, "redirect_uri": request.redirect_uri,
            "grant_type": "authorization_code",
        })
        try:
            tr.raise_for_status()
        except _hx.HTTPStatusError as e:
            raise HTTPException(status_code=400, detail=f"Google exchange failed: {e.response.text}")
        td = tr.json()

    id_tok = td.get("id_token")
    if not id_tok:
        raise HTTPException(status_code=400, detail="No ID token from Google")

    info = gid.verify_oauth2_token(id_tok, greq.Request(), gid_client)
    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google token")

    db = next(get_db())
    user = db.query(models.User).filter(models.User.email == email).first() or db.query(models.User).filter(models.User.email == "local@paracore.app").first()
    if not user:
        user = models.User(email=email)
        db.add(user)
        db.commit()

    token = jjwt.encode({
        "sub": email, "user_id": str(user.id),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }, settings.JWT_PRIVATE_KEY, algorithm=settings.JWT_ALGORITHM)

    return {
        "access_token": token,
        "user": {"id": user.id, "email": email, "name": info.get("name", email),
                 "picture_url": info.get("picture", ""),
                 "memberships": [{"team_id": 0, "team_name": "Personal", "role": "owner", "owner_id": 0}],
                 "activeTeam": 0, "activeRole": "owner"}
    }

@router.get("/users/me/", response_model=schemas.CurrentUserResponse, tags=["users"])
def read_users_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user
