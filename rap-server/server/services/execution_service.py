import json
import os
import glob
import grpc
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException

import models
from grpc_client import execute_script, pick_object, select_elements
from utils import get_or_create_script, resolve_script_path

async def run_script_logic(
    path: str,
    parameters: Any,
    script_type: str,
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
        
        # Handle .ptool (Binary tools)
        if path.endswith('.ptool'):
            import base64
            with open(resolved_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            
            metadata = package.get("metadata", {})
            script_name = metadata.get("name") or os.path.basename(path)
            
            params_to_send = parameters
            if isinstance(parameters, str):
                try: params_to_send = json.loads(parameters)
                except: pass

            if isinstance(params_to_send, list):
                found = False
                for p in params_to_send:
                    if p.get("name") == "__script_name__":
                        p["value"] = script_name
                        found = True; break
                if not found: params_to_send.append({"name": "__script_name__", "value": script_name})
            elif isinstance(params_to_send, dict):
                params_to_send["__script_name__"] = script_name
            
            parameters_json = json.dumps(params_to_send)
            compiled_assembly = base64.b64decode(package.get("assembly", ""))
            
            response_data = execute_script(None, parameters_json, compiled_assembly)
            return response_data

        # Handle source scripts
        if script_type == "folder-project":
            scripts_dir = os.path.join(resolved_path, "Scripts")
            if not os.path.isdir(scripts_dir):
                raise HTTPException(status_code=404, detail=f"Scripts folder missing in project: {resolved_path}")
                
            for fpath in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fpath).lower() == "globals.cs": continue
                with open(fpath, 'r', encoding='utf-8-sig') as f:
                    script_files_payload.append({"file_name": os.path.basename(fpath), "content": f.read()})
        elif script_type == "single-file":
            # Legacy/Migration support for single files if needed
            with open(resolved_path, 'r', encoding='utf-8-sig') as f:
                script_files_payload.append({"file_name": os.path.basename(path), "content": f.read()})
        elif script_type == "multi-file":
            # Legacy multi-file support (no Scripts/ folder)
            for fpath in glob.glob(os.path.join(resolved_path, "*.cs")):
                with open(fpath, 'r', encoding='utf-8-sig') as f:
                    script_files_payload.append({"file_name": os.path.basename(fpath), "content": f.read()})

        if not script_files_payload:
            raise HTTPException(status_code=404, detail="No script files found.")

        # Parameter Processing
        def parse_value(val):
            if isinstance(val, str) and val.startswith('[') and val.endswith(']'):
                try: return json.loads(val)
                except: pass
            return val

        script_name_for_dashboard = script.name if script else os.path.basename(path)
        
        if parameters is None: parameters = {}
        elif isinstance(parameters, str):
            try:
                param_list = json.loads(parameters)
                parameters = {p["name"]: parse_value(p.get("value")) for p in param_list if p.get("name")}
            except: parameters = {}
        elif isinstance(parameters, list):
            parameters = {p.get("name", p.get("Name")): parse_value(p.get("value", p.get("Value"))) for p in parameters if p.get("name") or p.get("Name")}

        if isinstance(parameters, dict):
            parameters["__script_name__"] = script_name_for_dashboard

        # Execute
        response_data = execute_script(json.dumps(script_files_payload), json.dumps(parameters))

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
