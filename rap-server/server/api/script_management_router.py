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
    template_id: Optional[str] = "blank"

class DeleteScriptRequest(BaseModel):
    script_path: str
    delete_scaffolding_only: bool = False

class ComputeOptionsRequest(BaseModel):
    scriptPath: str
    parameterName: str
    parameters: Optional[Dict] = None

class EditScriptRequest(BaseModel):
    scriptPath: str
    force_scaffold: bool = False

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
    parameters: Optional[List[Dict[str, Any]]] = None

class InitializeSourceRequest(BaseModel):
    path: str
    description: Optional[str] = None

class ValidateSourcesRequest(BaseModel):
    paths: List[str]

# --- Endpoints ---

@router.post("/api/scripts/validate-sources", tags=["Script Management"])
async def validate_sources(request: ValidateSourcesRequest):
    """
    Checks which of the provided absolute paths still exist on the file system.
    Used for auto-healing the Sidebar from stale entries.
    """
    results = {}
    for p in request.paths:
        results[p] = os.path.isdir(p)
    return results

@router.post("/api/scripts/initialize-source", tags=["Script Management"])
async def initialize_source(request: InitializeSourceRequest):
    """
    Initializes a folder as a Paracore Script Source by creating the .paracore marker file.
    Prevents nested sources and accepts an optional description.
    """
    try:
        result = script_service.initialize_source_logic(request.path, request.description or "")
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/scripts/check-lock", tags=["Script Management"])
async def check_script_lock(request: Dict[str, str]):
    """
    Proactively checks if a script folder is locked by an IDE or the OS.
    """
    path = request.get("scriptPath")
    if not path:
        raise HTTPException(status_code=400, detail="scriptPath is required")
    
    from ide_manager import is_folder_locked, normalize_ide_path, ACTIVE_IDE_SESSIONS
    norm_path = normalize_ide_path(path)
    locked = is_folder_locked(norm_path)
    
    return {
        "locked": locked,
        "path": norm_path,
        "is_tracked": norm_path in ACTIVE_IDE_SESSIONS
    }

@router.post("/api/watchdogs/register-source", tags=["Script Management"])
async def register_watchdog_source(request: RegisterWatchdogSourceRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Tells the Addin to scan a folder and arm all watchdogs found within.
    """
    try:
        result = script_service.register_watchdog_source_logic(request.path, request.parameters)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/watchdogs/unregister-source", tags=["Script Management"])
async def unregister_watchdog_source(request: RegisterWatchdogSourceRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Tells the Addin to stop all watchdogs from a specific source folder.
    Uses the same Request model as Register (just a path).
    """
    try:
        result = script_service.unregister_watchdog_source_logic(request.path)
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
    project_root = os.path.normpath(request.script_path)
    parent_folder = os.path.dirname(project_root)
    script_name = os.path.basename(project_root)
    
    return await script_service.create_new_script_logic(
        parent_folder,
        script_name,
        template_id=request.template_id,
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

@router.get("/api/script-details", tags=["Script Management"])
async def get_script_details(scriptPath: str = Query(...)):
    if not scriptPath or not os.path.isabs(scriptPath):
        raise HTTPException(status_code=400, detail="scriptPath is required and must be absolute")
    return await script_service.get_single_script_logic(scriptPath)

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
async def edit_script(request: EditScriptRequest):
    return await script_service.edit_script_logic(request.scriptPath, request.force_scaffold)

@router.post("/api/save-script", tags=["Script Management"])
async def save_script(request: SaveScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    return await script_service.save_script_logic(request.script_path, request.content, request.filename, request.files)

@router.post("/api/compute-parameter-options", tags=["Script Management"])
async def compute_options(request: ComputeOptionsRequest):
    return await script_service.compute_parameter_options_logic(request.scriptPath, request.parameterName, request.parameters)


@router.post("/api/rename-script", tags=["Script Management"])
async def rename_script(request: RenameRequest, current_user: CurrentUser = Depends(get_current_user)):
    return script_service.rename_script_logic(request.oldPath, request.newName)

@router.post("/api/scripts/clear-cache", tags=["Script Management"])
async def clear_cache(current_user: CurrentUser = Depends(get_current_user)):
    """
    Clears the internal in-memory assembly cache in the Revit engine.
    """
    from grpc_client import clear_assembly_cache
    return clear_assembly_cache()

class UpdateMetadataRequest(BaseModel):
    script_path: str
    metadata_block: str

@router.get("/api/scripts/raw-main-file", tags=["Script Management"])
async def get_raw_main_file(scriptPath: str = Query(...)):
    """Returns the raw content of the main .cs file (not the combined script)."""
    try:
        abs_p = script_service.resolve_script_path(scriptPath)
        script_name = os.path.basename(abs_p)
        main_file = os.path.join(abs_p, "Scripts", f"{script_name}.cs")
        if not os.path.isfile(main_file):
            raise HTTPException(status_code=404, detail=f"Main file not found: {script_name}.cs")
        with open(main_file, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        return {"content": content, "filename": f"{script_name}.cs"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/scripts/update-metadata", tags=["Script Management"])
async def update_metadata(request: UpdateMetadataRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Replaces or prepends the /* ... */ metadata block in the main .cs file."""
    import re
    try:
        abs_p = script_service.resolve_script_path(request.script_path)
        script_name = os.path.basename(abs_p)
        main_file = os.path.join(abs_p, "Scripts", f"{script_name}.cs")
        if not os.path.isfile(main_file):
            raise HTTPException(status_code=404, detail=f"Main file not found: {script_name}.cs")

        with open(main_file, 'r', encoding='utf-8-sig') as f:
            content = f.read()

        # V4 ELITE: Robust metadata replacement. Matches the block even if preceded by BOM/whitespace.
        metadata_pattern = r'/\*[\s\S]*?\*/'
        # Search only in the first 2000 chars to target the header block
        match = re.search(metadata_pattern, content[:2000])

        if match:
            # Replace the found block and preserve surrounding text
            # We add \n\n to ensure an empty line exists before the script content
            # .lstrip() ensures we don't end up with more than one empty line
            updated = content[:match.start()] + request.metadata_block + '\n\n' + content[match.end():].lstrip()
        else:
            # Prepend to the top
            updated = request.metadata_block + '\n\n' + content

        with open(main_file, 'w', encoding='utf-8') as f:
            f.write(updated)

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
