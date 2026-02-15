from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import traceback

from services import script_service, migration_service
from auth import get_current_user, CurrentUser

router = APIRouter()

# --- Models ---

class MigrateRequest(BaseModel):
    folder_path: str

class NewScriptRequest(BaseModel):
    parent_folder: str
    script_name: str
    folder_name: Optional[str] = None
    template_id: str = "blank"
    generated_logic: Optional[str] = None
    generated_params: Optional[str] = None
    overwrite: bool = False

class ReplaceCodeRequest(BaseModel):
    script_path: str
    new_logic: str
    new_params: str

class DeleteScriptRequest(BaseModel):
    script_path: str
    delete_scaffolding_only: bool = False

class ComputeOptionsRequest(BaseModel):
    scriptPath: str
    parameterName: str
    parameters: Optional[Dict] = None

class RenameRequest(BaseModel):
    oldPath: str
    newName: str

class SaveScriptRequest(BaseModel):
    script_path: str
    content: Optional[str] = None
    filename: Optional[str] = None
    files: Optional[Dict[str, str]] = None

class RegisterWatchdogSourceRequest(BaseModel):
    path: str

# --- Endpoints ---

@router.post("/api/watchdogs/register-source", tags=["Script Management"])
async def register_watchdog_source(request: RegisterWatchdogSourceRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Tells the Addin to scan a folder and arm all watchdogs found within.
    """
    try:
        result = script_service.register_watchdog_source_logic(request.path)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/admin/migrate-to-projects", tags=["Script Management"])
async def migrate_to_projects(request: MigrateRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Developer-only endpoint to convert legacy scripts in a folder to unified project folders.
    """
    if current_user.activeRole != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can trigger migration.")
    return migration_service.migrate_folder_to_projects(request.folder_path)

@router.post("/api/scripts/new", tags=["Script Management"])
async def create_new_script(request: NewScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isabs(request.parent_folder) or not os.path.isdir(request.parent_folder):
        raise HTTPException(status_code=400, detail="Invalid parent folder path.")
    return await script_service.create_new_script_logic(
        request.parent_folder, request.script_name, request.folder_name, request.template_id,
        request.generated_logic, request.generated_params, request.overwrite
    )

@router.post("/api/scripts/replace-code", tags=["Script Management"])
async def replace_script_code(request: ReplaceCodeRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Surgically replaces logic and parameters for an existing script.
    """
    # Fix: Correctly resolve pack_folder and project_name
    # For a project folder like C:/MyPack/MyTool/, dirname is C:/MyPack
    project_root = os.path.normpath(request.script_path)
    parent_folder = os.path.dirname(project_root)
    script_name = os.path.basename(project_root)
    
    return await script_service.create_new_script_logic(
        parent_folder,
        script_name,
        generated_logic=request.new_logic,
        generated_params=request.new_params,
        overwrite=True
    )

@router.post("/api/scripts/delete", tags=["Script Management"])
async def delete_script(request: DeleteScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    return script_service.delete_script_logic(request.script_path, request.delete_scaffolding_only)

@router.get("/api/scripts", tags=["Script Management"])
async def get_scripts(folderPath: str):
    if not folderPath or not os.path.isabs(folderPath):
        raise HTTPException(status_code=400, detail="A valid, absolute folder path is required.")
    scripts = await script_service.get_all_scripts(folderPath)
    return JSONResponse(content=scripts)

@router.post("/api/script-metadata", tags=["Script Management"])
async def get_metadata(request: Dict[str, str]):
    path = request.get("scriptPath")
    if not path:
        raise HTTPException(status_code=400, detail="scriptPath is required")
    return await script_service.get_script_metadata_logic(path)

@router.post("/api/get-script-parameters", tags=["Script Management"])
async def get_parameters(request: Dict[str, str]):
    path = request.get("scriptPath")
    if not path:
        raise HTTPException(status_code=400, detail="scriptPath is required")
    return await script_service.get_script_parameters_logic(path)

@router.get("/api/script-content", tags=["Script Management"])
async def get_content(scriptPath: str = Query(...)):
    return await script_service.get_script_content_logic(scriptPath)

@router.post("/api/edit-script", tags=["Script Management"])
async def edit_script(request: Dict[str, str], current_user: CurrentUser = Depends(get_current_user)):
    path = request.get("scriptPath")
    if not path:
        raise HTTPException(status_code=400, detail="scriptPath is required")
    return await script_service.edit_script_logic(path)

@router.post("/api/save-script", tags=["Script Management"])
async def save_script(request: SaveScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    return await script_service.save_script_logic(request.script_path, request.content, request.filename, request.files)

@router.post("/api/compute-parameter-options", tags=["Script Management"])
async def compute_options(request: ComputeOptionsRequest):
    return await script_service.compute_parameter_options_logic(request.scriptPath, request.parameterName, request.parameters)

@router.get("/api/scripts/manifest", tags=["Script Management"])
async def get_manifest(path: str):
    if not path or not os.path.isabs(path):
        raise HTTPException(status_code=400, detail="A valid, absolute path is required.")
    return script_service.get_script_manifest_logic(path)

@router.post("/api/rename-script", tags=["Script Management"])
async def rename_script(request: RenameRequest, current_user: CurrentUser = Depends(get_current_user)):
    return script_service.rename_script_logic(request.oldPath, request.newName)
