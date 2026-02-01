import glob
import json
import os

import grpc
from auth import CurrentUser, get_current_user
from database_config import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from grpc_client import execute_script, pick_object, select_elements
from sqlalchemy.orm import Session

import models
from utils import get_or_create_script, resolve_script_path

# Agent graph import removed for Operation Simple


router = APIRouter()

from typing import Optional  # Import Optional

from pydantic import BaseModel


class PickObjectRequest(BaseModel):
    selection_type: str
    category_filter: Optional[str] = None

@router.post("/api/pick-object", tags=["Script Execution"])
async def pick_object_endpoint(request: PickObjectRequest):
    """
    Triggers a PickObject operation in Revit.
    """
    try:
        response = pick_object(request.selection_type, request.category_filter)
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/run-script", tags=["Script Execution"])
async def run_script(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
):
    data = await request.json()
    path = data.get("path")
    parameters = data.get("parameters")
    script_type = data.get("type")
    source_folder = data.get("source_folder")
    source_workspace = data.get("source_workspace")
    thread_id = data.get("thread_id") # Get thread_id from request

    if not path:
        raise HTTPException(status_code=400, detail="No script path provided")

    db: Session = next(get_db())
    script = None
    resolved_script_path = None

    try:
        resolved_script_path = resolve_script_path(path)
        script = get_or_create_script(db, resolved_script_path, current_user.id)

        script_files_payload = []
        absolute_path = resolved_script_path

        if path.endswith('.ptool'):
            import base64
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            
            # IMPORTANT: For .ptool, we preserve the full parameter list with metadata 
            # so the engine can perform unit conversions and hardening.
            # The frontend already sends the full list of ScriptParameter objects.
            parameters_json = parameters if isinstance(parameters, str) else json.dumps(parameters)
            compiled_assembly = base64.b64decode(package.get("assembly", ""))
            
            # Execute binary tool
            response_data = execute_script(
                script_content=None, 
                parameters_json=parameters_json,
                compiled_assembly=compiled_assembly
            )
            
            # Fail-safe: if success, ensure we return result early
            return JSONResponse(content=response_data)

        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            # C# ScriptFile uses snake_case JSON property names: file_name, content
            script_files_payload.append({"file_name": os.path.basename(path), "content": source_code})
        elif script_type == "multi-file":
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files_payload.append({"file_name": os.path.basename(file_path), "content": source_code})

        if not script_files_payload:
            raise HTTPException(status_code=404, detail="No script files found.")

        # --- WORKING SET INJECTION LOGIC ---
        # Check if any file actually needs injection before doing expensive state lookups and validation
        placeholder_line = "List<ElementId>? targetWallIds = null; // __INJECT_WORKING_SET__"
        needs_injection = any(placeholder_line in sf["content"] for sf in script_files_payload)

        if thread_id and needs_injection:
            # Working set injection disabled for Operation Simple
            # This will be replaced with a UI-driven property injection in the future
            pass
        # --- END INJECTION LOGIC ---

        # Inject __script_name__ for Dashboard reporting
        # Default to basename of source path if script object isn't found (e.g. external path)
        script_name_for_dashboard = os.path.basename(path) if path else "External Script"

        if script:
            script_name_for_dashboard = script.name

        # Helper to parse JSON array strings that frontend sends for multi-select
        def parse_value(val):
            if isinstance(val, str) and val.startswith('[') and val.endswith(']'):
                try:
                    return json.loads(val)
                except json.JSONDecodeError:
                    pass
            return val

        if parameters is None:
            # CodeRunner expects a flat dict for source scripts
            parameters = {}
        elif isinstance(parameters, str):
            try:
                # Parse the JSON string from frontend
                param_list = json.loads(parameters)
                
                # Flatten parameters: { "name": value } for CodeRunner's MapParameters
                # Frontend sends camelCase (name, value)
                # Filter out any params with None or empty name
                # IMPORTANT: parse_value handles JSON array strings from multi-select
                parameters = {p["name"]: parse_value(p.get("value")) for p in param_list if p.get("name")}
            except (json.JSONDecodeError, TypeError, KeyError) as e:
                print(f"Warning: Failed to parse parameters JSON: {parameters}, error: {e}")
                parameters = {}
        elif isinstance(parameters, list):
            # Already a list, flatten it
            # Filter out any params with None or empty name
            parameters = {
                p.get("name", p.get("Name")): parse_value(p.get("value", p.get("Value"))) 
                for p in parameters 
                if p.get("name") or p.get("Name")
            }

        # Inject __script_name__ for dashboard reporting
        # At this point, parameters should be a dict
        if isinstance(parameters, dict):
            parameters["__script_name__"] = script_name_for_dashboard

        parameters_json = json.dumps(parameters)
        script_content_json = json.dumps(script_files_payload)

        # Single call to the gRPC service
        response_data = execute_script(script_content_json, parameters_json)

        # Log the script run to the database (skip for generated code)
        if script is not None:
            run_status = "success" if response_data.get("is_success") else "failure"

            # Combine output and error for the log
            run_output = response_data.get("output", "")
            error_message = response_data.get("error_message")
            if error_message:
                run_output += f"\nERROR: {error_message}"
            error_details = response_data.get("error_details")
            if error_details:
                run_output += "\n" + "\n".join(error_details)

            script_run = models.Run(
                script_id=script.id,
                user_id=current_user.id,
                team_id=current_user.activeTeam,
                role=current_user.activeRole,
                status=run_status,
                output=run_output,
                source_folder=source_folder,
                source_workspace=source_workspace
            )
            db.add(script_run)
            db.commit()

        # The data from execute_script is already a JSON-serializable dictionary
        return JSONResponse(content=response_data)

    except Exception as e:
        # Log failure to the database (skip for generated code)
        if script is not None:
            script_run = models.Run(
                script_id=script.id,
                user_id=current_user.id,
                team_id=current_user.activeTeam,
                role=current_user.activeRole,
                status="failure",
                output=str(e),
                source_folder=source_folder,
                source_workspace=source_workspace
            )
            db.add(script_run)
            db.commit()

        if isinstance(e, FileNotFoundError):
             raise HTTPException(status_code=404, detail=f"Script file not found at source path: {path}")
        elif isinstance(e, (grpc.RpcError, HTTPException)):
            raise
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/api/select-elements", tags=["Script Execution"])
async def select_elements_endpoint(request: Request):
    """
    Sets the selection in the active Revit document.
    """
    try:
        data = await request.json()
        element_ids = data.get("element_ids")
        if not isinstance(element_ids, list):
            raise HTTPException(status_code=400, detail="element_ids must be a list of integers.")

        # Ensure all IDs are integers
        element_ids = [int(eid) for eid in element_ids]

        response = select_elements(element_ids)
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
