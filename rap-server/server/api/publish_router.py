from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import glob
import subprocess

from .. import models, schemas
from ..database_config import get_db

router = APIRouter()

def get_latest_commit_hash(repo_path: str) -> str:
    """Gets the latest commit hash of the current branch."""
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_path,
        check=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

@router.post("/api/workspaces/{workspace_id}/publish", response_model=list[schemas.PublishedScriptResponse], tags=["Publishing"])
async def publish_workspace_scripts(workspace_id: int, db: Session = Depends(get_db)):
    """
    Publishes all scripts in a workspace for the admin's team. Requires 'admin' role.
    This will delete all previously published scripts for this workspace and create new records.
    """
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found or you do not have permission to publish it.")

    print(f"Publishing workspace: {workspace.name} at path: {workspace.path}")

    if not os.path.isdir(os.path.join(workspace.path, '.git')):
        raise HTTPException(status_code=400, detail=f"Workspace path '{workspace.path}' is not a git repository.")

    # Get the latest commit hash
    try:
        commit_hash = get_latest_commit_hash(workspace.path)
    except subprocess.CalledProcessError as e:
        error_message = f"Failed to get git commit hash. Is git installed and in your PATH? Error: {e.stderr}"
        raise HTTPException(status_code=500, detail=error_message)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Git command not found. Is git installed and in your PATH?")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


    # Delete old published scripts for this workspace
    db.query(models.PublishedScript).filter(models.PublishedScript.workspace_id == workspace_id).delete()

    # Find all .cs scripts in the workspace directory
    script_paths = glob.glob(os.path.join(workspace.path, "**/*.cs"), recursive=True)

    newly_published_scripts = []
    for script_path in script_paths:
        # We store the relative path to the workspace root
        relative_path = os.path.relpath(script_path, workspace.path)
        
        with open(script_path, 'r', encoding='utf-8') as f:
            script_content = f.read()

        published_script = models.PublishedScript(
            script_path=relative_path,
            content=script_content,
            workspace_id=workspace.id,
            team_id=None,
            commit_hash=commit_hash
        )
        db.add(published_script)
        newly_published_scripts.append(published_script)
    
    db.commit()
    for script in newly_published_scripts:
        db.refresh(script)

    return newly_published_scripts

@router.get("/api/workspaces/{workspace_id}/published-scripts", response_model=list[schemas.PublishedScriptResponse], tags=["Publishing"])
async def get_workspace_published_scripts(workspace_id: int, db: Session = Depends(get_db)):
    """
    Gets a list of all published scripts for a given workspace.
    """
    published_scripts = db.query(models.PublishedScript).filter(models.PublishedScript.workspace_id == workspace_id).all()
    if not published_scripts:
        raise HTTPException(status_code=404, detail="No published scripts found for this workspace.")
    return published_scripts

@router.get("/api/teams/{team_id}/published-scripts", response_model=list[schemas.PublishedScriptResponse], tags=["Publishing"])
async def get_published_scripts(team_id: int, db: Session = Depends(get_db)):
    """
    Gets a list of all published scripts for a given team.
    Accessible to any authenticated member of the team.
    """
        # User context has been removed, no longer checking current_user.

    published_scripts = db.query(models.PublishedScript).filter(models.PublishedScript.team_id == team_id).all()
    return published_scripts