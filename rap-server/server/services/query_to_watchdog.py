import os
from typing import Dict, Any, List, Optional
from services import query_service
from services import script_service

def generate_watchdog_script(
    name: str, 
    description: str,
    target_folder: str,
    category_name: str, 
    root_group: Dict[str, Any], 
    scope: str = "project"
) -> Dict[str, Any]:
    """
    Generates a Watchdog script from a Query Builder configuration.
    Reuses the existing query generation logic to ensure identical filtering behavior.
    """
    
    # 1. Generate the standard query code
    # We pass empty selected_columns because we'll add our own Watchdog reporting
    query_code = query_service.generate_query_code(category_name, root_group, selected_columns=[], scope=scope)
    
    raw_logic = query_code["logic"]
    helpers = query_code["helpers"]
    params_class_content = query_code["params"]
    
    # 3. Construct the Watchdog script
    # We include the FULL raw_logic (Filtering + Table Output) so the user can test manually.
    # Then we append the WatchdogReport part.
    script_content = f"""using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Watchdog: {description}
// Generated from Visual Query Builder
Watchdog(() => 
{{
    Params p = new();
    
    {raw_logic}
    
    // --- Background Watchdog Reporting ---
    // (This part handles the persistent dashboard reporting)
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
{params_class_content}
}}
"""

    # 4. Save the script
    # We use the existing script creation logic to handle file writing and folder management
    # But we bypass the template system and write content directly
    
    clean_name = "".join(x for x in name if x.isalnum() or x in " _-")
    script_path = os.path.join(target_folder, clean_name)
    
    # Ensure source folder exists
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)
        
    # Create the script folder structure (standard Paracore script)
    # /Scripts/ScriptName.cs
    actual_script_folder = os.path.join(script_path, "Scripts")
    if not os.path.exists(actual_script_folder):
        os.makedirs(actual_script_folder)
        
    file_path = os.path.join(actual_script_folder, f"{clean_name}.cs")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(script_content)
        
    return {
        "success": True,
        "path": script_path,
        "file_path": file_path
    }
