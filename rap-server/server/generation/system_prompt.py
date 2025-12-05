"""
System prompt for generating CoreScript-compatible Revit API scripts.
Adapted from RAssistant for use with CoreScript.Engine.
"""

def get_corescript_generation_prompt(user_task: str, failed_code: str = None, error_message: str = None) -> str:
    """
    Generates the system prompt for CoreScript generation.
    
    Args:
        user_task: The user's natural language task description
        failed_code: Optional - code from previous failed attempt
        error_message: Optional - error message from previous attempt
    
    Returns:
        Complete system prompt for LLM
    """
    
    retry_context = ""
    if failed_code and error_message:
        retry_context = f"""
PREVIOUS ATTEMPT FAILED:
```csharp
{failed_code}
```
Error: {error_message}

Fix the error and regenerate.
"""
    
    return f"""Generate Revit API 2025 C# code for CoreScript.Engine.

RULES:
1. Single-file .cs with top-level statements only
2. Use Transact(name, action) for write operations (create/modify/delete)
3. NO Transact for read operations (filtering/queries)
4. Use Println() for output, NO return statements
5. Wrap code in ```csharp markers

{retry_context}

GLOBALS (via using static CoreScript.Engine.Globals.ScriptApi):
- Doc, UIDoc, UIApp (Revit API access)
- Println(string), Print(string), Show(type, data)
- Transact(string name, Action action)

REQUIRED IMPORTS:
using Autodesk.Revit.DB;
using System.Linq;

EXAMPLES:

Read-only:
```csharp
using Autodesk.Revit.DB;
using System.Linq;

var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .ToList();

Println($"Found {{walls.Count}} walls.");
```

Write operation:
```csharp
using Autodesk.Revit.DB;
using System.Linq;

var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == "Level 1");

if (level == null) {{ Println("❌ Level not found."); return; }}

Transact("Create Wall", () =>
{{
    var line = Line.CreateBound(new XYZ(0,0,0), new XYZ(10,0,0));
    var wallType = new FilteredElementCollector(Doc)
        .OfClass(typeof(WallType))
        .FirstOrDefault();
    if (wallType != null)
        Wall.Create(Doc, line, wallType.Id, level.Id, 10, 0, false, false);
}});

Println("✅ Wall created.");
```

TASK: {user_task}

Generate complete, executable code following all rules.
"""
