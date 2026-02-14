import asyncio
import glob
import os
import json
import traceback
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import HTTPException
import grpc_client
from ide_manager import set_active_ide_session
from utils import resolve_script_path
from api.script_templates import ARCHETYPES

async def get_all_scripts(pack_path: str) -> List[Dict[str, Any]]:
    """
    V3 Pack Discovery: Loads all folders inside an 'Automation Pack' (.paracore) as Tools.
    """
    if not os.path.isdir(pack_path):
        raise HTTPException(status_code=400, detail="Automation Pack path not found.")

    tools = []
    projects_to_fetch = []

    try:
        # 1. Discover all Tool folders
        for item in os.listdir(pack_path):
            item_path = os.path.join(pack_path, item)
            if not os.path.isdir(item_path) or item.startswith('.'):
                continue
            
            scripts_dir = os.path.join(item_path, "Scripts")
            script_files = []
            if os.path.isdir(scripts_dir):
                for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                    if os.path.basename(fp).lower() == "globals.cs": continue
                    try:
                        with open(fp, 'r', encoding='utf-8-sig') as f:
                            script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
                    except: continue

            projects_to_fetch.append({
                "project_name": item,
                "absolute_path": item_path.replace('\\', '/'),
                "files": script_files
            })

        # 2. Fetch Bulk Metadata (Safe gRPC call)
        bulk_results_map = {}
        if projects_to_fetch:
            try:
                # Wrap in timeout or just catch all to prevent 500
                bulk_results = grpc_client.get_bulk_metadata(projects_to_fetch)
                for res in bulk_results:
                    # Protobuf objects or dicts - be careful with access
                    path = res.get("absolute_path") if isinstance(res, dict) else getattr(res, "absolute_path", None)
                    if path:
                        bulk_results_map[path] = res
            except Exception as e:
                print(f"[ScriptService] Bulk metadata fetch failed: {e}")

        # 3. Transform into UI Tool Objects
        for project in projects_to_fetch:
            project_path = project["absolute_path"]
            project_name = project["project_name"]
            
            try:
                folder_stat = os.stat(project_path)
                res = bulk_results_map.get(project_path)
                
                # SAFE ACCESS: Handle both dict and object types from gRPC client
                def get_val(obj, key, default=None):
                    if obj is None: return default
                    if isinstance(obj, dict): return obj.get(key, default)
                    return getattr(obj, key, default)

                meta_obj = get_val(res, "metadata")
                params_obj = get_val(res, "parameters", [])

                tools.append({
                    "id": project_path,
                    "name": project_name,
                    "absolutePath": project_path,
                    "sourcePath": project_path,
                    "metadata": {
                        "displayName": get_val(meta_obj, "displayName") or get_val(meta_obj, "name") or project_name,
                        "description": get_val(meta_obj, "description") or "Click Edit to scaffold.",
                        "author": get_val(meta_obj, "author") or "",
                        "categories": list(get_val(meta_obj, "categories", [])) or ["Uninitialized"],
                        "documentType": get_val(meta_obj, "document_type") or "Any",
                        "usage_examples": list(get_val(meta_obj, "usage_examples", [])),
                        "isProtected": get_val(meta_obj, "is_protected", False),
                        "isCompiled": get_val(meta_obj, "is_compiled", False),
                        "dateCreated": datetime.fromtimestamp(folder_stat.st_ctime).isoformat(),
                        "dateModified": datetime.fromtimestamp(folder_stat.st_mtime).isoformat()
                    },
                    "parameters": params_obj if params_obj else []
                })
            except Exception as e:
                print(f"[ScriptService] Error processing folder {project_name}: {e}")
                # Fallback tool entry so the card still appears even if stat or logic fails
                tools.append({
                    "id": project_path,
                    "name": project_name,
                    "absolutePath": project_path,
                    "metadata": {"displayName": project_name, "description": "Error loading folder info."},
                    "parameters": []
                })

        # 4. Add .ptool files
        for ptool_path in glob.glob(os.path.join(pack_path, "*.ptool")):
            try:
                resolved_ptool_path = resolve_script_path(ptool_path)
                with open(resolved_ptool_path, 'r', encoding='utf-8') as f:
                    package = json.load(f)
                
                metadata = package.get("metadata", {})
                metadata["is_protected"] = True
                metadata["is_compiled"] = True
                ptool_stat = os.stat(resolved_ptool_path)
                
                params = package.get("parameters", [])
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

                tools.append({
                    "id": resolved_ptool_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_ptool_path),
                    "absolutePath": resolved_ptool_path.replace('\\', '/'),
                    "parameters": hydrated_params,
                    "metadata": {
                        **metadata,
                        "dateCreated": datetime.fromtimestamp(ptool_stat.st_ctime).isoformat(),
                        "dateModified": datetime.fromtimestamp(ptool_stat.st_mtime).isoformat()
                    }
                })
            except Exception: continue

        return tools
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

async def edit_script_logic(tool_path: str):
    try:
        project_root = resolve_script_path(tool_path)
        project_name = os.path.basename(project_root)
        scripts_dir = os.path.join(project_root, "Scripts")
        if not os.path.isdir(scripts_dir):
            os.makedirs(scripts_dir, exist_ok=True)
            
        existing_cs_files = glob.glob(os.path.join(scripts_dir, "*.cs"))
        if not existing_cs_files:
            entry_file = os.path.join(scripts_dir, f"{project_name}.cs")
            if not os.path.exists(entry_file):
                with open(entry_file, 'w', encoding='utf-8') as f:
                    f.write(ARCHETYPES["blank"])

        _scaffold_project_inplace(project_root, project_name)
        set_active_ide_session(project_root)
        grpc_client.create_and_open_workspace(project_root)
        
        return {"message": f"Opening tool: {project_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _scaffold_project_inplace(project_root: str, project_name: str):
    try:
        with open(os.path.join(project_root, "global.json"), 'w') as f:
            f.write('{"sdk": {"rollForward": "latestFeature"}}')
        pack_root = os.path.dirname(project_root)
        _ensure_pack_gitignore(pack_root)
    except: pass

def _ensure_pack_gitignore(pack_dir: str):
    try:
        if not os.path.isdir(pack_dir): return
        path = os.path.join(pack_dir, ".gitignore")
        content = (
            "# Paracore Automation Pack - IDE Scaffolding Exclusions\n"
            "**/bin/\n"
            "**/obj/\n"
            "**/*.csproj\n"
            "**/global.json\n"
            "**/Globals.cs\n"
            "**/.editorconfig\n"
            "**/.github/\n"
            "**/.vscode/\n"
        )
        if not os.path.exists(path):
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
    except: pass

async def get_script_parameters_logic(script_path: str):
    try:
        absolute_path = resolve_script_path(script_path)
        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            params = package.get("parameters", [])
            for p in params:
                val = p.get("defaultValueJson", "null")
                try:
                    p["defaultValue"] = json.loads(val)
                    p["value"] = p["defaultValue"]
                except:
                    p["defaultValue"] = val
                    p["value"] = val
            return {"parameters": params}

        scripts_dir = os.path.join(absolute_path, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})

        if not script_files: return {"parameters": []}
        return grpc_client.get_script_parameters(script_files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_metadata_logic(script_path: str):
    try:
        absolute_path = resolve_script_path(script_path)
        if absolute_path.endswith('.ptool'):
            with open(absolute_path, 'r', encoding='utf-8') as f:
                package = json.load(f)
            metadata = package.get("metadata", {})
            metadata["is_protected"] = True
            metadata["is_compiled"] = True
            return {"metadata": metadata}

        scripts_dir = os.path.join(absolute_path, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})

        if not script_files: return {"metadata": {"displayName": os.path.basename(absolute_path)}}
        res = grpc_client.get_script_metadata(script_files)
        
        # Normalize to camelCase for frontend
        if res and "metadata" in res:
            m = res["metadata"]
            res["metadata"] = {
                "displayName": m.get("name") or os.path.basename(absolute_path),
                "description": m.get("description"),
                "author": m.get("author"),
                "website": m.get("website"),
                "categories": m.get("categories"),
                "lastRun": m.get("last_run"),
                "dependencies": m.get("dependencies"),
                "documentType": m.get("document_type") or "Any",
                "usage_examples": m.get("usage_examples"),
                "isProtected": m.get("is_protected"),
                "isCompiled": m.get("is_compiled")
            }
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_content_logic(script_path: str):
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
        result = grpc_client.get_combined_script(script_files)
        
        import re
        clean_code = re.sub(r'^#line\s+\d+.*(?:\r?\n|$)', '', result.get("combined_script", ""), flags=re.MULTILINE).strip()
        return {"sourceCode": clean_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def create_new_script_logic(parent_folder: str, script_name: str, folder_name: Optional[str] = None, template_id: str = "blank", generated_logic: Optional[str] = None, generated_params: Optional[str] = None, overwrite: bool = False):
    clean_name = script_name.replace('.cs', '')
    project_dir = os.path.join(parent_folder, clean_name)
    scripts_dir = os.path.join(project_dir, "Scripts")
    
    if os.path.exists(project_dir) and not overwrite:
        raise HTTPException(status_code=409, detail=f"Tool folder '{clean_name}' already exists.")

    try:
        os.makedirs(scripts_dir, exist_ok=True)
        template_code = ARCHETYPES.get(template_id, ARCHETYPES["blank"])
        if generated_logic:
            template_code = template_code.replace("// 2. Execution Logic", f"// 2. Execution Logic\n{generated_logic}")
        
        entry_file_path = os.path.join(scripts_dir, f"{clean_name}.cs")
        with open(entry_file_path, 'w', encoding='utf-8') as f:
            f.write(template_code)
            
        _ensure_pack_gitignore(parent_folder)
        
        # V3.1: Return the full hydrated script object so the UI can immediately select it
        all_scripts = await get_all_scripts(parent_folder)
        new_script = next((s for s in all_scripts if s["absolutePath"].replace('\\', '/') == project_dir.replace('\\', '/')), None)
        
        return new_script or {"message": f"Successfully created tool: {clean_name}", "script_path": project_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create tool: {e}")

async def save_script_logic(script_path: str, content: Optional[str], filename: Optional[str], files: Optional[Dict[str, str]]):
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

        return {"success": True, "message": f"Saved {len(saved_paths)} script(s).", "paths": saved_paths}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {str(e)}")

def delete_script_logic(script_path: str, delete_scaffolding_only: bool = False):
    try:
        path = resolve_script_path(script_path)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Path not found.")

        if delete_scaffolding_only:
            if not os.path.isdir(path):
                raise HTTPException(status_code=400, detail="Scaffolding can only be cleared from project folders.")
            
            # Delete everything EXCEPT the Scripts subfolder
            deleted_count = 0
            for item in os.listdir(path):
                if item == "Scripts": continue
                item_path = os.path.join(path, item)
                try:
                    if os.path.isdir(item_path):
                        import shutil
                        shutil.rmtree(item_path)
                    else:
                        os.remove(item_path)
                    deleted_count += 1
                except Exception as e:
                    print(f"[ScriptService] Failed to delete {item}: {e}")
            
            return {"success": True, "message": f"Cleaned {deleted_count} IDE files. Logic preserved."}
        else:
            # Full Delete
            if os.path.isdir(path):
                import shutil
                shutil.rmtree(path)
            else: 
                os.remove(path)
            return {"success": True, "message": f"Deleted {os.path.basename(script_path)}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
