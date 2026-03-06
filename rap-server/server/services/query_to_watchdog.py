import os
from typing import Dict, Any, List, Optional
from services import query_service
from services import script_service

async def generate_watchdog_script_content(
    name: str,
    description: str,
    category_name: str,
    root_group: Dict[str, Any],
    selected_columns: Optional[List[Dict[str, Any]]] = None,
    scope: str = "project"
) -> str:
    """
    Generates the C# source code for a Watchdog script.
    """
    # 1. Generate the standard query code
    query_code = query_service.generate_query_code(category_name, root_group, selected_columns=selected_columns or [], scope=scope)
    
    # Split logic into filtering and output parts BEFORE indentation
    raw_logic = query_code["logic"]
    if "// 2. Output Results" in raw_logic:
        filtering_raw, output_raw = raw_logic.split("// 2. Output Results", 1)
        output_raw = "// 2. Output Results" + output_raw
    else:
        filtering_raw = raw_logic
        output_raw = ""

    def indent_block(code: str, indent_level: int) -> str:
        prefix = " " * indent_level
        lines = []
        for line in code.splitlines():
            if line.strip():
                lines.append(f"{prefix}{line}")
            else:
                lines.append("")
        return "\n".join(lines)

    # Indent the blocks for their respective locations
    filtering_code = indent_block(filtering_raw.strip(), 4)
    # output_code used in 'table' case (depth 8)
    table_output = indent_block(output_raw.strip(), 8)
    # manual_run_output used in 'else -> if string.IsNullOrEmpty' (depth 12)
    manual_run_output = indent_block(output_raw.strip(), 12)
    
    helpers = query_code["helpers"]
    
    # Clean params with strict 4-space indentation
    params_class_content = indent_block(query_code["params"].strip(), 4)
    
    # Construct the Watchdog script with Allman style (brace-down)
    desc_str = description or f"Sentinel for {category_name}"
    return f"""// Watchdog: {desc_str}
// Generated from Visual Query Builder
Watchdog(() =>
{{
    Params p = new();

{filtering_code}

    // --- Actions & Reporting ---
    string action = ExecutionGlobals.Get<string>("__sentinel_action__")?.ToLowerInvariant() ?? string.Empty;

    if (action == "select")
    {{
        Select(elements);
    }}
    else if (action == "isolate")
    {{
        Transact("Isolate Sentinel Results", () => Isolate(elements));
    }}
    else if (action == "table")
    {{
{table_output}
    }}
    else
    {{
        // Background Reporting (or Manual Gallery Run)
        if (elements.Count > 0)
        {{
            WatchdogReport($"Found {{elements.Count}} elements matching '{name}'", "warning", elements.Select(el => el.Id).ToList());
        }}
        else
        {{
            WatchdogReport("No elements match '{name}'", "success");
        }}

        // If running manually in Gallery (no action), also show results
        if (string.IsNullOrEmpty(action))
        {{
{manual_run_output}
        }}
    }}
}});

{helpers}

public class Params
{{
    #region Generated Parameters
{params_class_content}
    #endregion
}}
"""

async def generate_watchdog_script(
    name: str, 
    description: str,
    target_folder: str,
    category_name: str, 
    root_group: Dict[str, Any], 
    selected_columns: Optional[List[Dict[str, Any]]] = None,
    scope: str = "project"
) -> Dict[str, Any]:
    """
    Generates and saves a Watchdog script.
    """
    script_content = await generate_watchdog_script_content(name, description, category_name, root_group, selected_columns, scope)

    # 4. Save the script
    clean_name = "".join(x for x in name if x.isalnum() or x in " _-")
    script_path = os.path.join(target_folder, clean_name)
    
    # Ensure source folder exists
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)
        
    actual_script_folder = os.path.join(script_path, "Scripts")
    if not os.path.exists(actual_script_folder):
        os.makedirs(actual_script_folder)
        
    file_path = os.path.join(actual_script_folder, f"{clean_name}.cs")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(script_content)
        
    # V5: Fetch full metadata so frontend can select and scroll
    try:
        all_scripts = await script_service.get_all_scripts(target_folder)
        new_script = next((s for s in all_scripts if s["absolutePath"].replace('\\', '/') == script_path.replace('\\', '/')), None)
        if new_script:
            return {
                "success": True,
                "script": new_script
            }
    except Exception as e:
        logger.error(f"[QueryToWatchdog] Failed to fetch script metadata: {e}")

    return {
        "success": True,
        "path": script_path.replace('\\', '/'),
        "file_path": file_path.replace('\\', '/')
    }

    return {
        "success": True,
        "path": script_path.replace('\\', '/'),
        "file_path": file_path.replace('\\', '/')
    }
