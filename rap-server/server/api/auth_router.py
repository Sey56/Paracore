import json  # Added json import

import auth
import httpx
from config import settings
from database_config import get_db  # Added get_db import
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session  # Added Session import

import models
import schemas  # Added models import

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

@router.post("/auth/verify-google-code")
async def verify_google_code_proxy(request: VerifyGoogleCodeRequest):
    """Handle Google sign-in locally using bundled keys when Railway is unavailable."""
    async with httpx.AsyncClient() as client:
        try:
            # 1. Try Railway first
            resp = await client.post(
                f"{settings.AUTH_SERVER_URL}/auth/verify-google-code",
                json={"code": request.code, "redirect_uri": request.redirect_uri},
                timeout=5
            )
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError):
            pass  # Railway unreachable — fall through to local

    # 2. Fallback: handle Google OAuth locally using creds from auth-server .env
    import os as _os
    # rap-auth-server is a sibling of paracore in the Paracore container folder
    _auth_dir = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "..", "..", "rap-auth-server", "server"))
    _dotenv = {}
    _env_path = _os.path.join(_auth_dir, ".env")
    try:
        with open(_env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    _dotenv[k.strip()] = v.strip().strip('"').strip("'")
    except Exception as ex:
        print(f"[AUTH LOCAL] Failed to read .env: {_env_path} — {ex}", flush=True)
    print(f"[AUTH LOCAL] .env path={_auth_dir}", flush=True)
    print(f"[AUTH LOCAL] .env keys={list(_dotenv.keys())}", flush=True)
    google_client_id = _dotenv.get("GOOGLE_CLIENT_ID_DESKTOP", "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com")
    google_client_secret = _dotenv.get("GOOGLE_CLIENT_SECRET_DESKTOP", "")
    print(f"[AUTH LOCAL] client_id={google_client_id[:40]}... secret={'SET' if google_client_secret else 'MISSING'}", flush=True)

    async with httpx.AsyncClient() as client:
        # Exchange auth code for Google ID token
        token_resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": request.code,
            "client_id": google_client_id,
            "client_secret": google_client_secret,
            "redirect_uri": request.redirect_uri,
            "grant_type": "authorization_code",
        })
        try:
            token_resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            print(f"[AUTH LOCAL] Google rejected token exchange: {e.response.text}", flush=True)
            raise HTTPException(status_code=400, detail=f"Google token exchange failed: {e.response.text}")
        token_data = token_resp.json()

    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="No ID token from Google")
    print(f"[AUTH LOCAL] Google exchange OK, got ID token", flush=True)

    # Verify Google ID token
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    id_info = google_id_token.verify_oauth2_token(id_token, google_requests.Request(), google_client_id)
    email = id_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google token")
    print(f"[AUTH LOCAL] Verified Google ID token for {email}", flush=True)

    # Find/create local user
    db = next(get_db())
    local_user = db.query(models.User).filter(models.User.email == email).first() or db.query(models.User).filter(models.User.email == "local@paracore.app").first()
    if not local_user:
        local_user = models.User(email=email)
        db.add(local_user)
        db.commit()
    print(f"[AUTH LOCAL] User id={local_user.id}", flush=True)

    # Create JWT using local private key
    from jose import jwt as jose_jwt
    from datetime import datetime, timedelta, timezone
    print(f"[AUTH LOCAL] Signing JWT with key len={len(settings.JWT_PRIVATE_KEY or '')}", flush=True)
    access_token = jose_jwt.encode({
        "sub": email,
        "user_id": str(local_user.id),
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }, settings.JWT_PRIVATE_KEY, algorithm=settings.JWT_ALGORITHM)
    print(f"[AUTH LOCAL] JWT signed, token len={len(access_token)}", flush=True)

    return {
        "access_token": access_token,
        "user": {
            "id": local_user.id,
            "email": email,
            "name": id_info.get("name", email),
            "picture_url": id_info.get("picture", ""),
            "memberships": [{"team_id": 0, "team_name": "Personal", "role": "owner", "owner_id": 0}],
            "activeTeam": 0,
            "activeRole": "owner",
        }
    }

@router.get("/users/me/", response_model=schemas.CurrentUserResponse, tags=["users"])
def read_users_me(current_user: dict = Depends(auth.get_current_user)):
    return current_user
