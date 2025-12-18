from fastapi import APIRouter, HTTPException, Body, Depends, status
import subprocess
import os
import shutil
import re
import traceback
from pydantic import BaseModel, Field
from typing import Annotated, List
from sqlalchemy.orm import Session
import logging # Added logging

import models, schemas
from database_config import get_db
from auth import get_current_user, CurrentUser

logging.basicConfig(level=logging.INFO) # Configure basic logging

# Add CREATE_NO_WINDOW flag for Windows to prevent console pop-ups
if os.name == 'nt':
    CREATE_NO_WINDOW = 0x08000000
else:
    CREATE_NO_WINDOW = 0

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

class BranchListResponse(BaseModel):
    current_branch: str
    branches: List[str]

class CheckoutRequest(BaseModel):
    workspace_path: str = Field(..., description="The path to the workspace.")
    branch_name: str = Field(..., description="The name of the branch to checkout.")

class CreateBranchRequest(BaseModel):
    workspace_path: str = Field(..., description="The path to the workspace.")
    branch_name: str = Field(..., description="The name of the new branch to create.")

@router.post("/api/workspaces/register", response_model=schemas.RegisteredWorkspaceResponse, tags=["Workspaces"])
async def register_team_workspace(
    req: schemas.RegisteredWorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user) # Ensure user is authenticated
):
    logging.info(f"Registering workspace: team_id={req.team_id}, name={req.name}, repo_url={req.repo_url}")
    """
    Registers a new workspace for a team.
    """
    # Basic authorization: ensure the current user is part of the team they are registering for
    # This needs to be refined based on how current_user is structured from rap-auth-server
    # For now, we'll assume the frontend sends the correct team_id for the active team.
    # Further authorization logic can be added here if needed (e.g., only admins can register).

    db_workspace = models.RegisteredWorkspace(
        team_id=req.team_id,
        name=req.name,
        repo_url=req.repo_url
    )
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    logging.info(f"Workspace registered successfully: id={db_workspace.id}, team_id={db_workspace.team_id}")
    return db_workspace

@router.get("/api/workspaces/registered/{team_id}", response_model=List[schemas.RegisteredWorkspaceResponse], tags=["Workspaces"])
async def get_team_registered_workspaces(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user) # Ensure user is authenticated
):
    if team_id == 0:
        return []
    logging.info(f"Fetching registered workspaces for team_id: {team_id}")
    """
    Retrieves all workspaces registered for a specific team.
    """
    # Basic authorization: ensure the current user is part of the team they are querying
    # This needs to be refined based on how current_user is structured from rap-auth-server
    # For now, we'll assume the frontend sends the correct team_id for the active team.
    # Further authorization logic can be added here if needed.

    workspaces = db.query(models.RegisteredWorkspace).filter(models.RegisteredWorkspace.team_id == team_id).all()
    logging.info(f"Found {len(workspaces)} registered workspaces for team_id {team_id}.")
    return workspaces

@router.post("/api/workspaces/create-branch", tags=["Workspaces"])
async def create_branch(req: CreateBranchRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Creates a new branch and checks it out.
    """
    if not os.path.isdir(req.workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        subprocess.run(
            ["git", "checkout", "-b", req.branch_name],
            cwd=req.workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": f"Successfully created and checked out branch {req.branch_name}."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create branch {req.branch_name}: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/workspaces/checkout", tags=["Workspaces"])
async def checkout_branch(req: CheckoutRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Checks out a specific branch in the workspace.
    """
    if not os.path.isdir(req.workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        subprocess.run(
            ["git", "checkout", req.branch_name],
            cwd=req.workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": f"Successfully checked out branch {req.branch_name}."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to checkout branch {req.branch_name}: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/workspaces/branches", response_model=BranchListResponse, tags=["Workspaces"])
async def get_workspace_branches(workspace_path: str, current_user: CurrentUser = Depends(get_current_user)):
    """
    Lists all local and remote branches for a given workspace.
    """
    if not os.path.isdir(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        # Get current branch
        current_branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        current_branch = current_branch_result.stdout.strip()

        # Get all branches (local and remote)
        branches_result = subprocess.run(
            ["git", "branch", "-a"],
            cwd=workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        all_branches = []
        for line in branches_result.stdout.splitlines():
            branch_name = line.strip()
            if branch_name.startswith('*'):
                branch_name = branch_name[1:].strip() # Remove asterisk for current branch
            
            # Filter out the "HEAD -> origin/main" line
            if "HEAD ->" in branch_name:
                continue # Skip this line

            if branch_name.startswith('remotes/origin/'):
                branch_name = branch_name.replace('remotes/origin/', '')
            if branch_name != 'HEAD' and branch_name not in all_branches:
                all_branches.append(branch_name)
        
        return {"current_branch": current_branch, "branches": sorted(all_branches)}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/workspaces/published", response_model=list[schemas.WorkspaceResponse], tags=["Workspaces"])
def get_published_workspaces(db: Session = Depends(get_db)):
    """
    Returns a list of all workspaces.
    """
    return db.query(models.Workspace).distinct().all()



@router.post("/api/workspaces/clone", tags=["Workspaces"])
async def clone_repo(req: CloneRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Clones a Git repository into the specified local parent directory.
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
                text=True,
                creationflags=CREATE_NO_WINDOW
            )
            message = f"Repository cloned successfully to {cloned_path}"
        
        return {"message": message, "cloned_path": cloned_path}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git operation failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {traceback.format_exc()}")

@router.get("/api/workspaces/status", tags=["Workspaces"])
async def get_workspace_status(workspace_path: str, db: Session = Depends(get_db), fetch: bool = False):
    """
    Gets the Git status of a workspace.
    If fetch is True, performs a git fetch before getting the status.
    """
    if not os.path.isdir(workspace_path):
        raise HTTPException(status_code=404, detail="Workspace path not found.")
    try:
        if fetch: # Perform git fetch if requested
            subprocess.run(
                ["git", "fetch"],
                cwd=workspace_path,
                check=True,
                capture_output=True,
                text=True,
                creationflags=CREATE_NO_WINDOW
            )

        status_result = subprocess.run(
            ["git", "status", "--porcelain=v2", "-b"],
            cwd=workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
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
        subprocess.run(["git", "add", "."], cwd=req.workspace_path, check=True, creationflags=CREATE_NO_WINDOW)
        
        subprocess.run(
            ["git", "commit", "-m", req.message],
            cwd=req.workspace_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
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
            text=True,
            creationflags=CREATE_NO_WINDOW
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
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": "Push successful.", "output": push_result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Push failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PullTeamWorkspacesRequest(BaseModel):
    workspace_paths: List[str] = Field(..., description="List of absolute paths to workspaces to pull.")
    branch: str | None = None

@router.post("/api/workspaces/pull_team_workspaces", tags=["Workspaces"])
async def pull_team_workspaces(
    req: PullTeamWorkspacesRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Performs a git pull on all specified workspaces.
    """
    results = []
    for path in req.workspace_paths:
        if not os.path.isdir(path):
            results.append({"path": path, "status": "failed", "message": "Workspace path not found."})
            continue
        try:
            command = ["git", "pull", "--rebase"]
            if req.branch:
                command.insert(2, "origin")
                command.insert(3, req.branch)
            
            subprocess.run(
                command,
                cwd=path,
                check=True,
                capture_output=True,
                text=True,
                creationflags=CREATE_NO_WINDOW
            )
            results.append({"path": path, "status": "success", "message": "Pull successful."})
        except subprocess.CalledProcessError as e:
            results.append({"path": path, "status": "failed", "message": f"Pull failed: {e.stderr}"})
        except Exception as e:
            results.append({"path": path, "status": "failed", "message": str(e)})
    
    return {"message": "Pull operations completed.", "results": results}

@router.delete("/api/workspaces/registered/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Workspaces"])
async def delete_registered_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    logging.info(f"Deleting registered workspace with id: {workspace_id}")
    db_workspace = db.query(models.RegisteredWorkspace).filter(models.RegisteredWorkspace.id == workspace_id).first()

    if not db_workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registered workspace not found")

    # Basic authorization: ensure the current user is part of the team that owns this workspace
    # This needs to be refined based on how current_user is structured from rap-auth-server
    # For now, we'll assume the frontend sends the correct team_id for the active team.
    # Further authorization logic can be added here if needed (e.g., only admins can delete).
    if current_user.activeRole != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can delete registered workspaces.")

    db.delete(db_workspace)
    db.commit()
    logging.info(f"Registered workspace {workspace_id} deleted successfully.")
    return {}

@router.delete("/api/workspaces/local", status_code=status.HTTP_204_NO_CONTENT, tags=["Workspaces"])
async def delete_local_workspace(
    workspace: Workspace, # Changed to accept Workspace object from request body
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Deletes a locally cloned workspace from the filesystem.
    """
    logging.info(f"Attempting to delete local workspace at path: {workspace.path}")
    logging.info(f"Received request to delete workspace: {workspace.path}")

    workspace_path = workspace.path

    # Security check: ensure the path exists and is a directory
    if not os.path.isdir(workspace_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local workspace path not found.")

    try:
        if os.name == 'nt': # For Windows, use rmdir /s /q
            subprocess.run(["rmdir", "/s", "/q", workspace_path], check=True, shell=True, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        else: # For other OS, use shutil.rmtree
            shutil.rmtree(workspace_path)
        logging.info(f"Successfully deleted directory: {workspace_path}")

    except OSError as e:
        logging.error(f"Error deleting directory {workspace_path}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete workspace directory: {e}")
    
    return {}