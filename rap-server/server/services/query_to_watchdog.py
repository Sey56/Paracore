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
    # We pass empty selected_columns because Watchdogs don't need to report data tables
    query_code = query_service.generate_query_code(category_name, root_group, selected_columns=[], scope=scope)
    
    raw_logic = query_code["logic"]
    helpers = query_code["helpers"]
    
    # 2. Extract only the filtering logic (remove Table setup)
    # The standard generator separates filtering and output with "// 2. Output Results"
    if "// 2. Output Results" in raw_logic:
        filtering_logic = raw_logic.split("// 2. Output Results")[0].strip()
    else:
        # Fallback if the marker is missing (unlikely given current implementation)
        filtering_logic = raw_logic
        
    # 3. Construct the Watchdog script
    # We use ToElementIds() for performance instead of casting to full Elements
    
    script_content = f"""using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Watchdog: {description}
// Generated from Visual Query Builder
Watchdog(() => 
{{
    {filtering_logic}
    
    // Optimized: Get IDs only for reporting
    var elementIds = collector.ToElementIds();

    if (elementIds.Count > 0)
    {{
        WatchdogReport($"Found {{elementIds.Count}} elements matching '{name}'", "warning", elementIds.ToList());
    }}
    else
    {{
        WatchdogReport("No elements match '{name}'", "success");
    }}
}});

{helpers}
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
