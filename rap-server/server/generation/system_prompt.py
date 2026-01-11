"""
System prompt for generating CoreScript-compatible Revit API scripts.
Adapted from RAssistant for use with CoreScript.Engine.
"""

from typing import List, Dict, Optional

def get_corescript_generation_prompt(
    user_task: str, 
    previous_attempts: Optional[List[Dict[str, str]]] = None,
    multi_file: bool = False
) -> str:
    """
    Generates the system prompt for CoreScript generation.
    
    Args:
        user_task: The user's natural language task description
        previous_attempts: Optional list of previous failed attempts, each with 'code' and 'error'
    
    Returns:
        Complete system prompt for LLM
    """
    
    retry_context = ""
    if previous_attempts and len(previous_attempts) > 0:
        retry_context = "\nPREVIOUS ATTEMPTS THAT FAILED:\n"
        for i, attempt in enumerate(previous_attempts, 1):
            retry_context += f"\n--- Attempt {i} ---\n"
            retry_context += f"```csharp\n{attempt['code']}\n```\n"
            retry_context += f"Error: {attempt['error']}\n"
        
        retry_context += "\nDo NOT repeat any of the above failed approaches. Analyze the errors and generate a DIFFERENT solution.\n"
    
    architecture_rules = ""
    if multi_file:
        architecture_rules = """3. **Structure**: MULTI-FILE Modularized Script.
   - **Modularization**: You are encouraged to split the script into multiple logical files (max 5).
   - **Formatting**: For EVERY file, start with a header like `File: filename.cs` followed by the code block.
   - **Entry Point**: The main logic and top-level statements MUST be in `Main.cs`.
   - **Parameters**: The `Params` class MUST be placed in `Params.cs` (Recommended) or at the bottom of `Main.cs`.
   - **Naming**: The file containing `Params` must be named `Params.cs`. Other files must be named meaningfully (e.g. `GeometryUtils.cs`), NOT `module_X.cs`."""
    else:
        architecture_rules = """3. **Structure**: SINGLE-FILE Consolidated Script.
   - **Consolidation**: You **MUST** cram all logic, utility methods, and classes into this ONE output.
   - **Formatting**: Simply return one `csharp` code block.
   - **ORDER**: 1. using, 2. Top-Level Statements, 3. Class Definitions (Params MUST be last)."""

    return f"""Generate Revit API 2025 C# code for CoreScript.Engine.

CORE RULES:
1. **Output Method Selection**:
   - **DEFAULT**: Use `Println($"Message {{variable}}")` for ALL console output.
   - **ONLY use `Show()`** for tables/grids.
   - **FORBIDDEN**: Do NOT use `Print` or the ❌ emoji.
2. **"Select" Semantics**: Use `UIDoc.Selection.SetElementIds(elementIds)` at the end.
{architecture_rules}
4. **Revit 2025 API Specifics**:
   - **Use `ElementId.Value`** (long). **FORBIDDEN**: `ElementId.IntegerValue`.
   - Ensure all API calls are compatible with .NET 8.
5. **Error Handling & Early Exits**:
   - **CRITICAL**: Do NOT use the `return` keyword for early exits on errors.
   - Instead, `throw new Exception("Clear error message")`.
   - This allows the Paracore engine to correctly flag the run as "Failed" in the console, instead of a misleading "Success" status.
6. **Casting & Filtering (CRITICAL)**:
   - **ALWAYS** use `.Cast<Type>()` after `FilteredElementCollector`.
   - **FORBIDDEN**: `OfClass(typeof(Room))` causes an API error.
   - **CORRECT**: Use `OfCategory(BuiltInCategory.OST_Rooms)` for Rooms.
   - **CORRECT**: Use `OfCategory(BuiltInCategory.OST_Materials)` for Materials.
   - **General Rule**: If `typeof(T)` fails, use `OfCategory(BuiltInCategory.OST_T)`.
7. **Parameters (V2 Engine)**:
   - **Definition**: All parameters MUST be in `public class Params`.
   - **File Location**: Bottom of `Main.cs` OR in dedicated `Params.cs`.
   - **Grouping (Zero Boilerplate)**: Use `#region GroupName` ... `#endregion` to automatically group UI inputs.

   **Supported Attributes**:
   - `[RevitElements]`: For Revit objects (Walls, Sheets, Rooms).
     - Example: `[RevitElements(TargetType="Room")]`
     - Example: `[RevitElements(TargetType="FamilySymbol", Category="Doors")]`
   - `[Range(min, max, step)]`: Forces a UI Slider.
   - `[Unit("unit")]`: Handles input conversion (e.g. `[Unit("mm")]`).
     - *Note*: Input is auto-converted to feet. Output (Print) must be manual.
   - `[Required]`: Marks input as mandatory.
   - `/// <summary>`: Tooltip description.

   **Dynamic Logic (Naming Conventions)**:
   - **Magic Extraction**: For simple lists (e.g. All Rooms), DO NOT define a helper. Just use `[RevitElements(TargetType="Room")]`.
   - **Custom Filtering**: Define `_Options` (returns `List<string>`) ONLY if you need specific filtering (e.g. "Rooms on Level 1").
   - `_Visible` (returns `bool`): Show/Hide logic.
   - `_Enabled` (returns `bool`): Enable/Disable logic.
   - `_Range` (returns `(double, double, double)`): Dynamic slider limits.
8. **Conciseness & Output Minimalism**:
   - **Adherence**: Provide ONLY what the user requests.
   - **Show() Constraints**: Anonymous objects passed to `Show()` should be minimal. Usually just `{{ Name = x.Name, Id = x.Id.Value }}`.
9. **Geometry Rules**:
    - **FORBIDDEN**: `Curve` does NOT have `GetBoundingBoxXYZ()`. Use `curve.GetEndPoint(0)` and `curve.GetEndPoint(1)` to calculate ranges.
    - **FORBIDDEN**: `SpatialElement` (Room) boundary location is an Enum: `SpatialElementBoundaryLocation.Finish` or `Center`.
    - **FORBIDDEN**: `SpatialElementBoundaryOptions` does NOT have a `BoundaryOffset` property in Revit 2025.
    - **FORBIDDEN**: `Floor.Create` overloads with `XYZ normal` are DEPRECATED.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId)` for architectural floors.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId, isStructural, null, 0.0)` for structural floors (last two are slopeArrow and slope).

TRANSACTION RULES:
1. **Scope**: Use EXACTLY ONE `Transact(name, action)` block for ALL DB modifications.
2. **Placement**: Never place `Transact` inside loops.
3. **Efficiency**: Prepare non-DB objects (Geometry, Filters, Calculations) OUTSIDE `Transact`.
4. **FAIL-FAST (CRITICAL)**: Do NOT use `try-catch` inside loops within a transaction.
   - Let exceptions propagate so the transaction rolls back automatically.
   - If one item fails, the whole batch should fail cleanly.
5. **Output Optimization**:
   - **FORBIDDEN**: Do NOT call `Println` inside loops that are within a `Transact` block. It floods the console and slows execution.
   - **CORRECT**: After the transaction, print ONE summary message like `Println($"✅ Created {{count}} items.");`
   - **ALLOWED**: `Println` inside loops is fine for read-only operations (filtering, selection, debugging outside transactions).

FILTERING RULES:
When filtering elements in Revit, use `FilteredElementCollector` with `Doc`:
- **System Families** (e.g., walls): `new FilteredElementCollector(Doc).OfClass(typeof(Wall)).Cast<Wall>().ToList();`
- **Instance Families** (e.g., doors):
  - Symbols: `new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Doors).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().ToList();`
  - Instances: `new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Doors).WhereElementIsNotElementType().Cast<FamilyInstance>().ToList();`

GEOMETRY VALIDATION:
- Ensure curves have length > 0.0026 ft: `startPoint.DistanceTo(endPoint) > 0.0026`.
- Convert units to feet with `UnitUtils.ConvertToInternalUnits(value, UnitTypeId.Meters)`. Assume meters unless specified.

GLOBALS (IMPLICITLY AVAILABLE - DO NOT IMPORT):
- `Doc`, `UIDoc`, `UIApp`: Revit API access.
- `Println(string)`: Console output.
- `Show(string type, object data)`: Rich structured output.
- `Transact(string name, Action action)`: Database write transaction.

REQUIRED IMPORTS:
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;

{retry_context}

EXAMPLES:

1. Visual Selection ("Select X") with Magic Extraction:
```csharp
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

// 1. Instantiate Parameters
var p = new Params();

// 2. Logic (Read Only)
var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name.Contains(p.LevelName, StringComparison.OrdinalIgnoreCase));

if (level == null)
{{
    throw new Exception($"🚫 Level matching '{{p.LevelName}}' not found.");
}}

var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId == level.Id)
    .ToList();

if (!walls.Any()) 
{{
    throw new Exception("🚫 No walls found on the target level.");
}}

var ids = walls.Select(w => w.Id).ToList();
UIDoc.Selection.SetElementIds(ids);
Println($"✅ Selected {{ids.Count}} walls on {{level.Name}}.");

// 3. Class Definitions (Params MUST be last)
public class Params
{{
    #region Selection
    /// <summary>Target level name</summary>
    [RevitElements, Required]
    public string LevelName {{ get; set; }}
    #endregion
}}
```

2. Creation (Clean Transaction + Sliders):
```csharp
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

// 1. Instantiate Parameters
var p = new Params();

// 2. Preparation
var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name.Contains(p.LevelName, StringComparison.OrdinalIgnoreCase));

var wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(w => w.Name.Contains(p.WallTypeName, StringComparison.OrdinalIgnoreCase));

if (level == null || wallType == null)
{{
    throw new Exception("🚫 Missing required Level or WallType.");
}}

double heightFt = UnitUtils.ConvertToInternalUnits(p.WallHeight, UnitTypeId.Meters);
var line = Line.CreateBound(XYZ.Zero, new XYZ(10, 0, 0));

// 3. Execution (Single Transaction)
Transact("Create Wall", () =>
{{
    Wall.Create(Doc, line, wallType.Id, level.Id, heightFt, 0, false, false);
}});

Println("✅ Wall created.");

// 4. Class Definitions
public class Params
{{
    // Zero Boilerplate: Properties are automatically parameters
    
    // 1. Automatic Unit Conversion using [Unit] attribute (Standard C#)
    // Variable holds Internal Units (Feet), UI shows 1000 mm
    // NOTE: For DISPLAY/OUTPUT, you must manually convert FROM feet using UnitUtils.
    [Unit("mm")]
    public double Width {{ get; set; }} = 1000; 

    [Unit("m")]
    public double Height {{ get; set; }} = 3.0;

    // 2. Dimensionless (No attribute = No conversion)
    public int WallCount {{ get; set; }} = 5;

    // 3. Validation Attributes (can be stacked)
    [Range(0, 100)]
    public int Percentage {{ get; set; }} = 50;
    
    // Convention-Based "Visible When" Logic (Property Property_Visible)
    public bool UseHeight {{ get; set; }} = true;
    public bool Height_Visible => UseHeight; // Automatically controls Height visibility
    #region Reference
    [RevitElements(TargetType = "Level"), Required]
    public string LevelName {{ get; set; }} = "Level 1";

    [RevitElements(TargetType = "WallType"), Required]
    public string WallTypeName {{ get; set; }};

    /// <summary>Only Rooms on the selected level</summary>
    [RevitElements(TargetType = "Room"), Required]
    public string RoomName {{ get; set; }}

    // Required for dynamic dropdowns
    public List<string> RoomName_Options() 
    {{
        return new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType().Cast<Room>()
            .Where(r => r.LevelId.Value == GetLevelId(LevelName)).Select(r => r.Name).ToList();
    }}
    #endregion

    #region Dimensions
    /// <summary>Height in meters</summary>
    [Range(0.5, 10.0, 0.1)]
    public double WallHeight {{ get; set; }} = 3.0;

    // Required for dynamic range sliders
    public (double min, double max, double step) WallHeight_Range => (0.1, 10.0, 0.1);
    #endregion
}}
```

TASK: {user_task}

Generate complete, executable code following the ORDER: Imports -> Logic -> Classes.
"""
