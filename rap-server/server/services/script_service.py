import asyncio
import glob
import os
import shutil
import json
import stat
import time
import traceback
import re
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import HTTPException
import grpc_client
from ide_manager import set_active_ide_session, remove_active_ide_session
from utils import resolve_script_path, launch_vscode, read_script_files
from api.script_templates import ARCHETYPES

def recover_true_path(path: str) -> str:
    """Recovers the actual filesystem casing for a given path to ensure consistency."""
    abs_p = resolve_script_path(path).replace('\\', '/')
    parent_dir = os.path.dirname(abs_p)
    base_name = os.path.basename(abs_p)
    
    if os.path.isdir(parent_dir):
        for item in os.listdir(parent_dir):
            if item.lower() == base_name.lower():
                return os.path.abspath(os.path.join(parent_dir, item)).replace('\\', '/')
    return abs_p

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
            # V5 PRECISION FIX: If it's a double/number and the JSON string contains ".0", 
            # keep it as a string to prevent stripping trailing zeros.
            if p.get("type") == "number" or p.get("numericType") == "double":
                if "." in val_json:
                    real_val = val_json.strip('"')
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

def _hydrate_metadata_for_frontend(metadata: Any) -> Dict:
    """
    V4 ELITE: Ensures metadata is consistent (camelCase) for the frontend.
    Bridges gRPC (snake_case) and JSON/Binary (camelCase).
    """
    if not metadata: return {}
    
    # Handle gRPC objects vs dicts
    if hasattr(metadata, "ListFields"):
        m_dict = {f.name: v for f, v in metadata.ListFields()}
    elif isinstance(metadata, dict):
        m_dict = metadata
    else:
        m_dict = {}

    return {
        **m_dict,
        "name": m_dict.get("name", ""),
        "displayName": m_dict.get("name", ""),
        "description": m_dict.get("description", ""),
        "author": m_dict.get("author", ""),
        "website": m_dict.get("website", ""),
        "categories": list(m_dict.get("categories", [])),
        "lastRun": m_dict.get("lastRun") or m_dict.get("last_run", ""),
        "dateCreated": m_dict.get("dateCreated") or m_dict.get("date_created", ""),
        "dateModified": m_dict.get("dateModified") or m_dict.get("date_modified", ""),
        "documentType": m_dict.get("documentType") or m_dict.get("document_type", ""),
        "usageExamples": list(m_dict.get("usageExamples") or m_dict.get("usage_examples", [])),
        "isWatchdog": m_dict.get("isWatchdog") or m_dict.get("is_watchdog", False),
        "isProtected": m_dict.get("isProtected") or m_dict.get("is_protected", False),
        "isCompiled": m_dict.get("isCompiled") or m_dict.get("is_compiled", False)
    }

def _extract_query_data(files: List[Dict[str, str]]) -> Optional[Dict]:
    """Surgically extracts VQB graph data from file comments if present."""
    for f in files:
        content = f.get("content", "")
        match = re.search(r'// __PARACORE_QUERY_DATA__(.*)', content)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except:
                pass
    return None

async def get_all_scripts(pack_path: str) -> List[Dict[str, Any]]:
    """V3 Pack Discovery: Loads all folders inside an Automation Pack."""
    if not os.path.isdir(pack_path): return []
    tools = []
    projects_to_fetch = []

    try:
        for item in os.listdir(pack_path):
            item_path = os.path.join(pack_path, item)
            if not os.path.isdir(item_path) or item.startswith('.'): continue
            
            script_files = read_script_files(item_path)

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
            
            # V5: AUTO-REGISTRATION FOR SYNC (The "Always-On" Sync)
            # If a folder contains a .csproj, we automatically treat it as an active IDE session.
            # This ensures sync works immediately upon discovery if it's already a project.
            try:
                has_csproj = any(f.endswith('.csproj') for f in os.listdir(p_path))
                if has_csproj:
                    from ide_manager import set_active_ide_session
                    set_active_ide_session(p_path)
            except: pass

            # Map metadata and parameters through unified hydration
            raw_meta = res.get("metadata") if isinstance(res, dict) else getattr(res, "metadata", None)
            raw_params = res.get("parameters") if isinstance(res, dict) else getattr(res, "parameters", [])
            
            # V5: Pre-extract VQB graph data for the "Template Gallery"
            extracted_query = _extract_query_data(project["files"])

            # Check if this script has a Docs/ folder with index.md
            has_doc = os.path.isfile(os.path.join(p_path, "Docs", "index.md"))

            tools.append({
                "id": p_path, "name": project["project_name"], "absolutePath": p_path,
                "metadata": _hydrate_metadata_for_frontend(raw_meta),
                "parameters": _hydrate_params_for_frontend(raw_params),
                "queryData": extracted_query,
                "hasDoc": has_doc
            })

        # Load Binaries (.ptool, .wtool)
        for ptool_path in glob.glob(os.path.join(pack_path, "*.ptool")) + glob.glob(os.path.join(pack_path, "*.wtool")):
            try:
                abs_p = resolve_script_path(ptool_path).replace('\\', '/')
                with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
                tools.append({
                    "id": abs_p, "name": os.path.basename(abs_p), "absolutePath": abs_p,
                    "metadata": _hydrate_metadata_for_frontend({**pkg.get("metadata", {}), "isProtected": True, "isCompiled": True}),
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
        
        # 1. Recover Original Casing from Filesystem
        # The input path might be lowercased for normalization, but we want the real name
        parent_dir = os.path.dirname(abs_p)
        base_name = os.path.basename(abs_p)
        project_name = base_name # Fallback
        
        if os.path.isdir(parent_dir):
            # Find the actual folder name on disk to preserve casing (e.g. UnplacedRooms)
            for item in os.listdir(parent_dir):
                if item.lower() == base_name.lower():
                    project_name = item
                    # Recalculate the absolute path with the real casing
                    abs_p = os.path.abspath(os.path.join(parent_dir, item)).replace('\\', '/')
                    break

        # 2. Handle binary/compiled scripts natively
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f:
                pkg = json.load(f)
            return {
                "id": abs_p,
                "name": os.path.basename(abs_p),
                "absolutePath": abs_p,
                "metadata": _hydrate_metadata_for_frontend({**pkg.get("metadata", {}), "isProtected": True, "isCompiled": True}),
                "parameters": _hydrate_params_for_frontend(pkg.get("parameters", []))
            }
            
        # 2. Handle standard folder scripts
        script_files = []
        project_name = os.path.basename(abs_p)
        script_files = read_script_files(abs_p)

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
        
        # V5: Extract query data for Template Gallery support
        extracted_query = _extract_query_data(script_files)

        return {
            "id": abs_p,
            "name": project_name,
            "absolutePath": abs_p,
            "metadata": res.get("metadata") if isinstance(res, dict) else res.metadata,
            "parameters": _hydrate_params_for_frontend(raw_params),
            "queryData": extracted_query
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

        script_files = read_script_files(abs_p)
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
        script_files = read_script_files(abs_p)
        if not script_files: return {"options": [], "is_success": True}
        combined_result = grpc_client.get_combined_script(script_files)
        combined_code = combined_result.get("combined_script", "")
        return grpc_client.compute_parameter_options(combined_code, parameter_name, parameters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def edit_script_logic(tool_path: str, force_scaffold: bool = False):
    try:
        # 1. Resolve the path (minimal work)
        project_root = recover_true_path(tool_path)
        project_name = os.path.basename(project_root)
        scripts_dir = os.path.join(project_root, "Scripts")

        # 2. Ensure Scripts/ folder exists with at least one .cs file
        if not os.path.isdir(scripts_dir):
            os.makedirs(scripts_dir, exist_ok=True)
        
        existing_cs_files = glob.glob(os.path.join(scripts_dir, "*.cs"))
        if not existing_cs_files:
            entry_file = os.path.join(scripts_dir, f"{project_name}.cs")
            if not os.path.exists(entry_file):
                # Detect archetype based on parent folder or context
                template_id = "BlankSentinel" if project_root.lower().endswith(('.wtool', 'sentinels')) else "blank"
                with open(entry_file, 'w', encoding='utf-8') as f:
                    f.write(ARCHETYPES.get(template_id, ARCHETYPES["blank"]))

        # 3. Ensure Docs/ folder with starter index.md (idempotent — never overwrites)
        docs_dir = os.path.join(project_root, "Docs")
        if not os.path.isdir(docs_dir):
            os.makedirs(docs_dir, exist_ok=True)
        doc_index = os.path.join(docs_dir, "index.md")
        if not os.path.exists(doc_index):
            with open(doc_index, 'w', encoding='utf-8') as f:
                f.write(f"# {project_name}\n\n"
                        "## Overview\n\n"
                        "Brief description of what this tool does.\n\n"
                        "## Parameters\n\n"
                        "| Parameter | Type | Description |\n"
                        "|-----------|------|-------------|\n"
                        "| — | — | — |\n\n"
                        "## Usage\n\n"
                        "How to use this tool.\n\n"
                        "## Notes\n\n")

        # 4. Perform FULL Scaffolding in Python ONLY if needed (Idempotent)
        # We skip this if .csproj already exists, making "Edit Script" instant for existing projects.
        has_csproj = any(f.endswith('.csproj') for f in os.listdir(project_root))
        if force_scaffold or not has_csproj:
            scaffold_project_full(project_root)

        # 5. Trigger VS Code Launch from Python (Robust & Non-blocking)
        launch_vscode(project_root)

        # 6. gRPC call — C# handles its own internal sync/scaffolding if needed
        # We don't wait for this; it's fire-and-forget for the Addin
        try:
            grpc_client.create_and_open_workspace(project_root)
        except:
            pass

        # 7. Track IDE session
        try:
            set_active_ide_session(project_root)
            _ensure_pack_gitignore(os.path.dirname(project_root))
        except:
            pass

        return {"message": f"Opening tool: {project_name}"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def _scaffold_project_inplace(project_root: str, project_name: str):
    try:
        with open(os.path.join(project_root, "global.json"), 'w') as f: f.write('{"sdk": {"version": "8.0.0", "rollForward": "latestFeature"}}')
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

def scaffold_project_full(project_root: str):
    """
    Python-based scaffolding implementation. 
    Handles creation of .csproj, Globals.cs, global.json, etc.
    """
    try:
        project_name = os.path.basename(project_root)
        config = grpc_client.get_revit_config()
        
        # 1. Fallback paths if Revit hasn't connected yet
        revit_path = config.revit_install_path or r"C:\Program Files\Autodesk\Revit 2025"
        addin_dir = config.addin_server_path or r"C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore"
        engine_path = os.path.join(addin_dir, "CoreScript.Engine.dll")

        # 2. global.json
        with open(os.path.join(project_root, "global.json"), 'w', encoding='utf-8') as f:
            f.write('{\n    "sdk": {\n        "version": "8.0.0",\n        "rollForward": "latestFeature"\n    }\n}')

        # 3. .editorconfig
        with open(os.path.join(project_root, ".editorconfig"), 'w', encoding='utf-8') as f:
            f.write("[*.{cs,vb}]\n"
                    "dotnet_diagnostic.CA1050.severity = none\n"
                    "dotnet_diagnostic.CS8019.severity = warning\n"
                    "dotnet_diagnostic.CA1707.severity = none # Allow underscores in member names for Paracore conventions\n")

        # 4. Globals.cs
        globals_content = (
            "// This file enables IntelliSense for custom globals and implicit imports.\n"
            "global using System;\nglobal using System.Collections.Generic;\nglobal using System.Linq;\nglobal using System.Text.Json;\n"
            "global using System.Globalization;\n"
            "global using Microsoft.CSharp;\nglobal using Autodesk.Revit.DB;\nglobal using Autodesk.Revit.DB.Architecture;\n"
            "global using Autodesk.Revit.DB.Structure;\nglobal using Autodesk.Revit.DB.Mechanical;\nglobal using Autodesk.Revit.DB.Plumbing;\n"
            "global using Autodesk.Revit.DB.Electrical;\nglobal using Autodesk.Revit.UI;\nglobal using CoreScript.Engine.Globals;\n"
            "global using static CoreScript.Engine.Globals.ScriptApi;\nglobal using static CoreScript.Engine.Globals.WatchdogRegistry;\n"
            "global using SixLabors.ImageSharp;\nglobal using SixLabors.ImageSharp.Processing;\nglobal using SixLabors.ImageSharp.PixelFormats;\n"
            "global using MiniExcelLibs;\nglobal using MathNet.Numerics;\nglobal using MathNet.Numerics.LinearAlgebra;\n"
            "global using MathNet.Numerics.Statistics;"
        )
        with open(os.path.join(project_root, "Globals.cs"), 'w', encoding='utf-8') as f:
            f.write(globals_content)

        # 5. .csproj
        # Find Roslyn DLLs in addin directory
        roslyn_refs = ""
        if os.path.isdir(addin_dir):
            for dll in glob.glob(os.path.join(addin_dir, "Microsoft.CodeAnalysis*.dll")):
                dll_name = os.path.splitext(os.path.basename(dll))[0]
                roslyn_refs += f'    <Reference Include="{dll_name}">\n      <HintPath>{dll}</HintPath>\n      <Private>false</Private>\n    </Reference>\n'

        csproj_content = f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <LangVersion>latest</LangVersion>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <OutputType>Library</OutputType>
    <RunAnalyzersDuringBuild>true</RunAnalyzersDuringBuild>
    <RunAnalyzers>true</RunAnalyzers>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="RevitAPI">
      <HintPath>{revit_path}\\RevitAPI.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="RevitAPIUI">
      <HintPath>{revit_path}\\RevitAPIUI.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="CoreScript.Engine">
      <HintPath>{engine_path}</HintPath>
      <Private>false</Private>
    </Reference>
{roslyn_refs}  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="SixLabors.ImageSharp" Version="3.1.5" />
    <PackageReference Include="RestSharp" Version="113.1.0" />
    <PackageReference Include="MiniExcel" Version="1.31.2" />
    <PackageReference Include="MathNet.Numerics" Version="5.0.0" />
  </ItemGroup>
</Project>"""
        with open(os.path.join(project_root, f"{project_name}.csproj"), 'w', encoding='utf-8') as f:
            f.write(csproj_content)

        # 6. .github/copilot-instructions.md
        github_dir = os.path.join(project_root, ".github")
        os.makedirs(github_dir, exist_ok=True)
        from api.ai_instructions import COPILOT_INSTRUCTIONS
        context_header = "# Current Script Context: FOLDER PROJECT\n# All logic goes into the Scripts/ folder.\n# Use #region GroupName directives to organize parameters.\n\n"
        with open(os.path.join(github_dir, "copilot-instructions.md"), 'w', encoding='utf-8') as f:
            f.write(context_header + COPILOT_INSTRUCTIONS)

        return True
    except Exception as e:
        return False

async def get_script_metadata_logic(script_path: str):
    try:
        abs_p = resolve_script_path(script_path)
        if abs_p.lower().endswith(('.ptool', '.wtool')):
            with open(abs_p, 'r', encoding='utf-8') as f: pkg = json.load(f)
            m = pkg.get("metadata", {})
            m.update({"isProtected": True, "isCompiled": True, "isWatchdog": abs_p.lower().endswith('.wtool')})
            return {"metadata": m}
        script_files = read_script_files(abs_p)
        if not script_files: return {"metadata": {"displayName": os.path.basename(abs_p)}}
        
        # Use bulk_metadata even for single scripts to ensure we get file-system timestamps (which require a path)
        projects_to_fetch = [{"project_name": os.path.basename(abs_p), "absolute_path": abs_p, "files": script_files}]
        results = grpc_client.get_bulk_metadata(projects_to_fetch)
        if not results: return {"metadata": {"displayName": os.path.basename(abs_p)}}
        
        raw_meta = results[0].get("metadata") if isinstance(results[0], dict) else results[0].metadata
        return {"metadata": _hydrate_metadata_for_frontend(raw_meta)}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

async def get_script_content_logic(script_path: str):
    try:
        abs_p = resolve_script_path(script_path)
        script_files = read_script_files(abs_p)
        if not script_files: return {"sourceCode": "// No scripts found."}
        res = grpc_client.get_combined_script(script_files)
        clean_code = re.sub(r'^#line\s+\d+.*(?:\r?\n|$)', '', res.get("combined_script", ""), flags=re.MULTILINE)
        clean_code = re.sub(r'^[ \t]+$', '', clean_code, flags=re.MULTILINE)
        clean_code = re.sub(r'\n{3,}', '\n\n', clean_code).strip()
        return {"sourceCode": clean_code}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

async def create_new_script_logic(parent_folder: str, script_name: str, folder_name: Optional[str] = None, template_id: str = "blank", generated_logic: Optional[str] = None, generated_params: Optional[str] = None, overwrite: bool = False):
    # CRITICAL FIX: Remove ALL spaces (leading, trailing, and middle) to ensure a valid C# identifier
    clean_name = script_name.replace(" ", "").replace('.cs', '')
    p_dir = os.path.join(parent_folder, clean_name)
    s_dir = os.path.join(p_dir, "Scripts")
    if os.path.exists(p_dir) and not overwrite: raise HTTPException(status_code=409, detail=f"Tool folder exists.")
    try:
        os.makedirs(s_dir, exist_ok=True)
        template = ARCHETYPES.get(template_id, ARCHETYPES["blank"])
        
        # 1. Inject Logic
        if generated_logic:
            if "// __INJECT_QUERY_BLOCK__" in template:
                template = re.sub(r"// __INJECT_QUERY_BLOCK__", generated_logic, template, flags=re.DOTALL | re.IGNORECASE)
            elif template_id == "raw_injection":
                # For raw injection, if the tag isn't there, we just use the logic as the full template
                template = generated_logic
        else:
            # Clear the tag if no logic provided
            template = template.replace("// __INJECT_QUERY_BLOCK__", "")
            # Also clear the "Visual Query Injection" comment if it exists
            template = template.replace("// Visual Query Injection", "")
        
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

def _on_rm_error(func, path, exc_info):
    """Handle read-only or locked files during rmtree."""
    os.chmod(path, stat.S_IWRITE)
    func(path)

def _robust_rmtree(path: str, retries: int = 3, delay: float = 1.0):
    """rmtree with retry for Windows file-lock issues."""
    for attempt in range(retries):
        try:
            shutil.rmtree(path, onerror=_on_rm_error)
            return
        except Exception:
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                raise

def delete_script_logic(script_path: str, delete_scaffolding_only: bool = False):
    try:
        path = resolve_script_path(script_path)
        if not os.path.exists(path): return {"success": True}
        
        # 1. Release locks
        try: grpc_client.stop_sync_session(path)
        except: pass
        try: remove_active_ide_session(path)
        except: pass
        
        time.sleep(0.5)
        
        if delete_scaffolding_only:
            # Delete everything EXCEPT the Scripts folder
            for item in os.listdir(path):
                if item == "Scripts": continue
                ip = os.path.join(path, item)
                if os.path.isdir(ip): _robust_rmtree(ip)
                else: os.remove(ip)
            return {"success": True, "message": "Scaffolding removed. Source code preserved."}
        else:
            # FULL DELETE
            # We try to delete the whole tree. 
            # If we hit a PermissionError on the ROOT folder (WinError 32), 
            # we check if we at least managed to delete the 'Scripts' folder.
            try:
                if os.path.isdir(path): _robust_rmtree(path)
                else: os.remove(path)
            except PermissionError:
                # If the Scripts folder is gone, we consider the deletion 'practically' successful 
                # even if VS Code is holding the parent folder handle.
                scripts_path = os.path.join(path, "Scripts")
                if not os.path.exists(scripts_path):
                    return {"success": True, "message": "Script contents deleted. Workspace folder is locked and will be removed once VS Code is closed."}
                raise HTTPException(status_code=423, detail="Could not delete script contents. Please close VS Code and try again.")
                
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def rename_script_logic(old_path: str, new_name: str):
    """
    V5 ROBUST: Renames a script while ensuring all file handles (Watchdog + Sync) are released first.
    Includes a retry loop to handle Windows lazy file-lock release.
    """
    path = resolve_script_path(old_path)
    try:
        # 1. Surgical Unlock: Release gRPC and Python watchdog handles
        from ide_manager import remove_active_ide_session, set_active_ide_session
        
        # Stop gRPC FIRST (often holds more stubborn locks)
        try: grpc_client.stop_sync_session(path)
        except: pass
        
        # Stop aggressive Python watchdog
        try: remove_active_ide_session(path)
        except: pass

        # 2. Resilient Execution: Give Windows more time (1.0s) and retry if needed
        time.sleep(1.0)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Perform actual rename via Revit Addin
                res = grpc_client.rename_script(old_path, new_name)
                
                # If successful, re-register new path for 'Always-On' sync
                if res.get("is_success") and res.get("new_path"):
                    try: set_active_ide_session(res["new_path"])
                    except: pass
                
                return res
            except Exception as e:
                if "denied" in str(e).lower() and attempt < max_retries - 1:
                    time.sleep(0.5) # Wait for Windows handle release
                    continue
                raise
    except Exception as e:
        msg = str(e)
        if "denied" in msg.lower():
            msg = "Access denied by Windows. Please close the workspace in VS Code and try again."
        raise HTTPException(status_code=423, detail=msg)
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

def register_watchdog_source_logic(path: str, parameters: Optional[List[Dict[str, Any]]] = None, license_tier: str = "free"):
    # Inject license tier into parameters so the C# engine can gate enterprise features
    if parameters is None:
        parameters = []
    if not any(p.get("name") == "__license_tier__" for p in parameters):
        parameters.append({"name": "__license_tier__", "value": license_tier})
    parameters_json = json.dumps(parameters) if parameters is not None else None
    return grpc_client.register_watchdog_source(path, parameters_json)

def unregister_watchdog_source_logic(path: str): return grpc_client.unregister_watchdog_source(path)
def get_category_parameters_logic(category_name: str):
    res = grpc_client.get_category_parameters(category_name)
    if res and "parameters" in res:
        for p in res["parameters"]: p["spec_type_id"] = p.get("spec_type_id", "")
    return res
