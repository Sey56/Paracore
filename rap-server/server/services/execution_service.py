import json
import os
import glob
import grpc
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException

import models
from grpc_client import execute_script, pick_object, select_elements, update_element_parameter, batch_update_element_parameters
from utils import get_or_create_script, resolve_script_path

async def run_script_logic(
    path: str,
    parameters: Any,
    source_folder: Optional[str],
    source_team_source: Optional[str],
    thread_id: Optional[str],
    current_user_id: int,
    active_team: int,
    active_role: str,
    db: Session
):
    if not path:
        raise HTTPException(status_code=400, detail="No script path provided")

    script = None
    try:
        resolved_path = resolve_script_path(path)
        script = get_or_create_script(db, resolved_path, current_user_id)

        script_files_payload = []
        
        # 1. Handle .ptool / .wtool (Binary tools)
        if path.endswith('.ptool') or path.endswith('.wtool'):
            import base64
            with open(resolved_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            
            metadata = package.get("metadata", {})
            script_name = metadata.get("name") or os.path.basename(path)
            
            # --- V4 FIX: Preserve Rich Parameters for Units ---
            # Do NOT flatten here. Pass the full list to the C# engine
            # so it can see the [Unit] attributes.
            params_payload = parameters
            if isinstance(parameters, str):
                try: params_payload = json.loads(parameters)
                except: pass

            # Inject script name if missing
            if isinstance(params_payload, list):
                found = False
                for p in params_payload:
                    if p.get("name") == "__script_name__":
                        p["value"] = script_name
                        found = True; break
                if not found: params_payload.append({"name": "__script_name__", "value": script_name})
            
            # Inject license tier for enterprise feature gating
            license_tier = "enterprise" if current_user_id != 0 else "free"
            if isinstance(params_payload, list):
                if not any(p.get("name") == "__license_tier__" for p in params_payload):
                    params_payload.append({"name": "__license_tier__", "value": license_tier})

            parameters_json = json.dumps(params_payload)
            compiled_assembly = base64.b64decode(package.get("assembly", ""))

            response_data = execute_script(None, parameters_json, compiled_assembly)
            return response_data

        # 2. Unified Tool Loading: Always look in Scripts/ subfolder
        scripts_dir = os.path.join(resolved_path, "Scripts")
        if os.path.isdir(scripts_dir):
            for fpath in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fpath).lower() == "globals.cs": continue
                with open(fpath, 'r', encoding='utf-8-sig') as f:
                    script_files_payload.append({"file_name": os.path.basename(fpath), "content": f.read()})
        else:
            # Fallback for non-folder scripts (Legacy/Migration)
            if os.path.isfile(resolved_path):
                with open(resolved_path, 'r', encoding='utf-8-sig') as f:
                    script_files_payload.append({"file_name": os.path.basename(path), "content": f.read()})

        if not script_files_payload:
            raise HTTPException(status_code=404, detail="No script files found in this project.")

        # Parameter Processing
        script_name_for_dashboard = script.name if script else os.path.basename(path)
        
        # --- V4 CORE FIX: Unit Regression ---
        # We now send the FULL rich parameters list (including metadata like Unit)
        # to the C# engine instead of flattening it to a simple dictionary.
        # This allows HardenParameters to work.
        
        rich_params = []
        if parameters is None: rich_params = []
        elif isinstance(parameters, str):
            try: rich_params = json.loads(parameters)
            except: rich_params = []
        elif isinstance(parameters, list):
            rich_params = parameters

        # Ensure essential technical parameters are present in the rich list
        if isinstance(rich_params, list):
            # Inject Script Name
            if not any(p.get("name") == "__script_name__" for p in rich_params):
                rich_params.append({"name": "__script_name__", "value": script_name_for_dashboard})
            
            # Inject Absolute Path
            if not any(p.get("name") == "__absolute_path__" for p in rich_params):
                rich_params.append({"name": "__absolute_path__", "value": resolved_path})

            # Inject license tier for enterprise feature gating
            license_tier = "enterprise" if current_user_id != 0 else "free"
            if not any(p.get("name") == "__license_tier__" for p in rich_params):
                rich_params.append({"name": "__license_tier__", "value": license_tier})

        # Execute with the FULL JSON list
        response_data = execute_script(json.dumps(script_files_payload), json.dumps(rich_params))

        # Log Run
        if script:
            run_status = "success" if response_data.get("is_success") else "failure"
            run_output = response_data.get("output", "")
            if response_data.get("error_message"):
                run_output += f"\nERROR: {response_data.get('error_message')}"
            if response_data.get("error_details"):
                run_output += "\n" + "\n".join(response_data.get("error_details"))

            db.add(models.Run(
                script_id=script.id, user_id=current_user_id, team_id=active_team,
                role=active_role, status=run_status, output=run_output,
                source_folder=source_folder, source_team_source=source_team_source
            ))
            db.commit()

        return response_data

    except Exception as e:
        if script:
            db.add(models.Run(
                script_id=script.id, user_id=current_user_id, team_id=active_team,
                role=active_role, status="failure", output=str(e),
                source_folder=source_folder, source_team_source=source_team_source
            ))
            db.commit()
        if isinstance(e, FileNotFoundError): raise HTTPException(status_code=404, detail=f"Script not found: {path}")
        if isinstance(e, (grpc.RpcError, HTTPException)): raise e
        raise HTTPException(status_code=500, detail=str(e))

async def pick_object_logic(selection_type: str, category_filter: Optional[str]):
    try:
        return pick_object(selection_type, category_filter)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def select_elements_logic(element_ids: List[int]):
    try:
        return select_elements(element_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def update_element_parameter_logic(element_id: int, parameter_name: str, new_value_string: str, unit: Optional[str] = None):
    """
    Service wrapper for updating a single element parameter via gRPC.
    """
    try:
        return update_element_parameter(element_id, parameter_name, new_value_string, unit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def batch_update_element_parameters_logic(updates: list):
    """
    Service wrapper for updating multiple element parameters in a single transaction via gRPC.
    `updates` is a list of dicts.
    """
    try:
        return batch_update_element_parameters(updates)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def execute_repl_logic(code: str, session_id: str, license_tier: str = "free"):
    """
    Service wrapper for executing a REPL command in Revit via gRPC.
    """
    try:
        from grpc_client import execute_repl
        return execute_repl(code, session_id, license_tier)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
