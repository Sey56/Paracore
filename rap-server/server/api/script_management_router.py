import os
import json
import glob
import grpc
import shutil
import subprocess
import logging
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Literal, Dict, Optional
from sqlalchemy.orm import Session

import models, schemas
from database_config import get_db
import asyncio
from grpc_client import (
    get_script_metadata,
    get_script_parameters,
    get_combined_script,
    create_and_open_workspace,
    compute_parameter_options,
    rename_script
)
from utils import get_or_create_script, resolve_script_path
from auth import get_current_user, CurrentUser
from workspace_manager import get_active_workspace, set_active_workspace

router = APIRouter()

# --- Template for new single-file scripts ---
CSHARP_TEMPLATE = """using Autodesk.Revit.DB;

/*
** SINGLE-FILE SCRIPT **
This is a standalone script. All code, helpers, and the Params class must be in THIS file.

DocumentType: Project
Categories: Multi-Category
Author: Paracore User
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Single-file template script.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Show.

UsageExamples:
- "Run script"
*/

// [ScriptParameter]
string targetName = "Paracore";

// Use Println with string interpolation ($"...") for clear output
Println($"Hello {targetName} from {Doc.Title}!");

// Example: Using Show to display data in a table
// Show("table", new { Name = targetName, Time = DateTime.Now });
"""

# --- Template for Main.cs in multi-file scripts ---
MULTI_FILE_MAIN_TEMPLATE = """using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

/*
** MULTI-FILE SCRIPT (Entry Point) **
This is a modular script. You can put all code here OR modularize by creating
other .cs files in this folder (e.g., Utils.cs, Params.cs) and referencing them here.

DocumentType: Project
Categories: Multi-Category
Author: Paracore User
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Modular script template. Add your logic here or organize helpers in separate files.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Show.

UsageExamples:
- "Run script"
*/

// Example: Instantiate parameters from Params.cs (if created)
// var p = new Params();

Println($"Hello from Main.cs in {Doc.Title}!");

// Your modular logic goes here...
"""

# --- Pydantic Models for New Script Creation ---
class NewScriptRequest(BaseModel):
    parent_folder: str = Field(..., description="The absolute path of the folder where the script or folder will be created.")
    script_type: Literal['single', 'multi'] = Field(..., description="The type of script to create.")
    script_name: str = Field(..., description="The name of the .cs file to create.")
    folder_name: str | None = Field(None, description="The name of the folder for multi-script projects.")

class ComputeOptionsRequest(BaseModel):
    scriptPath: str
    type: str
    parameterName: str

class RenameRequest(BaseModel):
    oldPath: str
    newName: str

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
            return {"message": f"Successfully created script: {script_name}", "script_path": new_script_path}
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
                f.write(MULTI_FILE_MAIN_TEMPLATE)
            # For multi-script, the ID/path represented in the gallery is typically the folder path
            return {"message": f"Successfully created multi-script project: {request.folder_name}/{script_name}", "script_path": new_folder_path}
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

                    # Calculate robust date_modified for folders (latest mtime of any .cs file)
                    folder_stat = os.stat(resolved_item_path)
                    date_created = datetime.fromtimestamp(folder_stat.st_ctime).isoformat()
                    
                    latest_mtime = folder_stat.st_mtime
                    for fp in glob.glob(os.path.join(item_path, "*.cs")):
                        latest_mtime = max(latest_mtime, os.path.getmtime(fp))
                    
                    date_modified = datetime.fromtimestamp(latest_mtime).isoformat()

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

        if not script_files:
            raise HTTPException(status_code=404, detail="No script files found.")

        # Handle empty script content gracefully
        has_content = any(f["content"].strip() for f in script_files)
        if not has_content:
             # Basic default metadata for empty file
             metadata = {
                 "displayName": os.path.basename(absolute_path),
                 "description": "",
                 "dependencies": [],
                 "parameters": [] 
             }
             response = {"metadata": metadata}
        else:
            response = get_script_metadata(script_files)
        
        # ADDED: Include file stats for refresh detection
        file_stat = os.stat(absolute_path)
        date_created = datetime.fromtimestamp(file_stat.st_ctime).isoformat()
        
        latest_mtime = file_stat.st_mtime
        if script_type == "multi-file":
            for fp in glob.glob(os.path.join(absolute_path, "*.cs")):
                latest_mtime = max(latest_mtime, os.path.getmtime(fp))
                
        date_modified = datetime.fromtimestamp(latest_mtime).isoformat()
        
        if "metadata" in response:
            response["metadata"]["dateCreated"] = date_created
            response["metadata"]["dateModified"] = date_modified
            
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

        if not script_files:
            raise HTTPException(status_code=404, detail="No script files found.")

        # Handle empty script content gracefully
        has_content = any(f["content"].strip() for f in script_files)
        if not has_content:
            response = {"parameters": []}
        else:
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
        
        # Retry logic for file locking issues on Windows
        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                if type == "single-file":
                    with open(absolute_path, "r", encoding="utf-8-sig") as f:
                        content = f.read()
                    return JSONResponse(content={"sourceCode": content})
                elif type == "multi-file":
                    if not os.path.isdir(absolute_path):
                        raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
                    
                    script_files = []
                    cs_files = glob.glob(os.path.join(absolute_path, "*.cs"))
                    
                    if not cs_files:
                         # Retry if directory exists but looks empty (race condition?)
                         if attempt < max_retries - 1:
                             await asyncio.sleep(0.2)
                             continue
                         # If truly empty, return empty
                         raise HTTPException(status_code=404, detail="No .cs files found at path.")

                    for file_path in cs_files:
                        with open(file_path, 'r', encoding='utf-8-sig') as f:
                            source_code = f.read()
                        script_files.append({
                            "file_name": os.path.basename(file_path),
                            "content": source_code
                        })
                    
                    response = get_combined_script(script_files)
                    return JSONResponse(content={"sourceCode": response.get("combined_script")})
                else:
                    raise HTTPException(status_code=400, detail=f"Invalid script type: {type}")
            
            except (OSError, UnicodeDecodeError) as e:
                last_error = e
                if attempt < max_retries - 1:
                    print(f"[ScriptManagement] File access failed (attempt {attempt+1}): {e}. Retrying...")
                    await asyncio.sleep(0.2)
                else:
                    print(f"[ScriptManagement] File access failed permanently: {e}")
                    raise HTTPException(status_code=500, detail=f"File access error: {str(e)}")
            except Exception as e:
                # Non-retryable errors
                traceback.print_exc()
                raise e

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Error: {e.details()}")
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
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
        
        workspace_path = response.get('workspace_path')
        
        # FORCE SYNC: Manually copy the script to the workspace to ensure it's updated
        # The C# service might not refresh the file if the workspace already exists
        # Add delay to avoid race condition with C# process creating/locking the file
        await asyncio.sleep(0.5)
        
        if workspace_path and os.path.isdir(workspace_path):
            try:
                if script_type == 'single-file':
                    script_filename = os.path.basename(script_path)
                    dest_path = os.path.join(workspace_path, 'Scripts', script_filename)
                    
                    # Only copy if source exists (it should)
                    if os.path.exists(script_path):
                        # Ensure Scripts folder exists
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        
                        # Read content from source
                        with open(script_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            
                        # Verify content isn't empty/garbage
                        if not content:
                            print(f"[EditScript] Warning: Source script is empty: {script_path}")
                        else:
                            # ROBUST WRITE: Retry loop with flush/fsync
                            # Windows locking can prevent atomic replace, so we use direct write with retries
                            success = False
                            for attempt in range(3):
                                try:
                                    # 1. Try to remove file first (clears some locks)
                                    if os.path.exists(dest_path):
                                        try:
                                            os.remove(dest_path)
                                        except OSError:
                                            pass # File might be locked/open, proceed to write
                                    
                                    # 2. Write with direct flush and sync
                                    with open(dest_path, 'w', encoding='utf-8') as f:
                                        f.write(content)
                                        f.flush()
                                        os.fsync(f.fileno()) # Force write to disk
                                    
                                    print(f"[EditScript] Write successful on attempt {attempt+1}: {dest_path}")
                                    success = True
                                    break
                                except Exception as e:
                                    print(f"[EditScript] Write attempt {attempt+1} failed: {e}")
                                    await asyncio.sleep(0.2)
                            
                            if not success:
                                print(f"[EditScript] Error: Failed to update script after 3 attempts")
                            
            except Exception as sync_error:
                print(f"[EditScript] Warning: Failed to force-sync script: {sync_error}")
                # Don't fail the request, VSCode might still open
        
        # Store the workspace path for redirected AI fixes
        set_active_workspace(script_path, workspace_path)
        print(f"[EditScript] Tracked active workspace for: {script_path}")
                
        return JSONResponse(content={
            "message": f"Successfully created workspace at {workspace_path}",
            "workspace_path": workspace_path
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveScriptRequest(BaseModel):
    script_path: str
    type: str
    content: Optional[str] = None
    filename: Optional[str] = None
    files: Optional[Dict[str, str]] = None  # New: Support for multi-file saving

@router.post("/api/save-script", tags=["Script Management"])
async def save_script(request: SaveScriptRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Overwrites existing script file(s) with new content.
    Prioritizes saving to an active temporary workspace if one exists.
    Supports both single-file content and multi-file dictionaries.
    """
    if not os.path.isabs(request.script_path):
        raise HTTPException(status_code=400, detail="An absolute script path is required.")

    if not request.content and not request.files:
        raise HTTPException(status_code=400, detail="Either 'content' or 'files' must be provided.")

    try:
        # Check if there is an active workspace for this script
        workspace_path = get_active_workspace(request.script_path)
        is_workspace_save = False
        target_dir = ""

        # Determine base target directory
        if workspace_path and os.path.isdir(workspace_path):
            # REDIRECT: Save to the workspace instead of the original source.
            is_workspace_save = True
            target_dir = os.path.join(workspace_path, "Scripts")
            print(f"[ScriptManagement] Redirecting save to active workspace: {target_dir}")
        else:
            # FALLBACK: Save directly to the original source path
            if request.type == "multi-file":
                target_dir = resolve_script_path(request.script_path)
                if not os.path.isdir(target_dir):
                     raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            else:
                # For single-file script source, the directory is the parent of the script file
                target_dir = os.path.dirname(resolve_script_path(request.script_path))

        saved_paths = []

        # Handler for Multiple Files
        if request.files:
            for fname, fcontent in request.files.items():
                target_file = os.path.join(target_dir, fname)
                
                # Security/Sanity Check: Ensure we don't write outside target_dir using ..
                if not os.path.abspath(target_file).startswith(os.path.abspath(target_dir)):
                    print(f"[ScriptManagement] Security Warning: Skipped unsafe path {target_file}")
                    continue

                os.makedirs(os.path.dirname(target_file), exist_ok=True)
                with open(target_file, 'w', encoding='utf-8') as f:
                    f.write(fcontent)
                saved_paths.append(target_file)

        # Handler for Single Content (Backward Compatibility & Single-File updates)
        if request.content:
            target_file = None
            
            # If explicit filename provided (e.g. from AI or specific file edit)
            if request.filename:
                target_file = os.path.join(target_dir, request.filename)
            else:
                # Default behavior based on script type
                if is_workspace_save:
                    # In workspace, single-file scripts are named by their original filename inside /Scripts/
                    if request.type == "multi-file":
                        target_file = os.path.join(target_dir, "Main.cs") # Default for multi-file
                    else:
                        target_file = os.path.join(target_dir, os.path.basename(request.script_path))
                else:
                    # Direct source save
                    if request.type == "multi-file":
                        target_file = os.path.join(target_dir, "Main.cs")
                    else:
                        target_file = resolve_script_path(request.script_path)

            if target_file:
                os.makedirs(os.path.dirname(target_file), exist_ok=True)
                with open(target_file, 'w', encoding='utf-8') as f:
                    f.write(request.content)
                saved_paths.append(target_file)

        location_type = "Workspace (Synced)" if is_workspace_save else "Original Source"
        print(f"[ScriptManagement] Successfully saved {len(saved_paths)} files to {location_type}")
        
        return {
            "success": True, 
            "message": f"Saved {len(saved_paths)} file(s) successfully to {location_type}",
            "is_workspace_save": is_workspace_save,
            "paths": saved_paths
        }
        
    except Exception as e:
        print(f"[ScriptManagement] Save script error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save script: {str(e)}")

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
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        ).stdout.strip()
        return {"log": log_result}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get git log: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/compute-parameter-options", tags=["Script Management"])
async def compute_parameter_options_endpoint(request: ComputeOptionsRequest):
    try:
        absolute_path = resolve_script_path(request.scriptPath)
        
        # We need the full script content to extract the options function
        source_code = ""
        if request.type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
        elif request.type == "multi-file":
            if not os.path.isdir(absolute_path):
                raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            
            # For multi-file, we combine the scripts first
            files = []
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    files.append({"file_name": os.path.basename(file_path), "content": f.read()})
            
            combined_response = get_combined_script(files)
            source_code = combined_response.get("combined_script", "")
        else:
            raise HTTPException(status_code=400, detail=f"Invalid script type: {request.type}")

        if not source_code:
            raise HTTPException(status_code=404, detail="Script content not found.")

        response = compute_parameter_options(source_code, request.parameterName)
        return JSONResponse(content=response)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Error: {e.details()}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/api/rename-script", tags=["Script Management"])
async def rename_script_endpoint(request: RenameRequest, current_user: CurrentUser = Depends(get_current_user)):
    """
    Renames a script file via gRPC and cleans up workspace state.
    """
    if not os.path.isabs(request.oldPath):
        raise HTTPException(status_code=400, detail="An absolute script path is required.")
    
    try:
        response = rename_script(request.oldPath, request.newName)
        if not response.get("is_success"):
            raise HTTPException(status_code=400, detail=response.get("error_message"))
        
        return JSONResponse(content={
            "success": True,
            "message": f"Successfully renamed script to {request.newName}",
            "newPath": response.get("new_path")
        })
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
