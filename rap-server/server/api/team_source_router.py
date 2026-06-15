import logging
import os
import shutil
import subprocess
import traceback
from typing import Annotated, List

from auth import CurrentUser, get_current_user
from database_config import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
import schemas
from grpc_client import stop_sync_session
from ide_manager import ACTIVE_IDE_SESSIONS, remove_active_ide_session, cleanup_stale_sessions

if os.name == 'nt':
    CREATE_NO_WINDOW = 0x08000000
else:
    CREATE_NO_WINDOW = 0

router = APIRouter()

class TeamSourcePath(BaseModel):
    path: str

class CloneRequest(BaseModel):
    repo_url: str = Field(..., description="The URL of the Git repository to clone.")
    local_path: str = Field(..., description="The absolute local path parent directory.")
    pat: str | None = None

class CommitRequest(BaseModel):
    source_path: str = Field(..., description="The path to the local git repository.")
    message: str = Field(..., description="The commit message.")

class BranchListResponse(BaseModel):
    current_branch: str
    branches: List[str]

class CheckoutRequest(BaseModel):
    source_path: str = Field(..., description="The path to the source.")
    branch_name: str = Field(..., description="The name of the branch to checkout.")

class CreateBranchRequest(BaseModel):
    source_path: str = Field(..., description="The path to the source.")
    branch_name: str = Field(..., description="The name of the new branch to create.")

class RenameRequest(BaseModel):
    oldPath: str
    newName: str

# --- VS CODE IDE SESSIONS ---

@router.get("/api/sync/active-sessions", tags=["IDE Sessions"])
async def get_active_ide_sessions(current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns a map of which project folders are currently open in VS Code.
    Auto-cleans stale sessions on every poll.
    """
    cleanup_stale_sessions()
    return ACTIVE_IDE_SESSIONS

@router.post("/api/sync/clear-session", tags=["IDE Sessions"])
async def clear_ide_session_endpoint(req: TeamSourcePath, current_user: CurrentUser = Depends(get_current_user)):
    """
    Manually removes an active IDE session entry.
    """
    # 1. Tell Addin to stop watchers (if any)
    stop_sync_session(req.path)
    
    # 2. Clear local session record
    remove_active_ide_session(req.path)
    
    return {"success": True, "message": "IDE session record cleared."}


# --- TEAM SCRIPT SOURCES (The Git Repos) ---

@router.post("/api/team-sources/register", response_model=schemas.RegisteredTeamSourceResponse, tags=["Team Sources"])
async def register_team_source(
    req: schemas.RegisteredTeamSourceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    logging.info(f"Registering team source: team_id={req.team_id}, name={req.name}, repo_url={req.repo_url}")
    
    db_source = models.RegisteredTeamSource(
        team_id=req.team_id,
        name=req.name,
        repo_url=req.repo_url
    )
    db.add(db_source)
    db.commit()
    db.refresh(db_source)
    return db_source

@router.get("/api/team-sources/registered/{team_id}", response_model=List[schemas.RegisteredTeamSourceResponse], tags=["Team Sources"])
async def get_team_registered_sources(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    if team_id == 0:
        return []
    
    sources = db.query(models.RegisteredTeamSource).filter(models.RegisteredTeamSource.team_id == team_id).all()
    return sources

@router.post("/api/team-sources/create-branch", tags=["Team Sources"])
async def create_branch(req: CreateBranchRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(req.source_path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        subprocess.run(
            ["git", "checkout", "-b", req.branch_name],
            cwd=req.source_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": f"Successfully created and checked out branch {req.branch_name}."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create branch {req.branch_name}: {e.stderr}")

@router.post("/api/team-sources/checkout", tags=["Team Sources"])
async def checkout_branch(req: CheckoutRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(req.source_path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        subprocess.run(
            ["git", "checkout", req.branch_name],
            cwd=req.source_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": f"Successfully checked out branch {req.branch_name}."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to checkout branch {req.branch_name}: {e.stderr}")

@router.get("/api/team-sources/branches", response_model=BranchListResponse, tags=["Team Sources"])
async def get_source_branches(source_path: str, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        current_branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=source_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        current_branch = current_branch_result.stdout.strip()

        branches_result = subprocess.run(
            ["git", "branch", "-a"],
            cwd=source_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        all_branches = []
        for line in branches_result.stdout.splitlines():
            branch_name = line.strip()
            if branch_name.startswith('*'):
                branch_name = branch_name[1:].strip()

            if "HEAD ->" in branch_name:
                continue

            if branch_name.startswith('remotes/origin/'):
                branch_name = branch_name.replace('remotes/origin/', '')
            if branch_name != 'HEAD' and branch_name not in all_branches:
                all_branches.append(branch_name)

        return {"current_branch": current_branch, "branches": sorted(all_branches)}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {e.stderr}")

@router.post("/api/team-sources/clone", tags=["Team Sources"])
async def clone_team_source(req: CloneRequest, current_user: CurrentUser = Depends(get_current_user)):
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
                message = "Source exists in path, loading it..."
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"A folder named '{repo_name}' already exists here but isn't a Git repository."
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
            message = f"Source cloned successfully to {cloned_path}"

        return {"message": message, "cloned_path": cloned_path}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git operation failed: {e.stderr}")

@router.get("/api/team-sources/status", tags=["Team Sources"])
async def get_source_status(source_path: str, fetch: bool = False, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        if fetch:
            subprocess.run(["git", "fetch"], cwd=source_path, check=True, creationflags=CREATE_NO_WINDOW)

        status_result = subprocess.run(
            ["git", "status", "--porcelain=v2", "-b"],
            cwd=source_path,
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

@router.post("/api/team-sources/commit", tags=["Team Sources"])
async def commit_source_changes(req: Annotated[CommitRequest, Body()], current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(req.source_path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        subprocess.run(["git", "add", "."], cwd=req.source_path, check=True, creationflags=CREATE_NO_WINDOW)
        subprocess.run(
            ["git", "commit", "-m", req.message],
            cwd=req.source_path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": "Commit successful."}
    except subprocess.CalledProcessError as e:
        if "nothing to commit" in e.stdout or "nothing to commit" in e.stderr:
            raise HTTPException(status_code=400, detail="Nothing to commit, working tree clean.")
        raise HTTPException(status_code=400, detail=f"Commit failed: {e.stderr}")

@router.post("/api/team-sources/rename-script", tags=["Team Sources"])
async def rename_script_endpoint(req: RenameRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Renames a script. Automatically stops any active sync session for the old path.
    """
    # 1. Auto-stop sync session if exists
    stop_sync_session(req.oldPath)
    
    # 2. Perform rename via gRPC
    from grpc_client import rename_script as grpc_rename_script
    response = grpc_rename_script(req.oldPath, req.newName)
    
    if not response.get("is_success"):
        raise HTTPException(status_code=400, detail=response.get("error_message"))
        
    return {
        "success": True, 
        "message": f"Successfully renamed script to {req.newName}",
        "newPath": response.get("new_path")
    }

@router.post("/api/team-sources/pull", tags=["Team Sources"])
async def pull_source_changes(req: TeamSourcePath, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(req.path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        pull_result = subprocess.run(
            ["git", "pull", "--rebase"],
            cwd=req.path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": "Pull successful.", "output": pull_result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Pull failed: {e.stderr}")

@router.post("/api/team-sources/push", tags=["Team Sources"])
async def push_source_changes(req: TeamSourcePath, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isdir(req.path):
        raise HTTPException(status_code=404, detail="Source path not found.")
    try:
        push_result = subprocess.run(
            ["git", "push"],
            cwd=req.path,
            check=True,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW
        )
        return {"message": "Push successful.", "output": push_result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Push failed: {e.stderr}")

class PullTeamSourcesRequest(BaseModel):
    source_paths: List[str] = Field(..., description="List of absolute paths to sources to pull.")
    branch: str | None = None

@router.post("/api/team-sources/pull-all", tags=["Team Sources"])
async def pull_all_team_sources(
    req: PullTeamSourcesRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    results = []
    for path in req.source_paths:
        if not os.path.isdir(path):
            results.append({"path": path, "status": "failed", "message": "Source path not found."})
            continue
        try:
            command = ["git", "pull", "--rebase"]
            if req.branch:
                command.insert(2, "origin")
                command.insert(3, req.branch)

            subprocess.run(command, cwd=path, check=True, creationflags=CREATE_NO_WINDOW)
            results.append({"path": path, "status": "success", "message": "Pull successful."})
        except subprocess.CalledProcessError as e:
            results.append({"path": path, "status": "failed", "message": f"Pull failed: {e.stderr}"})

    return {"message": "Pull operations completed.", "results": results}

@router.delete("/api/team-sources/registered/{source_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Team Sources"])
async def delete_registered_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    db_source = db.query(models.RegisteredTeamSource).filter(models.RegisteredTeamSource.id == source_id).first()
    if not db_source:
        raise HTTPException(status_code=404, detail="Registered source not found")

    if current_user.activeRole != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can delete registered sources.")

    db.delete(db_source)
    db.commit()
    return {}

@router.delete("/api/team-sources/local", status_code=status.HTTP_204_NO_CONTENT, tags=["Team Sources"])
async def delete_local_source_files(
    req: TeamSourcePath,
    current_user: CurrentUser = Depends(get_current_user)
):
    if not os.path.isdir(req.path):
        raise HTTPException(status_code=404, detail="Local source path not found.")

    try:
        if os.name == 'nt':
            subprocess.run(["rmdir", "/s", "/q", req.path], check=True, shell=True, creationflags=CREATE_NO_WINDOW)
        else:
            shutil.rmtree(req.path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete source directory: {e}")

    return {}
