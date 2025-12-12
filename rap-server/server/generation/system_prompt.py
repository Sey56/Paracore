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
   - **DEFAULT**: Use `Println()` for ALL console output (status messages, counts, simple lists).
   - **ONLY use `Show()`** when the user EXPLICITLY requests a "table", "grid", or "structured data view".
   - If the user says "list X" without mentioning "table", use `Println()` only.
   - **FORBIDDEN**: Do NOT use the ❌ emoji. Use 🚫 or ⚠️ instead.
2. **Structure**: Single-file .cs with Top-Level Statements.
3. **Classes**: User-defined classes must come AFTER all top-level statements.
4. **Execution**: Use `return` for early exits if needed (e.g., if input validation fails).
5. **Casting**: ALWAYS use `.Cast<Type>()` after `FilteredElementCollector.OfClass(typeof(Type))`.
6. **Parameters**: Extract hardcoded values (names, sizes, counts) into top-level variables. Place `// [Parameter]` attribute explicitly **ABOVE** the variable declaration.

TRANSACTION RULES:
1. **Scope**: Use EXACTLY ONE `Transact(name, action)` block for ALL DB modifications.
2. **Placement**: Never place `Transact` inside loops.
3. **Efficiency**: Prepare non-DB objects (Geometry, Filters, Calculations) OUTSIDE `Transact`.
4. **Forbidden**: NO `Transact` for read-only operations (filtering/queries).

FILTERING RULES:
When filtering elements in Revit, use `FilteredElementCollector` with `Doc` based on the element type:
- **System Families** (e.g., walls, floors, levels): Use `OfClass(typeof(<Type>))`. 
  Example: `var walls = new FilteredElementCollector(Doc).OfClass(typeof(Wall)).Cast<Wall>().ToList();`
- **Instance Families** (e.g., doors, windows):
  - For family symbols: Use `OfCategory(BuiltInCategory.<Category>)` with `OfClass(typeof(FamilySymbol))`.
    Example: `var doorSymbols = new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Doors).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().ToList();`
  - For instances: Use `OfCategory(BuiltInCategory.<Category>)` with `WhereElementIsNotElementType()`.
    Example: `var doors = new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Doors).WhereElementIsNotElementType().Cast<FamilyInstance>().ToList();`
- **Always use `.ToList()`** after casting to materialize the collection.

GEOMETRY VALIDATION:
Before creating elements with geometric definitions (e.g., walls, floors, roofs):
- Ensure curves (e.g., `Line`, `Arc`) have length > 0.0026 ft: `startPoint.DistanceTo(endPoint) > 0.0026`
- Interpret 'vertical wall' as along y-axis, 'horizontal wall' as along x-axis in XY plane at level elevation unless specified.
- Convert units to feet with `UnitUtils.ConvertToInternalUnits(value, UnitTypeId.<Unit>)`. Assume meters unless specified.
- For closed loops (e.g., roofs), ensure `CurveLoop.Create(profile).HasPlane()`.
- If invalid, use `Println()` with failure message (e.g., 'Failed to create walls - invalid geometry.').

UNIT HANDLING:
- Revit uses feet internally. Convert with `UnitUtils.ConvertToInternalUnits(value, UnitTypeId.<Unit>)` (e.g., `UnitTypeId.Meters`).
- Assume meters unless specified (e.g., '2400 centimeters' uses `UnitTypeId.Centimeters`).

READING PROJECT UNITS:
- **CRITICAL**: Do NOT use `DisplayUnitType` (obsolete in 2025) or `FormatOptions.DisplayUnits` (doesn't exist).
- Get project units: `Units units = Doc.GetUnits();`
- Get format for a spec: `FormatOptions opts = units.GetFormatOptions(SpecTypeId.<Spec>);` (e.g., `SpecTypeId.Length`)
- Get unit type: `ForgeTypeId unitType = opts.GetUnitTypeId();`
- Get display name: `string name = UnitUtils.GetTypeCatalogStringForUnit(unitType);`
- Common specs: `SpecTypeId.Length`, `SpecTypeId.Area`, `SpecTypeId.Volume`, `SpecTypeId.Angle`
- Example:
  ```csharp
  Units units = Doc.GetUnits();
  FormatOptions lengthOpts = units.GetFormatOptions(SpecTypeId.Length);
  ForgeTypeId lengthUnit = lengthOpts.GetUnitTypeId();
  string lengthName = UnitUtils.GetTypeCatalogStringForUnit(lengthUnit);
  Println($"Length: {{lengthName}}");
  ```


CODE STRUCTURE:
- **Avoid deep nesting**: Use early checks with `Println()` to flatten code (e.g., `if (element == null) {{ Println("Element not found."); }}` then skip further processing).
- **Modern C# features**: Use `?.`, `??`, pattern matching (e.g., `if (Doc.GetElement(id) is Wall wall)`).

CREATION GUIDANCE:

### CREATING WALLS ###
- Straight: `Wall.Create(doc, Line.CreateBound(start, end), levelId, false)`. Set `structural = false`.
- Circular: Use `Arc.Create(center, radius, startAngle, endAngle, xAxis, yAxis)` then `Wall.Create(doc, arc, levelId, false)`.
- Validate `startPoint.DistanceTo(endPoint) > 0.0026` before creation.

### CREATING ROOFS ###
- **CRITICAL**: Use `CurveArray`, NOT `CurveLoop` or `CurveLoop.Create()`.
- Perform all geometry setup OUTSIDE the `Transact` block:
  ```csharp
  var profile = new CurveArray();
  profile.Append(Line.CreateBound(p1, p2));
  profile.Append(Line.CreateBound(p2, p3));
  profile.Append(Line.CreateBound(p3, p4));
  profile.Append(Line.CreateBound(p4, p1));
  ```
- Get `RoofType` OUTSIDE the `Transact` block:
  ```csharp
  RoofType roofType = new FilteredElementCollector(Doc)
      .OfClass(typeof(RoofType))
      .Cast<RoofType>()
      .FirstOrDefault();
  ```
- Use the correct overload with `out` parameter:
  ```csharp
  Transact("Create Roof", () =>
  {{
      ModelCurveArray curves = new ModelCurveArray();
      doc.Create.NewFootPrintRoof(profile, level, roofType, out curves);
  }});
  ```
- For setting slopes, use `roof.set_DefinesSlope(modelCurve, true)` and `roof.set_SlopeAngle(modelCurve, angleInRadians)` on the ModelCurves from the `out` parameter.

GLOBALS (IMPLICITLY AVAILABLE - DO NOT IMPORT):
- **IMPORTANT**: The following are available EVERYWHERE (Top-Level, Methods, Classes).
- **DO NOT** add `using CoreScript.Engine.Globals` or `using static ...`. It causes ambiguity errors.
- `Doc`, `UIDoc`, `UIApp`: Revit API access.
- `Println(string)`: Console output for messages, counts, and simple text lists.
- `Show(string type, object data)`: Rich structured output (USE SPARINGLY - only when explicitly requested).
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

1. Read-Only (simple list with Println only):
```csharp
using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Top-Level Statements
var wallTypes = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .ToList();

Println($"Found {{wallTypes.Count}} wall types:");
foreach (WallType wt in wallTypes)
{{
    Println($"  - {{wt.Name}} ({{wt.FamilyName}}, {{wt.Kind}})");
}}
```

2. Read-Only (listing parameters with Println only):
```csharp
using Autodesk.Revit.DB;
using System.Linq;

// Top-Level Statements
Wall? wall = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>() // Rule 5: Explicit Cast
    .FirstOrDefault();

if (wall != null)
{{
    Println($"Parameters for wall '{{wall.Name}}':");
    foreach (Parameter param in wall.Parameters)
    {{
        string value = param.AsValueString() ?? param.AsString() ?? "(null)";
        Println($"  - {{param.Definition.Name}}: {{value}} ({{param.StorageType}})");
    }}
}}
else
{{
    Println("No wall found.");
}}
```

3. Standard Creation (Clean Transaction):
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
    Println("🚫 Missing Level 1 or WallType.");
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

4. Complex Logic (Class Support - Spiral House):
```csharp
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

// 1. Top-Level Statements
// [Parameter]
string levelName = "Level 1";
// [Parameter]
string wallTypeName = "Generic - 200mm";
// [Parameter]
double widthMeters = 10.0;
// [Parameter]
double depthMeters = 20.0;
// [Parameter]
double rotationIncrementDegrees = 5.0;

// Prepare Levels Check
var levels = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .OrderBy(l => l.Elevation)
    .ToList();

if (levels.Count == 0)
{{
    Println("🚫 No levels found in the document.");
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

5. Roof Creation (Using CurveArray - CRITICAL):
```csharp
using Autodesk.Revit.DB;
using System;
using System.Linq;

// 1. Parameters
// [Parameter]
string levelName = "Level 2";
// [Parameter]
double widthMeters = 10.0;
// [Parameter]
double depthMeters = 20.0;

// 2. Preparation (Outside Transaction)
var level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{{
    Println($"🚫 Level '{{levelName}}' not found.");
}}
else
{{
    double widthFt = UnitUtils.ConvertToInternalUnits(widthMeters, UnitTypeId.Meters);
    double depthFt = UnitUtils.ConvertToInternalUnits(depthMeters, UnitTypeId.Meters);
    
    // Define corners at level elevation
    XYZ p1 = new XYZ(-widthFt/2, -depthFt/2, level.Elevation);
    XYZ p2 = new XYZ(widthFt/2, -depthFt/2, level.Elevation);
    XYZ p3 = new XYZ(widthFt/2, depthFt/2, level.Elevation);
    XYZ p4 = new XYZ(-widthFt/2, depthFt/2, level.Elevation);
    
    // Create CurveArray (NOT CurveLoop!)
    var profile = new CurveArray();
    profile.Append(Line.CreateBound(p1, p2));
    profile.Append(Line.CreateBound(p2, p3));
    profile.Append(Line.CreateBound(p3, p4));
    profile.Append(Line.CreateBound(p4, p1));
    
    // Get RoofType
    RoofType roofType = new FilteredElementCollector(Doc)
        .OfClass(typeof(RoofType))
        .Cast<RoofType>()
        .FirstOrDefault();
    
    if (roofType == null)
    {{
        Println("🚫 No RoofType found.");
    }}
    else
    {{
        // 3. Execution (Single Transaction)
        Transact("Create Roof", () =>
        {{
            ModelCurveArray curves = new ModelCurveArray();
            FootPrintRoof roof = Doc.Create.NewFootPrintRoof(profile, level, roofType, out curves);
            
            // Optional: Set slopes on edges
            foreach (ModelCurve mc in curves)
            {{
                roof.set_DefinesSlope(mc, true);
                roof.set_SlopeAngle(mc, 30.0 * Math.PI / 180.0); // 30 degrees in radians
            }}
        }});
        
        Println("✅ Roof created with slopes.");
    }}
}}
```

TASK: {user_task}

Generate complete, executable code following all rules.
"""