import os
from typing import Dict, Literal, Optional

from auth import CurrentUser, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from utils import resolve_script_path
from grpc_client import compute_parameter_options, rename_script
from services import script_service

router = APIRouter()

# --- Pydantic Models ---
class NewScriptRequest(BaseModel):
    parent_folder: str = Field(..., description="The absolute path of the folder where the script or folder will be created.")
    script_type: Literal['single', 'multi'] = Field(..., description="The type of script to create.")
    script_name: str = Field(..., description="The name of the .cs file to create.")
    folder_name: str | None = Field(None, description="The name of the folder for multi-script projects.")
    template_id: str = Field("blank", description="The ID of the industrial archetype to use.")

class ComputeOptionsRequest(BaseModel):
    scriptPath: str
    type: str
    parameterName: str
    parameters: Optional[Dict] = None

class RenameRequest(BaseModel):
    oldPath: str
    newName: str

class SaveScriptRequest(BaseModel):
    script_path: str
    type: str
    content: Optional[str] = None
    filename: Optional[str] = None
    files: Optional[Dict[str, str]] = None

# --- Endpoints ---

@router.post("/api/scripts/new", tags=["Script Management"])
async def create_new_script(request: NewScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isabs(request.parent_folder) or not os.path.isdir(request.parent_folder):
        raise HTTPException(status_code=400, detail="Invalid parent folder path.")
    return script_service.create_new_script_logic(
        request.parent_folder, request.script_type, request.script_name, request.folder_name, request.template_id
    )

@router.get("/api/scripts", tags=["Script Management"])
async def get_scripts(folderPath: str):
    if not folderPath or not os.path.isabs(folderPath):
        raise HTTPException(status_code=400, detail="A valid, absolute folder path is required.")
    scripts = await script_service.get_all_scripts(folderPath)
    return JSONResponse(content=scripts)

@router.post("/api/script-metadata", tags=["Script Management"])
async def get_script_metadata_endpoint(request: Request):
    data = await request.json()
    script_path, script_type = data.get("scriptPath"), data.get("type")
    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")
    response = await script_service.get_script_metadata_logic(script_path, script_type)
    return JSONResponse(content=response)

@router.post("/api/get-script-parameters", tags=["Script Management"])
async def get_script_parameters_endpoint(request: Request):
    data = await request.json()
    script_path, script_type = data.get("scriptPath"), data.get("type")
    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")
    response = await script_service.get_script_parameters_logic(script_path, script_type)
    return JSONResponse(content=response)

@router.get("/api/script-content", tags=["Script Management"])
async def get_script_content(scriptPath: str, type: str):
    if not scriptPath or not type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required")
    response = await script_service.get_script_content_logic(scriptPath, type)
    return JSONResponse(content=response)

@router.post("/api/edit-script", tags=["Script Management"])
async def edit_script(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    data = await request.json()
    script_path, script_type = data.get("scriptPath"), data.get("type")
    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")
    response = await script_service.edit_script_logic(script_path, script_type)
    return JSONResponse(content=response)

@router.post("/api/save-script", tags=["Script Management"])
async def save_script(request: SaveScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isabs(request.script_path):
        raise HTTPException(status_code=400, detail="An absolute script path is required.")
    if not request.content and not request.files:
        raise HTTPException(status_code=400, detail="Either 'content' or 'files' must be provided.")
    
    response = await script_service.save_script_logic(
        request.script_path, request.type, request.content, request.filename, request.files
    )
    return response

@router.post("/api/compute-parameter-options", tags=["Script Management"])
async def compute_parameter_options_endpoint(request: ComputeOptionsRequest):
    absolute_path = resolve_script_path(request.scriptPath)
    source_code = ""
    if request.type == "single-file":
        with open(absolute_path, 'r', encoding='utf-8-sig') as f:
            source_code = f.read()
    else:
        # Multi-file combination logic (keep here for now as it's small)
        files = []
        for fp in glob.glob(os.path.join(absolute_path, "*.cs")):
            with open(fp, 'r', encoding='utf-8-sig') as f:
                files.append({"file_name": os.path.basename(fp), "content": f.read()})
        from grpc_client import get_combined_script
        source_code = get_combined_script(files).get("combined_script", "")

    if not source_code:
        raise HTTPException(status_code=404, detail="Script content not found.")

    response = compute_parameter_options(source_code, request.parameterName, request.parameters)
    return JSONResponse(content=response)

@router.post("/api/rename-script", tags=["Script Management"])
async def rename_script_endpoint(request: RenameRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isabs(request.oldPath):
        raise HTTPException(status_code=400, detail="An absolute script path is required.")
    response = rename_script(request.oldPath, request.newName)
    if not response.get("is_success"):
        raise HTTPException(status_code=400, detail=response.get("error_message"))
    return JSONResponse(content={
        "success": True,
        "message": f"Successfully renamed script to {request.newName}",
        "newPath": response.get("new_path")
    })
