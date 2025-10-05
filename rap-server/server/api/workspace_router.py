from fastapi import APIRouter, HTTPException, Body, Depends
import subprocess
import os
import re
import traceback
from pydantic import BaseModel, Field
from typing import Annotated, List
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database_config import get_db
from ..auth import get_current_user, CurrentUser

router = APIRouter()

class Workspace(BaseModel):
    path: str

class CloneRequest(BaseModel):
    repo_url: str = Field(..., description="The URL of the Git repository to clone.")
    local_path: str = Field(..., description="The absolute local path (parent directory) where the repository should be cloned. The repository will be cloned into a subfolder named after the repository.")
    pat: str | None = None

class CommitRequest(BaseModel):
    workspace_path: str = Field(..., description="The path to the workspace (the local git repository).")
    message: str = Field(..., description="The commit message.")

@router.get("/api/workspaces/published", response_model=list[schemas.WorkspaceResponse], tags=["Workspaces"])
def get_published_workspaces(db: Session = Depends(get_db)):
    """
    Returns a list of all workspaces.
    """
    return db.query(models.Workspace).distinct().all()

@router.post("/api/workspaces/clone", tags=["Workspaces"])
async def clone_repo(req: CloneRequest, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Clones a Git repository into the specified local parent directory, or updates it if it already exists.
    """
    try:
        repo_name = req.repo_url.split('/')[-1].replace('.git', '')
        cloned_path = os.path.join(req.local_path, repo_name)

        clone_url = req.repo_url
        if req.pat:
            if "https://" in clone_url:
                parts = clone_url.split("https://")
                clone_url = f"https://oauth2:{req.pat}@{parts[1]}"
            elif "http://" in clone_url:
                parts = clone_url.split("http://")
                clone_url = f"http://oauth2:{req.pat}@{parts[1]}"

        if os.path.exists(cloned_path):
            if os.path.isdir(cloned_path) and os.path.exists(os.path.join(cloned_path, '.git')):
                message = "workspace exists in path, loading it..."
            else:
                raise HTTPException(
                    status_code=409, 
                    detail=f"A folder named '{repo_name}' already exists here but isn't a Git repository. Please remove it or choose a different location."
                )
        else:
            os.makedirs(req.local_path, exist_ok=True)
            subprocess.run(
                ["git", "clone", clone_url, repo_name],
                cwd=req.local_path,
                check=True,
                capture_output=True,
                text=True
            )
            message = f"Repository cloned successfully to {cloned_path}"

        # After successful clone or pull, create or update the workspace in the database
        workspace = db.query(models.Workspace).filter(models.Workspace.path == cloned_path).first()
        if not workspace:
            workspace = models.Workspace(
                name=repo_name,
                path=cloned_path
            )
            db.add(workspace)
            db.commit()
            db.refresh(workspace)
            message += " and added to workspaces."
        
        return {"message": message, "cloned_path": cloned_path, "workspace_id": workspace.id}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git operation failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {traceback.format_exc()}")

@router.get("/api/workspaces/status", tags=["Workspaces"])
async def get_workspace_status(workspace_path: str, db: Session = Depends(get_db)):
    """
    Gets the Git status of a workspace.
    """
    if not os.path.isdir(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        status_result = subprocess.run(
            ["git", "status", "--porcelain=v2", "-b"],
            cwd=workspace_path,
            check=True,
            capture_output=True,
            text=True
        ).stdout.strip()
        
        lines = status_result.split('\n')
        branch_info = {}
        changed_files = []

        for line in lines:
            if line.startswith('#'):
                parts = line.split(' ')
                if parts[1] == 'branch.oid':
                    branch_info['oid'] = parts[2]
                elif parts[1] == 'branch.head':
                    branch_info['branch'] = parts[2]
                elif parts[1] == 'branch.upstream':
                    branch_info['remote_branch'] = parts[2]
                elif parts[1] == 'branch.ab':
                    branch_info['ahead'] = int(parts[2].replace('+', ''))
                    branch_info['behind'] = int(parts[3].replace('-', ''))
            else:
                # Parse the porcelain v2 format for changed files
                parts = line.split(' ')
                if len(parts) >= 9: 
                    file_path = ' '.join(parts[8:])
                    changed_files.append(file_path)
                else:
                    changed_files.append(line)

        return {
            "branch_info": branch_info,
            "changed_files": changed_files
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get git status: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/workspaces/scripts", tags=["Workspaces"])
async def get_workspace_scripts(workspace_path: str) -> List[str]:
    """
    Gets a list of all C# script files (.cs) within a given workspace path.
    """
    if not os.path.isdir(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    
    script_files = []
    for root, _, files in os.walk(workspace_path):
        for file in files:
            if file.endswith(".cs"):
                script_files.append(os.path.join(root, file))
    
    return script_files

@router.post("/api/workspaces/commit", tags=["Workspaces"])
async def commit_changes(req: CommitRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Adds all changes and commits them with a message.
    """
    if not os.path.isdir(req.workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        subprocess.run(["git", "add", "."], cwd=req.workspace_path, check=True)
        
        subprocess.run(
            ["git", "commit", "-m", req.message],
            cwd=req.workspace_path,
            check=True,
            capture_output=True,
            text=True
        )
        return {"message": "Commit successful."}
    except subprocess.CalledProcessError as e:
        if "nothing to commit" in e.stdout or "nothing to commit" in e.stderr:
            raise HTTPException(status_code=400, detail="Nothing to commit, working tree clean.")
        else:
            raise HTTPException(status_code=400, detail=f"Commit failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/workspaces/pull", tags=["Workspaces"])
async def pull_changes(workspace: Annotated[Workspace, Body(embed=True)], current_user: CurrentUser = Depends(get_current_user)):
    """
    Pulls changes from the remote repository. Uses --rebase to avoid merge commits.
    """
    if not os.path.isdir(workspace.path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        pull_result = subprocess.run(
            ["git", "pull", "--rebase"],
            cwd=workspace.path,
            check=True,
            capture_output=True,
            text=True
        )
        return {"message": "Pull successful.", "output": pull_result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Pull failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/workspaces/push", tags=["Workspaces"])
async def push_changes(workspace: Annotated[Workspace, Body(embed=True)], current_user: CurrentUser = Depends(get_current_user)):
    """
    Pushes changes to the remote repository.
    """
    if not os.path.isdir(workspace.path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        push_result = subprocess.run(
            ["git", "push"],
            cwd=workspace.path,
            check=True,
            capture_output=True,
            text=True
        )
        return {"message": "Push successful.", "output": push_result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Push failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/workspaces/sync", tags=["Workspaces"])
async def sync_workspace(workspace: Annotated[Workspace, Body(embed=True)], current_user: CurrentUser = Depends(get_current_user)):
    """
    Syncs the workspace by pulling and then pushing changes.
    """
    if not os.path.isdir(workspace.path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    
    try:
        pull_result = subprocess.run(
            ["git", "pull", "--rebase"],
            cwd=workspace.path,
            check=True,
            capture_output=True,
            text=True
        )

        push_result = subprocess.run(
            ["git", "push"],
            cwd=workspace.path,
            check=True,
            capture_output=True,
            text=True
        )
        return {
            "message": "Sync (pull and push) successful.",
            "pull_output": pull_result.stdout,
            "push_output": push_result.stdout
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))