import asyncio
import glob
import os
import json
import traceback
from datetime import datetime
from typing import Dict, List, Optional, Any

import grpc
from fastapi import HTTPException
from grpc_client import (
    get_script_metadata,
    get_script_parameters,
    get_combined_script,
    create_and_open_workspace,
)
from workspace_manager import get_active_workspace, set_active_workspace
from utils import resolve_script_path, format_grpc_error
from api.script_templates import ARCHETYPES, MULTI_FILE_MAIN_TEMPLATE

async def get_all_scripts(folder_path: str) -> List[Dict[str, Any]]:
    if not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Can't find the script source. Make sure you have not deleted or renamed it.")

    scripts = []
    try:
        # Process single .cs files
        for file_path in glob.glob(os.path.join(folder_path, "*.cs")):
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
                    except Exception:
                        continue

                script_files = [{"file_name": os.path.basename(resolved_file_path), "content": content}]
                metadata = {}
                try:
                    metadata = get_script_metadata(script_files).get("metadata", {})
                except grpc.RpcError as e:
                    metadata = {"displayName": os.path.splitext(os.path.basename(resolved_file_path))[0], "description": format_grpc_error(e)}

                file_stat = os.stat(resolved_file_path)
                scripts.append({
                    "id": resolved_file_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_file_path),
                    "type": "single-file",
                    "absolutePath": resolved_file_path.replace('\\', '/'),
                    "sourcePath": resolved_file_path.replace('\\', '/'),
                    "metadata": {
                        **metadata,
                        "dateCreated": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                        "dateModified": datetime.fromtimestamp(file_stat.st_mtime).isoformat()
                    }
                })
            except Exception:
                continue

        # Process folders (multi-file)
        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if os.path.isdir(item_path) and glob.glob(os.path.join(item_path, "*.cs")):
                try:
                    resolved_item_path = resolve_script_path(item_path)
                    script_files = []
                    for fp in glob.glob(os.path.join(item_path, "*.cs")):
                        try:
                            with open(fp, 'r', encoding='utf-8-sig') as f:
                                script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
                        except:
                            continue

                    if not script_files: continue

                    metadata = {}
                    try:
                        metadata = get_script_metadata(script_files).get("metadata", {})
                    except grpc.RpcError as e:
                        metadata = {"displayName": os.path.basename(resolved_item_path), "description": format_grpc_error(e)}

                    folder_stat = os.stat(resolved_item_path)
                    latest_mtime = folder_stat.st_mtime
                    for fp in glob.glob(os.path.join(item_path, "*.cs")):
                        latest_mtime = max(latest_mtime, os.path.getmtime(fp))

                    scripts.append({
                        "id": resolved_item_path.replace('\\', '/'),
                        "name": os.path.basename(resolved_item_path),
                        "type": "multi-file",
                        "absolutePath": resolved_item_path.replace('\\', '/'),
                        "sourcePath": resolved_item_path.replace('\\', '/'),
                        "metadata": {
                            **metadata,
                            "dateCreated": datetime.fromtimestamp(folder_stat.st_ctime).isoformat(),
                            "dateModified": datetime.fromtimestamp(latest_mtime).isoformat()
                        }
                    })
                except Exception:
                    continue

        # Process .ptool files
        for ptool_path in glob.glob(os.path.join(folder_path, "*.ptool")):
            try:
                resolved_ptool_path = resolve_script_path(ptool_path)
                with open(resolved_ptool_path, 'r', encoding='utf-8') as f:
                    package = json.load(f)
                
                metadata = package.get("metadata", {})
                metadata["is_protected"] = True
                metadata["is_compiled"] = True
                ptool_stat = os.stat(resolved_ptool_path)
                
                scripts.append({
                    "id": resolved_ptool_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_ptool_path),
                    "type": "single-file",
                    "absolutePath": resolved_ptool_path.replace('\\', '/'),
                    "sourcePath": resolved_ptool_path.replace('\\', '/'),
                    "parameters": package.get("parameters", []),
                    "metadata": {
                        **metadata,
                        "dateCreated": datetime.fromtimestamp(ptool_stat.st_ctime).isoformat(),
                        "dateModified": datetime.fromtimestamp(ptool_stat.st_mtime).isoformat()
                    }
                })
            except Exception:
                continue

        return scripts
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get scripts: {str(e)}")

def create_new_script_logic(parent_folder: str, script_type: str, script_name: str, folder_name: Optional[str], template_id: str = "blank"):
    if script_type == 'single':
        s_name = script_name if script_name.endswith('.cs') else f"{script_name}.cs"
        new_path = os.path.join(parent_folder, s_name)
        if os.path.exists(new_path):
            raise HTTPException(status_code=409, detail=f"Script '{s_name}' already exists.")

        try:
            template_code = ARCHETYPES.get(template_id, ARCHETYPES["blank"])
            with open(new_path, 'w', encoding='utf-8') as f:
                f.write(template_code)
            return {"message": f"Successfully created script: {s_name}", "script_path": new_path}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create script: {e}")

    elif script_type == 'multi':
        if not folder_name:
            raise HTTPException(status_code=400, detail="Folder name is required for multi-script.")
        
        new_folder = os.path.join(parent_folder, folder_name)
        if os.path.exists(new_folder):
            raise HTTPException(status_code=409, detail=f"Folder '{folder_name}' already exists.")

        s_name = script_name if script_name.endswith('.cs') else f"{script_name}.cs"
        new_path = os.path.join(new_folder, s_name)

        try:
            os.makedirs(new_folder)
            with open(new_path, 'w', encoding='utf-8') as f:
                f.write(MULTI_FILE_MAIN_TEMPLATE)
            return {"message": f"Successfully created multi-script: {folder_name}/{s_name}", "script_path": new_folder}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create multi-script: {e}")

async def save_script_logic(script_path: str, script_type: str, content: Optional[str], filename: Optional[str], files: Optional[Dict[str, str]]):
    try:
        absolute_path = resolve_script_path(script_path)
        if absolute_path.endswith('.ptool'):
             raise HTTPException(status_code=403, detail="Protected Tool: Source code cannot be overwritten.")

        normalized_script_path = os.path.normpath(script_path).replace('\\', '/')
        workspace_path = get_active_workspace(normalized_script_path)
        is_workspace_save = False
        target_dir = ""

        if workspace_path and os.path.isdir(workspace_path):
            is_workspace_save = True
            target_dir = os.path.join(workspace_path, "Scripts")
        else:
            if script_type == "multi-file":
                target_dir = resolve_script_path(script_path)
                if not os.path.isdir(target_dir):
                     raise HTTPException(status_code=400, detail="Path for multi-file script must be a directory.")
            else:
                target_dir = os.path.dirname(resolve_script_path(script_path))

        saved_paths = []

        if files:
            for fname, fcontent in files.items():
                target_file = os.path.join(target_dir, fname)
                if not os.path.abspath(target_file).startswith(os.path.abspath(target_dir)):
                    continue
                os.makedirs(os.path.dirname(target_file), exist_ok=True)
                with open(target_file, 'w', encoding='utf-8') as f:
                    f.write(fcontent)
                saved_paths.append(target_file)

        if content:
            target_file = None
            if filename:
                target_file = os.path.join(target_dir, filename)
            else:
                if is_workspace_save:
                    if script_type == "multi-file":
                        target_file = os.path.join(target_dir, "Main.cs")
                    else:
                        target_file = os.path.join(target_dir, os.path.basename(script_path))
                else:
                    if script_type == "multi-file":
                        target_file = os.path.join(target_dir, "Main.cs")
                    else:
                        target_file = resolve_script_path(script_path)

            if target_file:
                os.makedirs(os.path.dirname(target_file), exist_ok=True)
                with open(target_file, 'w', encoding='utf-8') as f:
                    f.write(content)
                saved_paths.append(target_file)

        return {
            "success": True,
            "message": f"Saved {len(saved_paths)} file(s) successfully.",
            "is_workspace_save": is_workspace_save,
            "paths": saved_paths
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Failed to save script: {str(e)}")

async def get_script_metadata_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        script_files = []
        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        elif script_type == "multi-file":
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(file_path), "content": f.read()})

        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            metadata = package.get("metadata", {})
            metadata["is_protected"] = True
            metadata["is_compiled"] = True
            response = {"metadata": metadata, "parameters": package.get("parameters", [])}
        elif not any(f["content"].strip() for f in script_files):
             metadata = {"displayName": os.path.basename(absolute_path), "description": "", "dependencies": [], "parameters": []}
             response = {"metadata": metadata}
        else:
            response = get_script_metadata(script_files)

        file_stat = os.stat(absolute_path)
        latest_mtime = file_stat.st_mtime
        if script_type == "multi-file":
            for fp in glob.glob(os.path.join(absolute_path, "*.cs")):
                latest_mtime = max(latest_mtime, os.path.getmtime(fp))

        if "metadata" in response:
            response["metadata"]["dateCreated"] = datetime.fromtimestamp(file_stat.st_ctime).isoformat()
            response["metadata"]["dateModified"] = datetime.fromtimestamp(latest_mtime).isoformat()

        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_parameters_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        script_files = []
        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        elif script_type == "multi-file":
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(file_path), "content": f.read()})

        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            return {"parameters": package.get("parameters", [])}
        elif not any(f["content"].strip() for f in script_files):
            return {"parameters": []}
        else:
            return get_script_parameters(script_files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_content_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        if absolute_path.endswith('.ptool'):
            return {"sourceCode": "// This is a protected Paracore tool."}

        if script_type == "single-file":
            with open(absolute_path, "r", encoding="utf-8-sig") as f:
                return {"sourceCode": f.read()}
        elif script_type == "multi-file":
            script_files = []
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(file_path), "content": f.read()})
            response = get_combined_script(script_files)
            return {"sourceCode": response.get("combined_script")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def edit_script_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        if absolute_path.endswith('.ptool'):
             raise HTTPException(status_code=403, detail="Protected Tool: Source code cannot be edited.")

        response = create_and_open_workspace(script_path, script_type)
        if response.get("error_message"):
            raise HTTPException(status_code=500, detail=response.get("error_message") )

        workspace_path = response.get('workspace_path')
        await asyncio.sleep(0.5)

        if workspace_path and os.path.isdir(workspace_path) and script_type == 'single-file':
            dest_path = os.path.join(workspace_path, 'Scripts', os.path.basename(script_path))
            if os.path.exists(script_path):
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(script_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                if content:
                    for _ in range(3):
                        try:
                            with open(dest_path, 'w', encoding='utf-8') as f:
                                f.write(content)
                                f.flush()
                                os.fsync(f.fileno())
                            break
                        except: await asyncio.sleep(0.2)

        set_active_workspace(script_path, workspace_path)
        return {"message": f"Successfully created workspace.", "workspace_path": workspace_path}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
