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
4. NO return statements in TOP-LEVEL code (only allowed inside methods/classes)
5. User-defined classes must come AFTER all top-level statements
6. Wrap code in ```csharp markers

{retry_context}

GLOBALS (via using static CoreScript.Engine.Globals.ScriptApi):
- Doc, UIDoc, UIApp (Revit API access)
- Println(string), Print(string)
- Show(string type, object data): Use this for rich output.
    - type: "table", "message"
    - data: List of objects (for table) or string (for message)
- Transact(string name, Action action)

REQUIRED IMPORTS:
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

EXAMPLES:

Read-only (Table Output - List Parameters):
```csharp
using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Top-Level Statements
// Find the first wall in the document
Wall? wall = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .FirstOrDefault();

if (wall != null)
{{
    // Collect parameters
    List<object> paramData = [];
    foreach (Parameter param in wall.Parameters)
    {{
        string paramName = param.Definition.Name;
        string paramValue = param.AsValueString() ?? param.AsString() ?? "(null)";
        string paramType = param.StorageType.ToString();

        paramData.Add(new
        {{
            Name = paramName,
            Value = paramValue,
            Type = paramType
        }});
    }}

    Println($"✅ Listed {{paramData.Count}} parameters from the first wall.");
    // Display in table format
    Show("table", paramData);
}}
else
{{
    Println("No wall found in the document.");
    Show("message", "No wall found in the document.");
}}
```

Write operation (Simple):
```csharp
using Autodesk.Revit.DB;
using System.Linq;

var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .FirstOrDefault(l => l.Name == "Level 1");

if (level == null)
{{
    Println("❌ Level not found.");
}}
else
{{
    Transact("Create Wall", () =>
    {{
        var line = Line.CreateBound(new XYZ(0,0,0), new XYZ(10,0,0));
        var wallType = new FilteredElementCollector(Doc)
            .OfClass(typeof(WallType))
            .FirstOrDefault();
        if (wallType != null)
            Wall.Create(Doc, line, wallType.Id, level.Id, 10, 0, false, false);
    }});
}}
```

Advanced (Class Support - Class must be at bottom):
```csharp
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

// 1. Top-Level Statements FIRST
string levelName = "Level 1";
int numTurns = 3;
double radiusMeters = 5.0;

var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{{
    Println($"❌ Level '{{levelName}}' not found.");
}}
else
{{
    Transact("Create Spiral", () =>
    {{
        // 2. Use the Class
        var creator = new SpiralCreator();
        creator.CreateSpiralWalls(Doc, (Level)level, radiusMeters, numTurns);
    }});
    
    Println("✅ Spiral created.");
}}

// 3. Class Definition LAST
public class SpiralCreator
{{
    public void CreateSpiralWalls(Document doc, Level level, double radiusMeters, int turns)
    {{
        // Return IS allowed inside methods
        if (doc == null) return;

        double radiusFt = UnitUtils.ConvertToInternalUnits(radiusMeters, UnitTypeId.Meters);
        XYZ center = XYZ.Zero;
        
        // Example Logic
        for (int i = 0; i < turns * 10; i++)
        {{
             // ... math logic ...
        }}

        // Get WallType
        WallType wt = new FilteredElementCollector(doc)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .FirstOrDefault(w => w.Kind == WallKind.Basic);
            
        if (wt != null)
        {{
            // Wall.Create(doc, line, wt.Id, level.Id, 10, 0, false, false);
        }}
        
        Println($"Created {{turns}} turns.");
    }}
}}
```

TASK: {user_task}

Generate complete, executable code following all rules.
"""
