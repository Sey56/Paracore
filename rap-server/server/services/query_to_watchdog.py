import os
from typing import Dict, Any, List, Optional
from services import query_service
from services import script_service

async def generate_watchdog_script_content(
    name: str,
    description: str,
    category_name: str,
    root_group: Dict[str, Any],
    scope: str = "project"
) -> str:
    """
    Generates the C# source code for a Watchdog script.
    """
    # 1. Generate the standard query code
    query_code = query_service.generate_query_code(category_name, root_group, selected_columns=[], scope=scope)
    
    # Clean logic with strict 4-space indentation and no trailing spaces on empty lines
    logic_lines = []
    for line in query_code["logic"].splitlines():
        if line.strip():
            logic_lines.append(f"    {line}")
        else:
            logic_lines.append("")
    raw_logic = "\n".join(logic_lines)
    
    helpers = query_code["helpers"]
    
    # Clean params with strict 4-space indentation
    param_lines = []
    for line in query_code["params"].splitlines():
        if line.strip():
            param_lines.append(f"    {line}")
        else:
            param_lines.append("")
    params_class_content = "\n".join(param_lines)
    
    # Construct the Watchdog script with Allman style (brace-down)
    desc_str = description or f"Sentinel for {category_name}"
    return f"""// Watchdog: {desc_str}
// Generated from Visual Query Builder
Watchdog(() =>
{{
    Params p = new();

{raw_logic}

    // --- Actions & Reporting ---
    if (elements.Count > 0)
    {{
        WatchdogReport($"Found {{elements.Count}} elements matching '{name}'", "warning", elements.Select(el => el.Id).ToList());
    }}
    else
    {{
        WatchdogReport("No elements match '{name}'", "success");
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
    scope: str = "project"
) -> Dict[str, Any]:
    """
    Generates and saves a Watchdog script.
    """
    script_content = await generate_watchdog_script_content(name, description, category_name, root_group, scope)

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
        print(f"[QueryToWatchdog] Failed to fetch script metadata: {e}")

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
