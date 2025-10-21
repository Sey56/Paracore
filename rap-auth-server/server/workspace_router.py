from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Annotated

from . import models, schemas
from .database import get_db
from .dependencies import get_current_user, CurrentUser, get_admin_for_team # Import from dependencies

router = APIRouter(
    tags=["Workspaces"],
)

@router.post("/api/teams/{team_id}/workspaces", response_model=schemas.Workspace, status_code=status.HTTP_201_CREATED)
def create_workspace_for_team(
    team_id: int,
    workspace: schemas.WorkspaceCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
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
    current_user: CurrentUser,
    db: Session = Depends(get_db),
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
    current_user: CurrentUser,
    db: Session = Depends(get_db),
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


@router.put("/api/workspaces/{workspace_id}", response_model=schemas.Workspace)
def update_workspace(
    workspace_id: int,
    workspace_update: schemas.WorkspaceUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Updates an existing registered workspace.
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
            detail="You do not have permission to update this workspace.",
        )

    # Check for duplicate name or URL if they are being updated
    if workspace_update.name is not None and workspace_update.name != db_workspace.name:
        existing_name_workspace = (
            db.query(models.Workspace)
            .filter(
                models.Workspace.team_id == db_workspace.team_id,
                models.Workspace.name == workspace_update.name,
                models.Workspace.id != workspace_id,
            )
            .first()
        )
        if existing_name_workspace:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A workspace with this name already exists for this team.",
            )

    if workspace_update.repo_url is not None and workspace_update.repo_url != db_workspace.repo_url:
        existing_url_workspace = (
            db.query(models.Workspace)
            .filter(
                models.Workspace.team_id == db_workspace.team_id,
                models.Workspace.repo_url == workspace_update.repo_url,
                models.Workspace.id != workspace_id,
            )
            .first()
        )
        if existing_url_workspace:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A workspace with this URL already exists for this team.",
            )

    # Update fields
    for field, value in workspace_update.dict(exclude_unset=True).items():
        setattr(db_workspace, field, value)

    db.commit()
    db.refresh(db_workspace)
    return db_workspace