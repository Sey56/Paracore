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

CORE RULES:
1. **Structure**: Single-file .cs with Top-Level Statements.
2. **Classes**: User-defined classes must come AFTER all top-level statements.
3. **Execution**: No `return` statements in top-level code (allowed inside methods/classes).
4. **Casting**: ALWAYS use `.Cast<Type>()` after `FilteredElementCollector.OfClass(typeof(Type))`.
5. **Parameters**: Extract hardcoded values (names, sizes, counts) into top-level variables for easy user modification.

TRANSACTION RULES:
1. **Scope**: Use EXACTLY ONE `Transact(name, action)` block for ALL DB modifications.
2. **Placement**: Never place `Transact` inside loops.
3. **Efficiency**: Prepare non-DB objects (Geometry, Filters, Calculations) OUTSIDE `Transact`.
4. **Forbidden**: NO `Transact` for read-only operations (filtering/queries).

GLOBALS (via using static CoreScript.Engine.Globals.ScriptApi):
- `Doc`, `UIDoc`, `UIApp`: Revit API access.
- `Println(string)`: Console output.
- `Show(string type, object data)`: Rich output.
    - type: "table" -> data: `List<object>` (for data grids)
    - type: "message" -> data: `string`
- `Transact(string name, Action action)`: Database write transaction.

REQUIRED IMPORTS:
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

{retry_context}

EXAMPLES:

1. Read-Only (Listing Parameters):
```csharp
using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Top-Level Statements
Wall? wall = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>() // Rule 4: Explicit Cast
    .FirstOrDefault();

if (wall != null)
{{
    List<object> paramData = [];
    foreach (Parameter param in wall.Parameters)
    {{
        paramData.Add(new
        {{
            Name = param.Definition.Name,
            Value = param.AsValueString() ?? param.AsString() ?? "(null)",
            Type = param.StorageType.ToString()
        }});
    }}

    Println($"✅ Listed {{paramData.Count}} parameters.");
    Show("table", paramData);
}}
else
{{
    Show("message", "No wall found.");
}}
```

2. Standard Creation (Clean Transaction):
```csharp
using Autodesk.Revit.DB;
using System.Linq;

// 1. Preparation (Outside Transaction)
var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>() // Explicit Cast
    .FirstOrDefault(l => l.Name == "Level 1");

var wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault();

if (level == null || wallType == null)
{{
    Println("❌ Missing Level 1 or WallType.");
}}
else
{{
    // Geometry calculation (Outside Transaction)
    var line = Line.CreateBound(new XYZ(0,0,0), new XYZ(10,0,0));

    // 2. Execution (Single Transaction)
    Transact("Create Wall", () =>
    {{
        Wall.Create(Doc, line, wallType.Id, level.Id, 10, 0, false, false);
    }});
    
    Println("✅ Wall created.");
}}
```

3. Complex Logic (Class Support - Spiral House):
```csharp
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

// 1. Top-Level Statements
string levelName = "Level 1";
string wallTypeName = "Generic - 200mm"; // Extract parameters for easy modification!
double widthMeters = 10.0;
double depthMeters = 20.0;
double rotationIncrementDegrees = 5.0;

// Prepare Levels Check
var levels = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .OrderBy(l => l.Elevation)
    .ToList();

if (levels.Count == 0)
{{
    Println("❌ No levels found in the document.");
}}
else
{{
    // Logic: Calculate Geometry First -> Then Transact
    var houseCreator = new HouseCreator();
    houseCreator.CreateSpiralHouse(Doc, levels, wallTypeName, widthMeters, depthMeters, rotationIncrementDegrees);
    
    Println("✅ Spiral house created.");
}}

// 2. Class Definition (Must be at bottom)
public class HouseCreator
{{
    public void CreateSpiralHouse(Document doc, List<Level> levels, string wallTypeName, double width, double depth, double rotationInc)
    {{
        double widthFt = UnitUtils.ConvertToInternalUnits(width, UnitTypeId.Meters);
        double depthFt = UnitUtils.ConvertToInternalUnits(depth, UnitTypeId.Meters);
        
        // Get WallType (Read operation)
        WallType wt = new FilteredElementCollector(doc)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .FirstOrDefault(w => w.Name == wallTypeName); // Use parameter

        if (wt == null)
        {{
            wt = new FilteredElementCollector(doc)
                .OfClass(typeof(WallType))
                .Cast<WallType>()
                .FirstOrDefault(w => w.Kind == WallKind.Basic);
            Println($"⚠️ Wall Type '{{wallTypeName}}' not found. Using default '{{wt?.Name}}'");
        }}

        if (wt != null && levels.Any())
        {{
            // Execution: Single Transaction for Loop
            Transact("Create Spiral House", () =>
            {{
                double currentRotation = 0.0;

                foreach (var level in levels)
                {{
                    // Calculate Corners for Current Level
                    XYZ p1 = RotatePoint(new XYZ(-widthFt/2, -depthFt/2, 0), currentRotation);
                    XYZ p2 = RotatePoint(new XYZ(widthFt/2, -depthFt/2, 0), currentRotation);
                    XYZ p3 = RotatePoint(new XYZ(widthFt/2, depthFt/2, 0), currentRotation);
                    XYZ p4 = RotatePoint(new XYZ(-widthFt/2, depthFt/2, 0), currentRotation);

                    Line[] lines = 
                    [
                        Line.CreateBound(p1, p2), Line.CreateBound(p2, p3),
                        Line.CreateBound(p3, p4), Line.CreateBound(p4, p1)
                    ];

                    foreach(var line in lines)
                        Wall.Create(doc, line, wt.Id, level.Id, 10, 0, false, false);

                    currentRotation += rotationInc * (Math.PI / 180.0);
                }}
            }});
        }}
    }}
    
    private XYZ RotatePoint(XYZ point, double angle)
    {{
        double x = point.X * Math.Cos(angle) - point.Y * Math.Sin(angle);
        double y = point.X * Math.Sin(angle) + point.Y * Math.Cos(angle);
        return new XYZ(x, y, point.Z);
    }}
}}
```

TASK: {user_task}

Generate complete, executable code following all rules.
"""
