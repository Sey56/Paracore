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
    get_bulk_metadata 
)
from ide_manager import set_active_ide_session
from utils import resolve_script_path, format_grpc_error
from api.script_templates import ARCHETYPES, MULTI_FILE_MAIN_TEMPLATE

async def get_all_scripts(folder_path: str) -> List[Dict[str, Any]]:
    """V3 Refined: Fetches metadata for all projects in a folder in a single gRPC call."""
    if not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Can't find the script source.")

    scripts = []
    projects_to_fetch = []

    try:
        # 1. Discover all project folders
        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if not os.path.isdir(item_path) or item.startswith('.'):
                continue
            
            scripts_dir = os.path.join(item_path, "Scripts")
            if not os.path.isdir(scripts_dir):
                continue

            script_files = []
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                try:
                    with open(fp, 'r', encoding='utf-8-sig') as f:
                        script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
                except: continue

            if script_files:
                print(f"DEBUG: Found project folder for metadata: {item}")
                projects_to_fetch.append({
                    "project_name": item,
                    "absolute_path": item_path.replace('\\', '/'),
                    "files": script_files
                })

        # 2. Fetch Bulk Metadata (Single Call)
        bulk_results = []
        if projects_to_fetch:
            print(f"DEBUG: Calling get_bulk_metadata for {len(projects_to_fetch)} projects")
            bulk_results = get_bulk_metadata(projects_to_fetch)
            print(f"DEBUG: Received metadata for {len(bulk_results)} projects")

        # 3. Transform into UI Script Objects
        for res in bulk_results:
            project_path = res["absolute_path"]
            folder_stat = os.stat(project_path)
            
            scripts.append({
                "id": project_path,
                "name": res["project_name"],
                "type": "folder-project",
                "absolutePath": project_path,
                "sourcePath": project_path,
                "metadata": {
                    **res["metadata"],
                    "dateCreated": datetime.fromtimestamp(folder_stat.st_ctime).isoformat(),
                    "dateModified": datetime.fromtimestamp(folder_stat.st_mtime).isoformat()
                },
                "parameters": res["parameters"]
            })

        # 4. Add .ptool files
        for ptool_path in glob.glob(os.path.join(folder_path, "*.ptool")):
            try:
                resolved_ptool_path = resolve_script_path(ptool_path)
                with open(resolved_ptool_path, 'r', encoding='utf-8') as f:
                    package = json.load(f)
                
                metadata = package.get("metadata", {})
                metadata["is_protected"] = True
                metadata["is_compiled"] = True
                ptool_stat = os.stat(resolved_ptool_path)
                
                params = package.get("parameters", [])
                print(f"DEBUG: Loaded .ptool {os.path.basename(ptool_path)} with {len(params)} parameters")

                # Hydrate parameters for the frontend (defaultValueJson -> defaultValue)
                hydrated_params = []
                for p in params:
                    val = p.get("defaultValueJson", "null")
                    try:
                        p["defaultValue"] = json.loads(val)
                        p["value"] = p["defaultValue"]
                    except:
                        p["defaultValue"] = val
                        p["value"] = val
                    hydrated_params.append(p)

                scripts.append({
                    "id": resolved_ptool_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_ptool_path),
                    "type": "single-file",
                    "absolutePath": resolved_ptool_path.replace('\\', '/'),
                    "sourcePath": resolved_ptool_path.replace('\\', '/'),
                    "parameters": hydrated_params,
                    "metadata": {
                        **metadata,
                        "dateCreated": datetime.fromtimestamp(ptool_stat.st_ctime).isoformat(),
                        "dateModified": datetime.fromtimestamp(ptool_stat.st_mtime).isoformat()
                    }
                })
            except Exception: continue

        return scripts
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get scripts: {str(e)}")

def create_new_script_logic(parent_folder: str, script_type: str, script_name: str, folder_name: Optional[str] = None, template_id: str = "blank", generated_logic: Optional[str] = None, generated_params: Optional[str] = None, overwrite: bool = False):
    clean_name = script_name.replace('.cs', '')
    project_dir = os.path.join(parent_folder, clean_name)
    scripts_dir = os.path.join(project_dir, "Scripts")
    
    if os.path.exists(project_dir) and not overwrite:
        raise HTTPException(status_code=409, detail=f"Project '{clean_name}' already exists.")

    try:
        os.makedirs(scripts_dir, exist_ok=True)
        template_code = ARCHETYPES.get(template_id, ARCHETYPES["blank"])
        
        if generated_logic:
            template_code = template_code.replace("// 2. Execution Logic", f"// 2. Execution Logic\n{generated_logic}")
        
        # Entry File - Named after project
        with open(os.path.join(scripts_dir, f"{clean_name}.cs"), 'w', encoding='utf-8') as f:
            f.write(template_code)
            
        _write_project_gitignore(project_dir)
        return {"message": f"Successfully created project: {clean_name}", "script_path": project_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create script project: {e}")

async def save_script_logic(script_path: str, script_type: str, content: Optional[str], filename: Optional[str], files: Optional[Dict[str, str]]):
    try:
        project_root = resolve_script_path(script_path)
        scripts_dir = os.path.join(project_root, "Scripts")
        os.makedirs(scripts_dir, exist_ok=True)

        saved_paths = []
        if files:
            for fname, fcontent in files.items():
                target = os.path.join(scripts_dir, fname)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'w', encoding='utf-8') as f: f.write(fcontent)
                saved_paths.append(target)

        if content:
            target = os.path.join(scripts_dir, filename if filename else f"{os.path.basename(project_root)}.cs")
            with open(target, 'w', encoding='utf-8') as f: f.write(content)
            saved_paths.append(target)

        return {"success": True, "message": f"Saved {len(saved_paths)} file(s).", "paths": saved_paths}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {str(e)}")

async def get_script_parameters_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        
        # Handle Protected Tools (.ptool)
        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            params = package.get("parameters", [])
            
            # Hydrate for frontend
            for p in params:
                val = p.get("defaultValueJson", "null")
                try:
                    p["defaultValue"] = json.loads(val)
                    p["value"] = p["defaultValue"]
                except:
                    p["defaultValue"] = val
                    p["value"] = val
            return {"parameters": params}

        # Handle Source Projects
        scripts_dir = os.path.join(absolute_path, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})

        if not script_files: return {"parameters": []}
        return get_script_parameters(script_files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_metadata_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        
        # Handle Protected Tools (.ptool)
        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            metadata = package.get("metadata", {})
            metadata["is_protected"] = True
            metadata["is_compiled"] = True
            return {"metadata": metadata}

        # Handle Source Projects
        scripts_dir = os.path.join(absolute_path, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})

        if not script_files: return {"metadata": {"displayName": os.path.basename(absolute_path)}}
        response = get_script_metadata(script_files)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_content_logic(script_path: str, script_type: str):
    try:
        absolute_path = resolve_script_path(script_path)
        scripts_dir = os.path.join(absolute_path, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
        
        if not script_files: return {"sourceCode": "// No scripts found."}
        result = get_combined_script(script_files)
        
        # Clean up #line directives for UI
        import re
        clean_code = re.sub(r'^#line\s+\d+.*(?:\r?\n|$)', '', result.get("combined_script", ""), flags=re.MULTILINE).strip()
        return {"sourceCode": clean_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def edit_script_logic(script_path: str, script_type: str):
    try:
        project_root = resolve_script_path(script_path)
        project_name = os.path.basename(project_root)
        _scaffold_project_inplace(project_root, project_name)
        set_active_ide_session(project_root)
        response = create_and_open_workspace(project_root, "folder-project")
        return {"message": f"Opening {project_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _scaffold_project_inplace(project_root: str, project_name: str):
    try:
        # global.json
        with open(os.path.join(project_root, "global.json"), 'w') as f:
            f.write('{"sdk": {"rollForward": "latestFeature"}}')
        
        # VS Code settings to hide scaffolding
        vscode_dir = os.path.join(project_root, ".vscode")
        os.makedirs(vscode_dir, exist_ok=True)
        settings = {
            "files.exclude": {
                "**/*.csproj": True,
                "**/bin": True,
                "**/obj": True,
                "**/global.json": True,
                "**/Globals.cs": True,
                "**/.editorconfig": True,
                "**/.gitignore": True,
                "**/.github": True,
                "**/.vscode": True
            }
        }
        with open(os.path.join(vscode_dir, "settings.json"), 'w') as f:
            json.dump(settings, f, indent=4)

        _write_project_gitignore(project_root)
    except: pass

def _write_project_gitignore(project_dir: str):
    try:
        with open(os.path.join(project_dir, ".gitignore"), 'w') as f:
            f.write("# Paracore IDE Scaffolding\nbin/\nobj/\n*.csproj\nglobal.json\nGlobals.cs\n.editorconfig\n.github/\n")
    except: pass

def delete_script_logic(script_path: str, script_type: str):
    try:
        path = resolve_script_path(script_path)
        if os.path.isdir(path):
            import shutil
            shutil.rmtree(path)
        else: os.remove(path)
        return {"success": True, "message": f"Deleted {os.path.basename(script_path)}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
