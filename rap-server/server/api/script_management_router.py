import os
import json
import glob
import grpc
import shutil
import subprocess
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Literal
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database_config import get_db
from ..grpc_client import (
    get_script_metadata,
    get_script_parameters,
    get_combined_script,
    create_and_open_workspace
)
from ..utils import get_or_create_script, resolve_script_path
from ..auth import get_current_user, CurrentUser

router = APIRouter()

# --- Template for new scripts ---
CSHARP_TEMPLATE = """
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Version: 1.0.0
LastRun: null
IsDefault: true
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
This is a template script that creates a simple wall in a Revit project document.
Doc, UIDoc, UIApp, Transact, Print and Show are available in the global scope.

History:
- 2025-07-01: Initial release
- 2025-08-10: Added height parameter
*/


// These first top level statements marked with // [Parameter] will be treated as input parameters in the UI
// [Parameter]
string levelName = "Level 1";
// [Parameter]
double wallLengthMeters = 6.0;
// [Parameter]
double wallHeightMeters = 3.0;

// Other Top-Level Statements
double lengthFt = UnitUtils.ConvertToInternalUnits(wallLengthMeters, UnitTypeId.Meters);
double heightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
XYZ pt1 = new XYZ(-lengthFt / 2, 0, 0);
XYZ pt2 = new XYZ(lengthFt / 2, 0, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{
    return;
}


// Write operations inside a transaction
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
});
"""

# --- Pydantic Models for New Script Creation ---
class NewScriptRequest(BaseModel):
    parent_folder: str = Field(..., description="The absolute path of the folder where the script or folder will be created.")
    script_type: Literal['single', 'multi'] = Field(..., description="The type of script to create.")
    script_name: str = Field(..., description="The name of the .cs file to create.")
    folder_name: str | None = Field(None, description="The name of the folder for multi-script projects.")

@router.post("/api/scripts/new", tags=["Script Management"])
async def create_new_script(request: NewScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not os.path.isabs(request.parent_folder) or not os.path.isdir(request.parent_folder):
        raise HTTPException(status_code=400, detail="Invalid parent folder path.")

    if request.script_type == 'single':
        script_name = request.script_name if request.script_name.endswith('.cs') else f"{request.script_name}.cs"
        if not all(c.isalnum() or c in ('_', '-', '.') for c in script_name):
             raise HTTPException(status_code=400, detail="Script name contains invalid characters.")
        
        new_script_path = os.path.join(request.parent_folder, script_name)
        if os.path.exists(new_script_path):
            raise HTTPException(status_code=409, detail=f"Script '{script_name}' already exists in this location.")

        try:
            with open(new_script_path, 'w', encoding='utf-8') as f:
                f.write(CSHARP_TEMPLATE)
            return {"message": f"Successfully created script: {script_name}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create script file: {e}")

    elif request.script_type == 'multi':
        if not request.folder_name:
            raise HTTPException(status_code=400, detail="Folder name is required for multi-script projects.")

        if not all(c.isalnum() or c in ('_', '-') for c in request.folder_name):
             raise HTTPException(status_code=400, detail="Folder name contains invalid characters.")

        new_folder_path = os.path.join(request.parent_folder, request.folder_name)
        if os.path.exists(new_folder_path):
            raise HTTPException(status_code=409, detail=f"Folder '{request.folder_name}' already exists.")

        script_name = request.script_name if request.script_name.endswith('.cs') else f"{request.script_name}.cs"
        if not all(c.isalnum() or c in ('_', '-', '.') for c in script_name):
             raise HTTPException(status_code=400, detail="Script name contains invalid characters.")

        new_script_path = os.path.join(new_folder_path, script_name)

        try:
            os.makedirs(new_folder_path)
            with open(new_script_path, 'w', encoding='utf-8') as f:
                f.write(CSHARP_TEMPLATE)
            return {"message": f"Successfully created multi-script project: {request.folder_name}/{script_name}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create multi-script project: {e}")

    else:
        raise HTTPException(status_code=400, detail="Invalid script type specified.")

import traceback

@router.get("/api/scripts", tags=["Script Management"])
async def get_scripts(folderPath: str):
    if not folderPath or not os.path.isabs(folderPath) or not os.path.isdir(folderPath):
        raise HTTPException(status_code=400, detail="A valid, absolute folder path is required.")
    
    scripts = []
    try:
        # Process single .cs files
        for file_path in glob.glob(os.path.join(folderPath, "*.cs")):
            try:
                resolved_file_path = resolve_script_path(file_path)

                content = ""
                try:
                    with open(resolved_file_path, 'r', encoding='utf-8-sig') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(resolved_file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except Exception as e:
                        continue

                script_files = [{"file_name": os.path.basename(resolved_file_path), "content": content}]

                metadata = {}
                try:
                    metadata = get_script_metadata(script_files).get("metadata", {})
                except grpc.RpcError as e:
                    metadata = {"displayName": os.path.splitext(os.path.basename(resolved_file_path))[0], "description": f"Error: {e.details()}"}

                file_stat = os.stat(resolved_file_path)
                date_created = datetime.fromtimestamp(file_stat.st_ctime).isoformat()
                date_modified = datetime.fromtimestamp(file_stat.st_mtime).isoformat()

                scripts.append({
                    "id": resolved_file_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_file_path),
                    "type": "single-file",
                    "absolutePath": resolved_file_path.replace('\\', '/'),
                    "sourcePath": resolved_file_path.replace('\\', '/'),
                    "metadata": {
                        **metadata,
                        "dateCreated": date_created,
                        "dateModified": date_modified
                    }
                })
            except Exception as e:
                traceback.print_exc()
                continue

        # Process folders containing .cs files
        for item in os.listdir(folderPath):
            item_path = os.path.join(folderPath, item)
            if os.path.isdir(item_path) and glob.glob(os.path.join(item_path, "*.cs")):
                try:
                    resolved_item_path = resolve_script_path(item_path)
                    
                    script_files = []
                    for fp in glob.glob(os.path.join(item_path, "*.cs")):
                        content = ""
                        try:
                            with open(fp, 'r', encoding='utf-8-sig') as f:
                                content = f.read()
                        except UnicodeDecodeError:
                            try:
                                with open(fp, 'r', encoding='utf-8') as f:
                                    content = f.read()
                            except Exception as e:
                                continue
                        script_files.append({"file_name": os.path.basename(fp), "content": content})

                    if not script_files:
                        continue

                    metadata = {}
                    try:
                        metadata = get_script_metadata(script_files).get("metadata", {})
                    except grpc.RpcError as e:
                        metadata = {"displayName": os.path.basename(resolved_item_path), "description": f"Error: {e.details()}"}

                    folder_stat = os.stat(resolved_item_path)
                    date_created = datetime.fromtimestamp(folder_stat.st_ctime).isoformat()
                    date_modified = datetime.fromtimestamp(folder_stat.st_mtime).isoformat()

                    scripts.append({
                        "id": resolved_item_path.replace('\\', '/'),
                        "name": os.path.basename(resolved_item_path),
                        "type": "multi-file",
                        "absolutePath": resolved_item_path.replace('\\', '/'),
                        "sourcePath": resolved_item_path.replace('\\', '/'),
                        "metadata": {
                            **metadata,
                            "dateCreated": date_created,
                            "dateModified": date_modified
                        }
                    })
                except Exception as e:
                    traceback.print_exc()
                    continue
                    
        return JSONResponse(content=scripts)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get scripts: {str(e)}")

@router.post("/api/script-metadata", tags=["Script Management"])
async def get_script_metadata_endpoint(request: Request):
    data = await request.json()
    script_path = data.get("scriptPath")
    script_type = data.get("type")

    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")

    try:
        absolute_path = resolve_script_path(script_path)
        script_files = []
        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        elif script_type == "multi-file":
            if not os.path.isdir(absolute_path):
                raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files.append({"file_name": os.path.basename(file_path), "content": source_code})
        
        if not script_files:
            raise HTTPException(status_code=404, detail="No script files found.")

        response = get_script_metadata(script_files)
        return JSONResponse(content=response)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Error: {e.details()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/get-script-parameters", tags=["Script Management"])
async def get_script_parameters_endpoint(request: Request):
    data = await request.json()
    script_path = data.get("scriptPath")
    script_type = data.get("type")

    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")

    try:
        absolute_path = resolve_script_path(script_path)
        script_files = []
        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        elif script_type == "multi-file":
            if not os.path.isdir(absolute_path):
                raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files.append({"file_name": os.path.basename(file_path), "content": source_code})
        
        if not script_files:
            raise HTTPException(status_code=404, detail="No script files found.")

        response = get_script_parameters(script_files)
        return JSONResponse(content=response)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Error: {e.details()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/script-content", tags=["Script Management"])
async def get_script_content(scriptPath: str, type: str):
    if not scriptPath or not type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required")
    try:
        absolute_path = resolve_script_path(scriptPath)
        if type == "single-file":
            with open(absolute_path, "r", encoding="utf-8") as f:
                content = f.read()
            return JSONResponse(content={"sourceCode": content})
        elif type == "multi-file":
            if not os.path.isdir(absolute_path):
                raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            script_files = []
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files.append({
                    "file_name": os.path.basename(file_path),
                    "content": source_code
                })
            if not script_files:
                raise HTTPException(status_code=404, detail="No script files found at the specified path.")

            response = get_combined_script(script_files)
            return JSONResponse(content={"sourceCode": response.get("combined_script")})
        else:
            raise HTTPException(status_code=400, detail=f"Invalid script type: {type}")

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Error: {e.details()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/edit-script", tags=["Script Management"])
async def edit_script(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    data = await request.json()
    script_path = data.get("scriptPath")
    script_type = data.get("type")

    if not script_path or not script_type:
        raise HTTPException(status_code=400, detail="scriptPath and type are required.")

    try:
        response = create_and_open_workspace(script_path, script_type)
        if response.get("error_message"):
            raise HTTPException(status_code=500, detail=response.get("error_message") )
        return JSONResponse(content={"message": f"Successfully created workspace at {response.get('workspace_path')}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ProcessContentRequest(BaseModel):
    content: str

@router.post("/api/scripts/process-content", tags=["Script Management"])
async def process_script_content(request: ProcessContentRequest):
    try:
        # The gRPC services expect a list of files, so we simulate a single file.
        script_files = [{"file_name": "published_script.cs", "content": request.content}]

        # Get metadata
        try:
            metadata_response = get_script_metadata(script_files)
            metadata = metadata_response.get("metadata", {})
        except grpc.RpcError as e:
            metadata = {"displayName": "Published Script", "description": f"Error parsing metadata: {e.details()}"}

        # Get parameters
        try:
            parameters_response = get_script_parameters(script_files)
            parameters = parameters_response.get("parameters", [])
        except grpc.RpcError as e:
            parameters = []
            # Optionally, add the error to the metadata
            metadata['parameters_error'] = f"Error parsing parameters: {e.details()}"

        return JSONResponse(content={
            "metadata": metadata,
            "parameters": parameters
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process script content: {str(e)}")

@router.get("/api/scripts/log", tags=["Script Management"])
async def get_script_log(script_path: str):
    """
    Gets the last commit log for a specific script file. Requires authentication.
    """
    if not os.path.isabs(script_path):
        raise HTTPException(status_code=400, detail="An absolute script path is required.")
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Script path not found.")
        
    workspace_path = os.path.dirname(script_path)
    while not os.path.exists(os.path.join(workspace_path, '.git')) and workspace_path != '/':
        workspace_path = os.path.dirname(workspace_path)
        if(len(workspace_path) < 4):
            raise HTTPException(status_code=404, detail="Not a git repository.")

    try:
        log_result = subprocess.run(
            ["git", "log", "-1", "--", os.path.basename(script_path)],
            cwd=workspace_path,
            check=True,
            capture_output=True,
            text=True
        ).stdout.strip()
        return {"log": log_result}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get git log: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
