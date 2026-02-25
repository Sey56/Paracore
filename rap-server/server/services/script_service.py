import asyncio
import glob
import os
import shutil
import json
import traceback
import re
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import HTTPException
import grpc_client
from ide_manager import set_active_ide_session, remove_active_ide_session
from utils import resolve_script_path
from api.script_templates import ARCHETYPES

def _hydrate_params_for_frontend(params: List[Dict]) -> List[Dict]:
    """
    V4 ELITE: Single source of truth for parameter hydration.
    Handles gRPC (snake_case) and Binary JSON (camelCase) inconsistencies.
    Ensures frontend always receives a perfect camelCase schema.
    """
    hydrated = []
    for p in params:
        # 1. Handle JSON value parsing
        val_json = p.get("defaultValueJson") or p.get("default_value_json") or "null"
        try:
            real_val = json.loads(val_json)
        except:
            real_val = val_json

        # 2. Strict mapping to frontend schema
        # We check both camel and snake case for every critical field to prevent 'dropping' data
        item = {
            "name": p.get("name"),
            "type": p.get("type"),
            "defaultValueJson": val_json,
            "defaultValue": real_val,
            "value": real_val,
            "description": p.get("description"),
            "options": list(p.get("options", [])),
            "multiSelect": p.get("multiSelect") or p.get("multi_select", False),
            "visibleWhen": p.get("visibleWhen") or p.get("visible_when", ""),
            "numericType": p.get("numericType") or p.get("numeric_type", ""),
            "min": p.get("min"),
            "max": p.get("max"),
            "step": p.get("step"),
            "isRevitElement": p.get("isRevitElement") or p.get("is_revit_element", False),
            "revitElementType": p.get("revitElementType") or p.get("revit_element_type", ""),
            "revitElementCategory": p.get("revitElementCategory") or p.get("revit_element_category", ""),
            "requiresCompute": p.get("requiresCompute") or p.get("requires_compute", False),
            "group": p.get("group", ""),
            "inputType": p.get("inputType") or p.get("input_type", ""),
            "required": p.get("required", False),
            "suffix": p.get("suffix", ""),
            "pattern": p.get("pattern", ""),
            "enabledWhenParam": p.get("enabledWhenParam") or p.get("enabled_when_param", ""),
            "enabledWhenValue": p.get("enabledWhenValue") or p.get("enabled_when_value", ""),
            "unit": p.get("unit") or p.get("Unit", ""),
            "selectionType": p.get("selectionType") or p.get("selection_type", "")
        }
        hydrated.append(item)
    return hydrated

async def get_all_scripts(pack_path: str) -> List[Dict[str, Any]]:
    """V3 Pack Discovery: Loads all folders inside an Automation Pack."""
    if not os.path.isdir(pack_path): return []
    tools = []
    projects_to_fetch = []

    try:
        for item in os.listdir(pack_path):
            item_path = os.path.join(pack_path, item)
            if not os.path.isdir(item_path) or item.startswith('.'): continue
            
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

        bulk_results_map = {}
        if projects_to_fetch:
            bulk_results = grpc_client.get_bulk_metadata(projects_to_fetch)
            for res in bulk_results:
                path = res.get("absolute_path") if isinstance(res, dict) else getattr(res, "absolute_path", None)
                if path: bulk_results_map[path] = res

        for project in projects_to_fetch:
            p_path = project["absolute_path"]
            res = bulk_results_map.get(p_path)
            if not res: continue
            
            # Map parameters through unified hydration
            raw_params = res.get("parameters") if isinstance(res, dict) else getattr(res, "parameters", [])
            tools.append({
                "id": p_path, "name": project["project_name"], "absolutePath": p_path,
                "metadata": res.get("metadata") if isinstance(res, dict) else res.metadata,
                "parameters": _hydrate_params_for_frontend(raw_params)
            })

        # Load Binaries (.ptool, .wtool)
        for ptool_path in glob.glob(os.path.join(pack_path, "*.ptool")) + glob.glob(os.path.join(pack_path, "*.wtool")):
            try:
                abs_p = resolve_script_path(ptool_path).replace('\\', '/')
                with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
                tools.append({
                    "id": abs_p, "name": os.path.basename(abs_p), "absolutePath": abs_p,
                    "metadata": {**pkg.get("metadata", {}), "isProtected": True, "isCompiled": True},
                    "parameters": _hydrate_params_for_frontend(pkg.get("parameters", []))
                })
            except: continue

        return tools
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_single_script_logic(script_path: str):
    """Fetches full Script object structure (metadata + params) for a single absolute path."""
    try:
        abs_p = resolve_script_path(script_path).replace('\\', '/')
        
        # 1. Handle binary/compiled scripts natively
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f:
                pkg = json.load(f)
            return {
                "id": abs_p,
                "name": os.path.basename(abs_p),
                "absolutePath": abs_p,
                "metadata": {**pkg.get("metadata", {}), "isProtected": True, "isCompiled": True},
                "parameters": _hydrate_params_for_frontend(pkg.get("parameters", []))
            }
            
        # 2. Handle standard folder scripts
        script_files = []
        project_name = os.path.basename(abs_p)
        scripts_dir = os.path.join(abs_p, "Scripts")
        
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                try:
                    with open(fp, 'r', encoding='utf-8-sig') as f:
                        script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
                except Exception:
                    pass
                    
        # Request full metadata + parameters extraction from the backend Engine
        projects_to_fetch = [{
            "project_name": project_name,
            "absolute_path": abs_p,
            "files": script_files
        }]
        
        bulk_results = grpc_client.get_bulk_metadata(projects_to_fetch)
        if not bulk_results:
            raise HTTPException(status_code=404, detail="Script not found or failed to parse.")
            
        res = bulk_results[0]
        raw_params = res.get("parameters") if isinstance(res, dict) else getattr(res, "parameters", [])
        
        return {
            "id": abs_p,
            "name": project_name,
            "absolutePath": abs_p,
            "metadata": res.get("metadata") if isinstance(res, dict) else res.metadata,
            "parameters": _hydrate_params_for_frontend(raw_params)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def get_script_parameters_logic(script_path: str):
    """Refreshes parameter metadata for a specific script/tool."""
    try:
        abs_p = resolve_script_path(script_path)
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
            return {"parameters": _hydrate_params_for_frontend(pkg.get("parameters", []))}

        scripts_dir = os.path.join(abs_p, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})

        if not script_files: return {"parameters": []}
        res = grpc_client.get_script_parameters(script_files)
        return {"parameters": _hydrate_params_for_frontend(res.get("parameters", []))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def compute_parameter_options_logic(script_path: str, parameter_name: str, parameters: Optional[Dict] = None):
    """Triggers dynamic option discovery in Revit."""
    try:
        abs_p = resolve_script_path(script_path)
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
            target = next((p for p in pkg.get("parameters", []) if p["name"] == parameter_name), None)
            if target:
                skeleton = (
                    "using System; using System.Collections.Generic; "
                    "using Autodesk.Revit.DB; using CoreScript.Engine.Globals;\n"
                    "public class Params {\n"
                )
                unit = target.get("unit") or target.get("Unit")
                is_revit = target.get("isRevitElement") or target.get("is_revit_element") or target.get("type") == "reference"
                type_name = target.get("revitElementType") or target.get("revit_element_type") or target.get("type") or "string"
                if type_name == "number": type_name = "double"
                if unit: skeleton += f"    [Unit(\"{unit}\")]\n"
                if is_revit:
                    cat = target.get("revitElementCategory") or target.get("revit_element_category") or ""
                    skeleton += f"    [RevitElements(Category = \"{cat}\")]\n"
                    skeleton += f"    public {type_name} {target['name']} {{ get; set; }}\n"
                else:
                    skeleton += f"    public {type_name} {target['name']} {{ get; set; }}\n"
                skeleton += "}"
                return grpc_client.compute_parameter_options(skeleton, parameter_name, parameters)
            return {"options": [], "is_success": True}

        # Standard script logic
        scripts_dir = os.path.join(abs_p, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f:
                    script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
        
        if not script_files: return {"options": [], "is_success": True}
        combined_result = grpc_client.get_combined_script(script_files)
        combined_code = combined_result.get("combined_script", "")
        return grpc_client.compute_parameter_options(combined_code, parameter_name, parameters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def edit_script_logic(tool_path: str):
    try:
        project_root = resolve_script_path(tool_path)
        project_name = os.path.basename(project_root)
        scripts_dir = os.path.join(project_root, "Scripts")
        if not os.path.isdir(scripts_dir): os.makedirs(scripts_dir, exist_ok=True)
        existing_cs_files = glob.glob(os.path.join(scripts_dir, "*.cs"))
        if not existing_cs_files:
            entry_file = os.path.join(scripts_dir, f"{project_name}.cs")
            if not os.path.exists(entry_file):
                with open(entry_file, 'w', encoding='utf-8') as f: f.write(ARCHETYPES["blank"])
        _scaffold_project_inplace(project_root, project_name)
        set_active_ide_session(project_root)
        grpc_client.create_and_open_workspace(project_root)
        return {"message": f"Opening tool: {project_name}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

def _scaffold_project_inplace(project_root: str, project_name: str):
    try:
        with open(os.path.join(project_root, "global.json"), 'w') as f: f.write('{"sdk": {"rollForward": "latestFeature"}}')
        pack_root = os.path.dirname(project_root)
        _ensure_pack_gitignore(pack_root)
    except: pass

def _ensure_pack_gitignore(pack_dir: str):
    try:
        if not os.path.isdir(pack_dir): return
        path = os.path.join(pack_dir, ".gitignore")
        content = ("# Paracore Scaffolding\n**/bin/\n**/obj/\n**/*.csproj\n**/global.json\n**/Globals.cs\n**/.editorconfig\n**/.github/\n**/.vscode/\n")
        if not os.path.exists(path):
            with open(path, 'w', encoding='utf-8') as f: f.write(content)
    except: pass

async def get_script_metadata_logic(script_path: str):
    try:
        abs_p = resolve_script_path(script_path)
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
            m = pkg.get("metadata", {})
            m.update({"isProtected": True, "isCompiled": True, "isWatchdog": abs_p.lower().endswith('.wtool')})
            return {"metadata": m}
        scripts_dir = os.path.join(abs_p, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f: script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
        if not script_files: return {"metadata": {"displayName": os.path.basename(abs_p)}}
        return grpc_client.get_script_metadata(script_files)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

async def get_script_content_logic(script_path: str):
    try:
        abs_p = resolve_script_path(script_path)
        scripts_dir = os.path.join(abs_p, "Scripts")
        script_files = []
        if os.path.isdir(scripts_dir):
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, 'r', encoding='utf-8-sig') as f: script_files.append({"file_name": os.path.basename(fp), "content": f.read()})
        if not script_files: return {"sourceCode": "// No scripts found."}
        res = grpc_client.get_combined_script(script_files)
        clean_code = re.sub(r'^#line\s+\d+.*(?:\r?\n|$)', '', res.get("combined_script", ""), flags=re.MULTILINE).strip()
        return {"sourceCode": clean_code}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

async def create_new_script_logic(parent_folder: str, script_name: str, folder_name: Optional[str] = None, template_id: str = "blank", generated_logic: Optional[str] = None, generated_params: Optional[str] = None, overwrite: bool = False):
    clean_name = script_name.replace('.cs', '')
    p_dir = os.path.join(parent_folder, clean_name)
    s_dir = os.path.join(p_dir, "Scripts")
    if os.path.exists(p_dir) and not overwrite: raise HTTPException(status_code=409, detail=f"Tool folder exists.")
    try:
        os.makedirs(s_dir, exist_ok=True)
        template = ARCHETYPES.get(template_id, ARCHETYPES["blank"])
        
        # 1. Inject Logic
        if generated_logic: 
            template = re.sub(r"// __INJECT_QUERY_BLOCK__", generated_logic, template, flags=re.DOTALL | re.IGNORECASE)
        
        # 2. Inject Parameters (SKIP for raw_injection as it is self-contained)
        if generated_params and template_id != "raw_injection":
            indented = "\n".join([f"    {line}" if line.strip() else "" for line in generated_params.split("\n")])
            # Improved regex to handle Allman-style braces and potential whitespace
            p_pattern = r'(public\s+class\s+Params\s*[\r\n]*\s*)\{.*?(\}\s*[\r\n]*\s*$)'
            replacement = f"\\1\n{{\n    #region Generated Parameters\n{indented}\n    #endregion\n\\2"
            
            if re.search(p_pattern, template, re.DOTALL | re.MULTILINE): 
                template = re.sub(p_pattern, replacement, template, flags=re.DOTALL | re.MULTILINE)
            else: 
                # Append if not found
                template += f"\n\npublic class Params\n{{\n    #region Generated Parameters\n{indented}\n    #endregion\n}}"
                
        with open(os.path.join(s_dir, f"{clean_name}.cs"), 'w', encoding='utf-8') as f: 
            f.write(template)
        _ensure_pack_gitignore(parent_folder)
        return {"success": True, "path": p_dir}
    except Exception as e: raise HTTPException(status_code=500, detail=f"Failed: {e}")

async def save_script_logic(script_path: str, content: Optional[str], filename: Optional[str], files: Optional[Dict[str, str]]):
    try:
        abs_p = resolve_script_path(script_path)
        s_dir = os.path.join(abs_p, "Scripts")
        os.makedirs(s_dir, exist_ok=True)
        if files:
            for fn, fc in files.items():
                target = os.path.join(s_dir, fn)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'w', encoding='utf-8') as f: f.write(fc)
        if content:
            with open(os.path.join(s_dir, filename if filename else f"{os.path.basename(project_root)}.cs"), 'w', encoding='utf-8') as f: f.write(content)
        return {"success": True}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

def delete_script_logic(script_path: str, delete_scaffolding_only: bool = False):
    try:
        path = resolve_script_path(script_path)
        if not os.path.exists(path): return {"success": True}
        try: remove_active_ide_session(path)
        except: pass
        if delete_scaffolding_only:
            for item in os.listdir(path):
                if item == "Scripts": continue
                ip = os.path.join(path, item)
                if os.path.isdir(ip): shutil.rmtree(ip)
                else: os.remove(ip)
        else:
            if os.path.isdir(path): shutil.rmtree(path)
            else: os.remove(path)
        return {"success": True}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

def get_script_manifest_logic(path: str): return grpc_client.get_script_manifest(path)
def rename_script_logic(old_path: str, new_name: str): return grpc_client.rename_script(old_path, new_name)
def initialize_source_logic(path: str, description: str = ""):
    if not os.path.exists(path): os.makedirs(path, exist_ok=True)
    marker = os.path.join(path, ".paracore")

    # Handle re-initialization: if already initialized, just return success
    if os.path.exists(marker):
        return {"success": True, "message": "Already initialized. Source loaded.", "already_initialized": True}

    # Nesting Guard 1: Walk UP to check if any parent is already a script source
    parent = os.path.dirname(os.path.abspath(path))
    while parent and parent != os.path.dirname(parent):  # Stop at filesystem root
        if os.path.exists(os.path.join(parent, ".paracore")) or os.path.exists(os.path.join(parent, ".scriptsource")):
            raise Exception(f"Cannot create a source inside an existing source. Parent source found at: {os.path.basename(parent)}")
        parent = os.path.dirname(parent)

    # Nesting Guard 2: Check immediate children for existing sources
    try:
        for child in os.listdir(path):
            child_path = os.path.join(path, child)
            if os.path.isdir(child_path):
                if os.path.exists(os.path.join(child_path, ".paracore")) or os.path.exists(os.path.join(child_path, ".scriptsource")):
                    raise Exception(f"This folder contains existing script sources (e.g., '{child}'). Choose a different empty folder.")
    except PermissionError:
        pass  # If we can't read, just proceed

    source_data = {
        "name": os.path.basename(path),
        "description": description or f"Automation scripts in {os.path.basename(path)}",
        "version": "4.0.0",
        "type": "automation-pack"
    }
    with open(marker, "w", encoding="utf-8") as f: json.dump(source_data, f, indent=4)
    return {"success": True, "message": f"Source '{os.path.basename(path)}' initialized successfully."}

def register_watchdog_source_logic(path: str, parameters: Optional[List[Dict[str, Any]]] = None):
    # If parameters were provided, serialize them to JSON. Otherwise pass None.
    parameters_json = json.dumps(parameters) if parameters is not None else None
    return grpc_client.register_watchdog_source(path, parameters_json)

def unregister_watchdog_source_logic(path: str): return grpc_client.unregister_watchdog_source(path)
def get_category_parameters_logic(category_name: str):
    res = grpc_client.get_category_parameters(category_name)
    if res and "parameters" in res:
        for p in res["parameters"]: p["spec_type_id"] = p.get("spec_type_id", "")
    return res
