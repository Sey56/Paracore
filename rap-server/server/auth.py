import httpx
import json
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, jwk, JWTError
from pydantic import BaseModel, EmailStr
from functools import wraps
from datetime import datetime, timedelta
from typing import Optional

from .config import settings

# --- Globals ---
# Cache for the JWKS from the auth server
jwks_cache = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Pydantic Models ---
class CurrentUser(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    current_team_id: int
    current_role: str

# --- JWKS Fetching ---
async def get_jwks():
    """
    Fetches and caches the JWKS from the authentication server.
    """
    global jwks_cache
    if jwks_cache:
        return jwks_cache

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{settings.AUTH_SERVER_URL}/.well-known/jwks.json")
            response.raise_for_status()
            jwks_cache = response.json()
            return jwks_cache
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Could not connect to auth server to get JWKS: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error fetching JWKS: {e.response.text}")

# --- Main Authentication Dependency ---
async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 1. Get the JWKS from the auth server
        jwks = await get_jwks()
        
        # 2. Get the unverified header to find the kid
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"]
                }
        
        if not rsa_key:
            raise HTTPException(status_code=401, detail="Public key not found in JWKS.")

        # 3. Construct the public key and decode the token
        public_key = jwk.construct(rsa_key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[settings.JWT_ALGORITHM], # Should be RS256
            audience=None, # No audience verification for now
            issuer=None # No issuer verification for now
        )

        # 4. Extract user details from the payload
        user_id = payload.get("user_id")
        email = payload.get("sub")
        team_id = payload.get("team_id")
        role = payload.get("role")

        if any(p is None for p in [user_id, email, team_id, role]):
            raise credentials_exception

        # 5. Create the CurrentUser object
        current_user = CurrentUser(
            id=int(user_id),
            email=email,
            current_team_id=team_id,
            current_role=role
        )
        return current_user

    except JWTError as e:
        raise credentials_exception from e
    except Exception as e:
        # Catch other potential errors during fetching or processing
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during authentication: {e}")

# --- Role-based Authorization Dependencies ---
def require_role(required_role: str):
    """
    Factory for creating a dependency that checks for a minimum role.
    """
    def role_checker(current_user: CurrentUser = Depends(get_current_user)):
        role_hierarchy = {"user": 0, "developer": 1, "admin": 2}
        user_level = role_hierarchy.get(current_user.current_role, -1)
        required_level = role_hierarchy.get(required_role, 0)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Requires at least '{required_role}' role.",
            )
        return current_user
    return role_checker

# Pre-made dependencies for convenience
admin_required = require_role("admin")
developer_or_admin_required = require_role("developer")