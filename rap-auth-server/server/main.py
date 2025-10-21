import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import RedirectResponse
from urllib.parse import urlencode
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests
from typing import Optional

from .config import settings
from .database import Base, engine, get_db
from .models import User, Team, TeamMembership, Role
from .schemas import UserOut, GoogleAuthCodeRequest, Token, TeamMembershipOut, TeamMemberOut, UpdateMemberRoleRequest, InviteUserRequest
from sqlalchemy.orm import joinedload

from .dependencies import get_current_user, CurrentUser, get_admin_for_team, oauth2_scheme, create_access_token

print(f"--- DATABASE_URL BEING USED: {settings.DATABASE_URL} ---")

# --- App Lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # on startup
    Base.metadata.create_all(bind=engine)
    yield
    # on shutdown
    pass

# --- FastAPI App Initialization ---

app = FastAPI(
    title="RAP Authentication Server",
    description="Handles user authentication and issues JWTs.",
    version="0.1.0",
    lifespan=lifespan
)

origins = [
    "http://localhost:5173",
    "https://tauri.localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .workspace_router import router as workspace_router
app.include_router(workspace_router)

# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"status": "ok", "service": "rap-auth-server"}

@app.post("/auth/verify-google-code", response_model=Token)
async def verify_google_code(request: GoogleAuthCodeRequest, db: Session = Depends(get_db)):
    token_url = "https://oauth2.googleapis.com/token"
    token_params = {
        "code": request.code,
        "client_id": settings.GOOGLE_CLIENT_ID_DESKTOP,
        "client_secret": settings.GOOGLE_CLIENT_SECRET_DESKTOP,
        "redirect_uri": request.redirect_uri,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_params)
        try:
            token_response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to exchange authorization code with Google: {e.response.text}")
        token_data = token_response.json()

    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID token not found in Google's response.")

    try:
        id_info = google_id_token.verify_oauth2_token(
            id_token, requests.Request(), settings.GOOGLE_CLIENT_ID_DESKTOP)

        email = id_info.get("email")
        name = id_info.get("name")
        picture_url = id_info.get("picture")

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not found in Google token.")

        user = db.query(User).filter(User.email == email).first()
        if not user:
            # Create new user
            new_user = User(email=email, name=name, picture_url=picture_url)
            db.add(new_user)
            db.flush()  # Flush to get the new_user.id

            # Create a personal team for the new user
            personal_team = Team(name=f"{new_user.name}'s Space", owner_id=new_user.id)
            db.add(personal_team)
            db.flush()  # Flush to get the personal_team.id

            # Add user to the team as an admin
            membership = TeamMembership(
                user_id=new_user.id,
                team_id=personal_team.id,
                role=Role.admin
            )
            db.add(membership)
            db.commit()
            db.refresh(new_user)
            user = new_user
        else:
            # Update last login for existing user
            user.last_login_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)

        # Prepare the memberships list for the response
        memberships_out = [
            TeamMembershipOut(
                team_id=mem.team.id,
                team_name=mem.team.name,
                role=mem.role,
                owner_id=mem.team.owner_id
            )
            for mem in user.memberships
        ]

        # Create the UserOut object with memberships
        user_out = UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            picture_url=user.picture_url,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            is_active=user.is_active,
            memberships=memberships_out
        )

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        cloud_jwt = create_access_token(
            data={"sub": user.email, "user_id": str(user.id)},
            expires_delta=access_token_expires
        )

        return {"user": user_out, "access_token": cloud_jwt, "token_type": "bearer"}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google ID token: {e}")

@app.get("/api/teams/{team_id}/members", response_model=list[TeamMemberOut])
def get_team_members(team_id: int, db: Session = Depends(get_db), admin_membership: TeamMembership = Depends(get_admin_for_team)):
    """
    Get a list of all members for a given team.
    The user must be an admin of the team to access this endpoint.
    """
    team = db.query(Team).options(
        joinedload(Team.members).joinedload(TeamMembership.user)
    ).filter(Team.id == team_id).first()

    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members_out = [
        TeamMemberOut(
            id=mem.user.id,
            name=mem.user.name,
            email=mem.user.email,
            role=mem.role
        )
        for mem in team.members
    ]

    return members_out

@app.put("/api/teams/{team_id}/members/{user_id}", response_model=TeamMemberOut)
def update_team_member_role(
    team_id: int,
    user_id: int,
    role_update: UpdateMemberRoleRequest,
    db: Session = Depends(get_db),
    admin_membership: TeamMembership = Depends(get_admin_for_team)
):
    """
    Update the role of a specific team member.
    The user must be an admin of the team to access this endpoint.
    """
    # Find the membership to update
    membership_to_update = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == user_id
    ).options(joinedload(TeamMembership.user)).first()

    if not membership_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

    # Update the role
    membership_to_update.role = role_update.role
    db.commit()
    db.refresh(membership_to_update)

    # Return the updated member info
    return TeamMemberOut(
        id=membership_to_update.user.id,
        name=membership_to_update.user.name,
        email=membership_to_update.user.email,
        role=membership_to_update.role
    )

@app.post("/api/teams/{team_id}/invitations", response_model=TeamMemberOut)
def invite_user_to_team(
    team_id: int,
    invitation: InviteUserRequest,
    db: Session = Depends(get_db),
    admin_membership: TeamMembership = Depends(get_admin_for_team)
):
    """
    Invite a user to a team by email.
    The user must have an existing RAP account.
    The user must not already be a member of the team.
    """
    # Find the user to invite
    user_to_invite = db.query(User).filter(User.email == invitation.email).first()
    if not user_to_invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with email {invitation.email} not found.")

    # Check if the user is already a member
    existing_membership = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == user_to_invite.id
    ).first()

    if existing_membership:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this team.")

    # Create the new membership
    new_membership = TeamMembership(
        user_id=user_to_invite.id,
        team_id=team_id,
        role=invitation.role
    )
    db.add(new_membership)
    db.commit()
    db.refresh(new_membership)

    return TeamMemberOut(
        id=user_to_invite.id,
        name=user_to_invite.name,
        email=user_to_invite.email,
        role=new_membership.role
    )

@app.delete("/api/teams/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    admin_membership: TeamMembership = Depends(get_admin_for_team)
):
    """
    Removes a team member from the team.
    The user must be an admin of the team to access this endpoint.
    Cannot remove the team owner.
    """
    # Ensure the admin is not trying to remove themselves if they are the owner
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if team.owner_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the team owner.")

    # Find the membership to delete
    membership_to_delete = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == user_id
    ).first()

    if not membership_to_delete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found in this team.")

    db.delete(membership_to_delete)
    db.commit()

    return {"message": "Team member removed successfully."}