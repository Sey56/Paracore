"""
System prompt for generating CoreScript-compatible Revit API scripts.
Adapted from RAssistant for use with CoreScript.Engine.
"""

from typing import List, Dict, Optional

def get_corescript_generation_prompt(
    user_task: str, 
    previous_attempts: Optional[List[Dict[str, str]]] = None
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
    
    return f"""Generate Revit API 2025 C# code for CoreScript.Engine.

CORE RULES:
1. **Output Method Selection**:
   - **DEFAULT**: Use `Println($"Message {{variable}}")` for ALL console output. It acts like `Console.WriteLine`.
   - **ONLY use `Show()`** when the user EXPLICITLY requests a "table", "grid", or "structured data view".
   - **FORBIDDEN**: Do NOT use `Print` (does not exist). Use `Println`.
   - **FORBIDDEN**: Do NOT use the ❌ emoji. Use 🚫 or ⚠️ instead.
2. **"Select" Semantics**:
   - If the user asks to "Select" elements (e.g., "Select all walls"), they mean **Visual Selection** in the Revit UI.
   - **ACTION**: Use `UIDoc.Selection.SetElementIds(elementIds)` at the end of the script.
   - **Do NOT** use `Show()` or print long lists for selection tasks unless specifically asked to "List" them.
3. **Structure**: Single-file .cs with Top-Level Statements.
   - **ORDER IS CRITICAL**:
     1. `using` statements.
     2. **Top-Level Statements** (Variables, Logic, Methods).
     3. **Class Definitions** (MUST be at the very bottom, after ALL top-level statements).
     4. **NEVER** define classes before or inside top-level statements.
4. **Revit 2025 API Specifics**:
   - **Use `ElementId.Value`** (long). **FORBIDDEN**: `ElementId.IntegerValue` (Obsolete).
5. **Casting**: ALWAYS use `.Cast<Type>()` after `FilteredElementCollector.OfClass(typeof(Type))`.
6. **Parameters (V3 System)**:
   - **Reference**: Follow patterns in `Validation_Demo.cs` (The ULTIMATE reference).
   - **Attribute Choice**: 
     - Use `[RevitElements]` for ANYTHING extracted from Revit (Views, Levels, WallTypes, Symbols, etc.).
     - Use `[ScriptParameter]` ONLY for static script settings (Modes, Suffixes, hardcoded lists).
   - **Dynamic Data (CRITICAL)**:
     - ONLY `[RevitElements]` supports dynamic "Compute/Sync" from Revit.
     - If you need a dropdown populated from the Revit document, you **MUST** use `[RevitElements]`.
   - **Magic Extraction (CRITICAL)**:
     - `[RevitElements(TargetType = "WallType")]` automatically fetches all wall types.
     - **REQUIRED**: If you provide `Category`, you **MUST** also provide `TargetType` (e.g., `[RevitElements(Category = "Doors", TargetType = "FamilySymbol")]`).
   - **Attribute Syntax (CRITICAL)**:
     - **FORBIDDEN**: Do NOT use `Required = true` inside `[ScriptParameter]` or `[RevitElements]`.
     - **FORBIDDEN**: Do NOT use `Description = "..."` inside any attribute.
     - **CORRECT**: Use `[Attribute, Required]` (comma separated) or `[Required]` on a new line.
     - **CORRECT**: Use `/// <summary>Description</summary>` above the property for descriptions.
   - **Proactive Validation**: ALWAYS add `[Required]` to any parameter that is essential for the script's logic (e.g., search strings, target levels, mandatory dimensions).
   - **Custom Filtering**: If magic extraction is not enough, use the `_Filter` convention:
     - Define `public List<string> PropertyName_Filter() {{ ... }}` in the `Params` class.
     - **BEST PRACTICE**: Use other parameters (e.g., `SearchText`) inside the filter method instead of hard-coding strings.
   - **Access** values via `p.MyProperty`.
7. **Conciseness & Output Minimalism**:
   - **Adherence**: Provide ONLY what the user requests. If they ask to "List names", do not provide Kind, Width, Thermal Mass, etc.
   - **Show() Constraints**: Anonymous objects passed to `Show()` should be minimal. Usually just `{{ Name = x.Name, Id = x.Id.Value }}`.
   - **Readability**: Use `.Contains(p.SearchText, StringComparison.OrdinalIgnoreCase)` for string filtering. Avoid index-based matching unless necessary.

TRANSACTION RULES:
1. **Scope**: Use EXACTLY ONE `Transact(name, action)` block for ALL DB modifications.
2. **Placement**: Never place `Transact` inside loops.
3. **Efficiency**: Prepare non-DB objects (Geometry, Filters, Calculations) OUTSIDE `Transact`.
4. **Forbidden**: NO `Transact` for read-only operations (filtering/queries/selection).

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
- `Println(string)`: Console output. Supports interpolation.
- `Show(string type, object data)`: Rich structured output (Table/Grid).
- `Transact(string name, Action action)`: Database write transaction.

REQUIRED IMPORTS:
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
// DO NOT import Globals here.

{retry_context}

EXAMPLES:

1. Visual Selection ("Select X") with Magic Extraction:
```csharp
using Autodesk.Revit.DB;
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
    Println($"🚫 Level matching '{{p.LevelName}}' not found.");
    return;
}}

var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId == level.Id)
    .ToList();

if (walls.Any()) 
{{
    var ids = walls.Select(w => w.Id).ToList();
    UIDoc.Selection.SetElementIds(ids);
    Println($"✅ Selected {{ids.Count}} walls on {{level.Name}}.");
}}

// 3. Class Definitions
public class Params
{{
    /// <summary>The level to filter by.</summary>
    [RevitElements(TargetType = "Level", Group = "Selection"), Required]
    public string LevelName {{ get; set; }} = "Level 1";
}}
```

2. Custom Filtering (Parameter-Driven Options):
```csharp
using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// 1. Instantiate Parameters
var p = new Params();

// 2. Top-Level Logic
Println($"Selected filtered material: {{p.TargetMaterial}}");

// 3. Class Definitions (MUST BE LAST)
public class Params
{{
    /// <summary>Text to search for in materials</summary>
    [ScriptParameter(Group = "Filtering")]
    public string MaterialSearch {{ get; set; }} = "Concrete";

    /// <summary>Pick a filtered material</summary>
    [RevitElements(TargetType = "Material", Group = "Design"), Required]
    public string TargetMaterial {{ get; set; }}

    // CUSTOM FILTER CONVENTION: PropertyName_Filter
    // Drives TargetMaterial options dynamically using MaterialSearch value
    public List<string> TargetMaterial_Filter()
    {{
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Material))
            .Cast<Material>()
            .Where(m => m.Name.Contains(MaterialSearch, StringComparison.OrdinalIgnoreCase))
            .Select(m => m.Name)
            .ToList();
    }}
}}
```

3. Standard Creation (Clean Transaction + Combined Attributes):
```csharp
using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// 1. Instantiate Parameters
var p = new Params();

// 2. Preparation (Top-Level Logic)
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
    Println("🚫 Missing required elements.");
    return;
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
    /// <summary>Target Level</summary>
    [RevitElements(TargetType = "Level", Group = "Reference"), Required]
    public string LevelName {{ get; set; }} = "Level 1";

    /// <summary>Wall Type to use</summary>
    [RevitElements(TargetType = "WallType", Group = "Reference"), Required]
    public string WallTypeName {{ get; set; }};

    /// <summary>Height in meters</summary>
    [Range(0.1, 20.0, 0.5), ScriptParameter(Group = "Dimensions")]
    public double WallHeight {{ get; set; }} = 3.0;
}}
```

TASK: {user_task}

Generate complete, executable code following the ORDER: Imports -> Logic -> Classes.
"""