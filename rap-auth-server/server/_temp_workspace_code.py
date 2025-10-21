# Temporary storage for Workspace model and schemas
# models.py additions
# class Workspace(Base):
#     __tablename__ = "workspaces"
#     id = Column(Integer, primary_key=True, index=True)
#     name = Column(String, nullable=False)
#     repo_url = Column(String, nullable=False)
#     team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
#     team = relationship("Team", back_populates="workspaces")

# schemas.py additions
# class WorkspaceBase(BaseModel):
#     name: str
#     repo_url: str
# class WorkspaceCreate(WorkspaceBase):
#     pass
# class Workspace(WorkspaceBase):
#     id: int
#     team_id: int
#     class Config:
#         from_attributes = True

# workspace_router.py content
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Annotated

from . import models, schemas
from .database import get_db
from .main import get_current_user, CurrentUser, get_admin_for_team # Import from main

router = APIRouter(
    tags=["Workspaces"],
)

@router.post("/api/teams/{team_id}/workspaces", response_model=schemas.Workspace, status_code=status.HTTP_201_CREATED)
def create_workspace_for_team(
    team_id: int,
    workspace: schemas.WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Registers a new workspace for a team.
    Only an admin of the team can perform this action.
    """
    # Check if the team exists
    db_team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not db_team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Authorization: Check if the current user is an admin of the team
    membership = (
        db.query(models.TeamMembership)
        .filter(
            models.TeamMembership.team_id == team_id,
            models.TeamMembership.user_id == current_user.id,
        )
        .first()
    )

    if not membership or membership.role != models.Role.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to register a workspace for this team.",
        )

    # Check if a workspace with the same name or URL already exists for this team
    existing_workspace = (
        db.query(models.Workspace)
        .filter(
            models.Workspace.team_id == team_id,
            (models.Workspace.name == workspace.name) | (models.Workspace.repo_url == workspace.repo_url)
        )
        .first()
    )
    if existing_workspace:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workspace with this name or URL already exists for this team.",
        )

    db_workspace = models.Workspace(**workspace.dict(), team_id=team_id)
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    return db_workspace


@router.get("/api/teams/{team_id}/workspaces", response_model=List[schemas.Workspace])
def get_team_workspaces(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Retrieves all workspaces registered for a specific team.
    Any member of the team can perform this action.
    """
    # Authorization: Check if the current user is a member of the team
    membership = (
        db.query(models.TeamMembership)
        .filter(
            models.TeamMembership.team_id == team_id,
            models.TeamMembership.user_id == current_user.id,
        )
        .first()
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this team.",
        )

    return db.query(models.Workspace).filter(models.Workspace.team_id == team_id).all()


@router.delete("/api/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Deletes a registered workspace.
    Only an admin of the team that owns the workspace can perform this action.
    """
    db_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()

    if not db_workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Authorization: Check if the current user is an admin of the team
    membership = (
        db.query(models.TeamMembership)
        .filter(
            models.TeamMembership.team_id == db_workspace.team_id,
            models.TeamMembership.user_id == current_user.id,
        )
        .first()
    )

    if not membership or membership.role != models.Role.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this workspace.",
        )

    db.delete(db_workspace)
    db.commit()
    return
