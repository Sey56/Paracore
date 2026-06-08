COPILOT_INSTRUCTIONS = """# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.
# If simple, keep everything in the entry file.
# If complex, create helpers in Scripts/ (Utils.cs, Models.cs, etc.).
# Use #region GroupName directives to organize parameters.

Generate C# Revit API scripts for the Paracore runtime (CoreScript.Engine).

## Code Structure (STRICT ORDER)

Scripts use **Top-Level Statements**. Order is mandatory:

```
1. using statements
2. Top-level logic (var p = new Params(); queries, Transact blocks, output)
3. Top-level helper methods (if needed)
4. Class definitions (Params class MUST be LAST)
```

## Implicit Usings

Available without explicit `using`:
`System`, `System.Collections.Generic`, `System.Linq`, `System.Text.Json`,
`System.Globalization`, `Microsoft.CSharp`, `Autodesk.Revit.DB`,
`Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`,
`Autodesk.Revit.UI`, `CoreScript.Engine.Globals`

## Available Globals

| Global | Type | Purpose |
|--------|------|---------|
| `Doc` | Document | Active Revit document |
| `UIDoc` | UIDocument | UI document for selections |
| `UIApp` | UIApplication | Revit application |
| `Println(msg)` | void | Print to output |
| `Print(msg)` | void | Print without newline |
| `Transact(name, action)` | void | Wrap modifications in a transaction |
| `SetExecutionTimeout(s)` | void | Extend default 10s timeout |
| `GetElement<T>(name)` | T? | Find element by Name |
| `GetElements<T>()` | List<T> | All elements of type T |
| `GetElements("Category")` | List<Element> | All elements of that category |
| `GetElements<T>("Category")` | List<T> | Typed + category-filtered |
| `Table(data)` | void | Render interactive data table |
| `BarChart(data)` | void | Render bar chart |
| `PieChart(data)` | void | Render pie chart |
| `LineChart(data)` | void | Render line chart |
| `Watchdog(action)` | void | **SENTINEL ONLY**: Background monitoring |
| `WatchdogReport(msg, status)` | void | **SENTINEL ONLY**: Push status report |

---

# PARACORE FLUENT METHODS (PREFERRED)

Use these FIRST. They are cleaner, shorter, and unit-aware.
Only fall back to raw Revit API when Paracore methods can't express the logic.

## Element Retrieval

```csharp
// Typed (gives .Area, .Level, etc. directly)
var rooms = GetElements<Room>();
var walls = GetElements<Wall>();
var levels = GetElements<Level>();

// Category string (generic — use GetStr/GetNum)
var columns = GetElements("Structural Columns");
var doors = GetElements("Doors");

// Typed + category filtered
var doorInstances = GetElements<FamilyInstance>("Doors");
```

## Parameters & Units

```csharp
// Reading values
el.GetStr("Comments")                    // → "Reviewed"
el.GetNum("Area", "m2")                 // → 25.46 (converted from feet)
el.GetNum("Length", "cm")               // → 360.0
el.GetVal("Comments")                   // → "Reviewed" (Revit display format)
el.GetInt("Is External")                // → 1

// Writing values (auto-transact on single elements)
el.SetVal("Comments", "Done")           // Smart setter — resolves Level names, etc.
el.SetVal("Level", "Level 2")           // Resolves ElementId automatically
el.SetNum("Offset", -150, "cm")         // Unit-aware: converts cm → internal feet

// Unit strings: "m" "cm" "mm" "ft" "in" | "m2" "sqm" "ft2" "sqft" | "m3" "cum" "ft3" "cuft"
// Manual unit conversion on values:
var areaM2 = val.OutputUnit("m2", 2);   // internal feet → display unit
var input = 5000.InputUnit("mm");       // user unit → internal feet

// BANNED:
// - UnitType.SquareMeters, OutputUnit.SquareMeters, "Square Meters", "Cubic Meters"
// - Manual conversion math (multiply by 0.3048, etc.) — ALWAYS use unit arguments
```

## Filtering & Sorting

```csharp
// Filter by parameter value
walls.WhereParam("Base Constraint", "Level 1")
walls.WhereParam("Length", ">", 3000, "mm")
walls.WhereParam("Mark", "starts", "D-")

// Fuzzy name match
elements.WhereMatches("Single-Flush")

// Doors only (excludes curtain-wall doors)
doors.StandardOnly()

// Sort
walls.OrderByParam("Length")
rooms.OrderByParamDesc("Area")
```

## Grouping & Aggregation

```csharp
// Group + count → Group | Count
GetElements("Doors").GroupByParam("Level")

// Group + sum → Group | Count | Total
GetElements("Rooms").GroupByParam("Level", "Area", "m2")
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m")

// Sum only (returns double)
walls.SumParam("Length", "m")
```

## Bulk Write (collection-level, single transaction)

```csharp
// Set parameter on entire filtered collection
walls.WhereParam("Base Constraint", "Level 01")
     .SetParam("Comments", "Reviewed")
     .SetParam("Top Offset", -150, "cm");

// Delete / Hide / Unhide / Isolate
elements.WhereMatches("TEMP").Delete();
elements.WhereParam("Mark", "starts", "OLD").Hide();
```

## Visualization

```csharp
// Table — ALWAYS use .Select() to pick explicit columns
walls.WhereParam("Base Constraint", "Level 1")
     .Select(w => new {
         Id = w.Id,
         Name = w.Name,
         Length = w.GetNum("Length", "cm")
     })
     .Table();

// GroupByParam chains directly to Table/Chart — no .Select() needed
GetElements("Doors").GroupByParam("Level").Table();
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").PieGraph();

// BANNED: .Table() without .Select() on non-GroupByParam results
//  ✗ GetElements("Walls").Table()       ← dumps hundreds of columns
//  ✗ walls.WhereParam(...).Table()      ← same problem
```

## Element Creation (Raw Revit API in Transact)

```csharp
var lvl = GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1");
var wallType = GetElements<WallType>().FirstOrDefault(t => t.Name == "Generic - 200mm");
var point = new XYZ(5000.InputUnit("mm"), 3000.InputUnit("mm"), 0);

Transact("Place Wall", () => {
    var wall = Wall.Create(Doc, Line.CreateBound(point,
        new XYZ(point.X + 4000.InputUnit("mm"), point.Y, 0)), lvl.Id, false);
    wall.WallType = wallType;
});

// Family instance
var symbol = GetElements<FamilySymbol>("Desk").FirstOrDefault();
Transact("Place Family", () =>
    Doc.Create.NewFamilyInstance(point, symbol, lvl, StructuralType.NonStructural));
```

## Diagnostics & Discovery

```csharp
el.CombinedParams().Table()       // All instance + type params (Scope|Name|Storage|Value)
el.Peek()                         // Full parameter audit
el.BuiltInParams().Table()        // BuiltIn parameter IDs
el.GeometrySummary().Table()      // Geometry breakdown
GetMagicNames()                   // All available category/class/family names
```

## Door/Window Helpers

```csharp
fi.RoomFrom()          // Room name on non-swing side
fi.RoomTo()            // Room name door swings into
fi.RoomAccess()        // Access room
fi.RoomDestination()   // Destination room
fi.Handing()           // "LH", "RH", "LHR", "RHR"
fi.HingeSide()         // "Left" or "Right"
fi.IsHandFlipped()     // bool
fi.IsFacingFlipped()   // bool
fi.IsStandardDoor()    // bool (excludes curtain-wall doors)
```

## Miscellaneous

```csharp
// Identity
el.FamilyName()
el.Matches("pattern")
id.ToElement(Doc)

// Select in Revit UI / Zoom / Isolate
elements.Select()
elements.Zoom()
elements.Isolate()

// Eco analysis
Eco.GetCarbon(el)
Eco.GetUValue(el)
Eco.GetWeather()

// Coordination
sources.AuditClashes("Pipes")
sources.AuditClashes("Pipes", "5mm")
Doc.ClearClashHelpers()

// Notebook export
elements.ToNotebook("MyAnalysis")

// Numeric helpers
value.IsAlmostEqualTo(other)
value.IsGreaterThan(other)
value.AlmostZero()
```

---

# RAW REVIT API (Fallback)

Use when Paracore methods don't cover the use case (complex grouping, multi-level queries, direct Revit API calls):

```csharp
// Element retrieval
var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall)).Cast<Wall>().ToList();

var doors = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Doors)
    .WhereElementIsNotElementType().ToElements();

// Parameter access
var level = wall.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)
    ?.AsValueString();
var length = wall.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)
    ?.AsDouble();

// Writing parameters
wall.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set("Reviewed");

// ElementId: use .Value (long) — IntegerValue is FORBIDDEN in Revit 2025+
var id = element.Id.Value;
```

---

# PARAMS CLASS (Editable Parameters)

All user-configurable values go in `public class Params` at the BOTTOM of the file.

**STRICT RULES:**
1. `Params` is the ONLY class the engine scans for UI parameters
2. Properties must be flat — no nested objects
3. Instantiate at the top: `var p = new Params();`
4. Access via instance: `p.MyLevel`, never `Params.MyLevel`

## Property Types

| C# Type | UI Control |
|---------|-----------|
| `string` | Text input |
| `int` | Numeric field |
| `double` | Numeric field |
| `bool` | Toggle |
| `Level` | Dropdown of all levels |
| `WallType` | Dropdown of all wall types |
| `Wall`, `Room`, etc. | Dropdown of instances |
| `FamilySymbol` | Dropdown of family types |
| `FamilyInstance` | Dropdown of instances |
| `ViewSheet`, `View` | Dropdown of views |
| `Material` | Dropdown of materials |
| `BuiltInCategory` | Searchable enum dropdown |
| `BuiltInParameter` | Searchable enum dropdown |
| `List<T>` | Multi-select checkboxes |

## Attributes

| Attribute | Purpose |
|-----------|---------|
| `[Unit("mm")]` | Metric conversion (keys: mm, cm, m, in, m2, sqm, m3, cum) |
| `[Range(0, 100, 5)]` | Slider bounds |
| `[Required]` | Mandatory field |
| `[Confirm("DELETE")]` | Safety lock for destructive ops |
| `[Select(SelectionType.Element)]` | Pick from Revit viewport |
| `[Select(SelectionType.Point)]` | Pick a point in Revit |
| `[EnabledWhen(nameof(Prop), "value")]` | Conditional enable |
| `[RevitElements(Category="Doors")]` | Filter by category |
| `[InputFile("csv,xlsx")]` | File open dialog |
| `[OutputFile("xlsx")]` | File save dialog |
| `[FolderPath]` | Folder browser |
| `[Color]` | Color picker |
| `[Stepper]` | +/- buttons for int |
| `[Segmented]` | Button group for string |

**UNIT RULES:**
- NEVER use `[Unit]` for imperial (feet, sqft, cuft) — redundant
- Only use: `mm`, `cm`, `m`, `in`, `m2`, `sqm`, `m3`, `cum`
- NEVER use `sf`, `sq`, `ft`, `ft2`, `sqft`

## Data Providers (Suffix Conventions)

```csharp
// Custom dropdown options
public List<WallType> WallType_Options => GetElements<WallType>()
    .Where(t => t.Name.Contains("Generic")).ToList();

// Conditional visibility
public bool ShowAdvanced_Visible => IsActive;

// Dynamic range
public (double, double, double) Count_Range => (1, 100, 1);
```

## Complete Params Example

```csharp
public class Params
{
    #region Target

    /// Select the level to process
    [Required]
    public Level TargetLevel { get; set; }

    /// Filter walls shorter than this (cm)
    [Unit("cm")]
    [Range(0, 1000, 10)]
    public double MaxLength { get; set; } = 300;

    #endregion

    #region Action

    /// New mark value
    public string NewMark { get; set; } = "UPDATED";

    /// Apply the changes
    public bool ApplyChanges { get; set; } = false;

    #endregion
}
```

---

# CODING RULES

1. **Transactions**: One `Transact("Name", () => { ... })` block for modifications.
   `.SetParam()`, `.Delete()`, `.Hide()` on collections auto-transact — no Transact needed.
   Manual `foreach` writes: ALWAYS wrap in Transact.
2. **No Async**: NEVER use `await` or `async`. Scripts run synchronously.
3. **Target Existing File**: Write in the .cs file provided. NEVER create `Script.cs`.
4. **Early Exits**: Use `throw new Exception("msg")` instead of top-level `return`.
5. **ElementId**: Use `.Value` (long). IntegerValue is FORBIDDEN in Revit 2025+.
6. **Safety**: For destructive ops, require `[Confirm("DELETE")]`.
7. **Println after modifications**: Always Println what was changed and how many.
8. **Table() rules**:
   - `.GroupByParam().Table()` — chain directly ✓
   - `.Select(x => new {...}).Table()` — explicit columns ✓
   - `GetElements("Walls").Table()` — FORBIDDEN (hundreds of columns) ✗
9. **Column names**: Match parameter names exactly. No unit suffixes.
   - CORRECT: `Length = w.GetNum("Length", "cm")`
   - WRONG: `Length_cm = w.GetNum("Length", "cm")`
10. **Paracore methods PREFERRED** over raw Revit API when available.

---

# EXAMPLES

## Query with Table

```csharp
var p = new Params();

var rooms = GetElements<Room>()
    .WhereParam("Level", p.TargetLevel.Name)
    .WhereParam("Area", ">", p.MinArea, "m2")
    .OrderByParamDesc("Area")
    .Select(r => new {
        Id = r.Id.Value,
        Name = r.Name,
        Level = r.GetStr("Level"),
        Area = r.GetNum("Area", "m2")
    })
    .Table();

Println($"Found {rooms.Count()} rooms on {p.TargetLevel.Name} above {p.MinArea} m².");

public class Params
{
    public Level TargetLevel { get; set; }
    [Unit("m2")]
    public double MinArea { get; set; } = 15;
}
```

## Modification

```csharp
var p = new Params();

var walls = GetElements("Walls")
    .WhereParam("Base Constraint", p.SourceLevel.Name);

walls.SetParam("Top Constraint", p.TargetLevel.Name)
     .SetParam("Top Offset", p.TopOffset, "cm");

Println($"Updated {walls.Count()} walls — Top Constraint → {p.TargetLevel.Name}, Top Offset → {p.TopOffset} cm.");

public class Params
{
    [Required]
    public Level SourceLevel { get; set; }
    [Required]
    public Level TargetLevel { get; set; }
    [Unit("cm")]
    public double TopOffset { get; set; } = -150;
}
```

## Sentinel (Watchdog)

```csharp
Watchdog(() =>
{
    var p = new Params();
    var elements = new FilteredElementCollector(Doc)
        .OfCategory(p.TargetCategory)
        .WhereElementIsNotElementType()
        .ToElements();

    var breaches = elements.Count(e => e.Name.Contains("TEMP"));
    if (breaches > 0)
        WatchdogReport($"Found {breaches} temporary elements.", "warning");
    else
        WatchdogReport("Compliance verified.", "success");
});

public class Params
{
    public BuiltInCategory TargetCategory { get; set; } = BuiltInCategory.OST_Walls;
}
```

## Element Creation

```csharp
var p = new Params();
var lvl = p.TargetLevel;
var wallType = p.WallType;

XYZ start = new XYZ(0, 0, 0);
XYZ end = new XYZ(p.Length.InputUnit("mm"), 0, 0);

Transact("Create Wall", () => {
    var wall = Wall.Create(Doc, Line.CreateBound(start, end), lvl.Id, false);
    wall.WallType = wallType;
    wall.SetVal("Unconnected Height", p.Height, "cm");
});

Println($"Created wall: {wallType.Name}, {p.Length}mm long, {p.Height}cm high.");

public class Params
{
    [Required] public Level TargetLevel { get; set; }
    [Required] public WallType WallType { get; set; }
    [Unit("mm")] public double Length { get; set; } = 5000;
    [Unit("cm")] public double Height { get; set; } = 300;
}
```

---

# BANNED PATTERNS

NEVER use:
- `FilteredElementCollector` when `GetElements<T>()` works
- `BuiltInParameter` / `get_Parameter` / `.AsString()` / `.AsDouble()` when `GetStr`/`GetNum` works
- `.Where(e => e.LookupParameter(...))` — use `.WhereParam()` instead
- `.GroupBy(e => ...).Select(g => ...)` — use `.GroupByParam()` instead
- `.OrderBy(e => ...)` — use `.OrderByParam()` instead
- `Console.WriteLine`, `println`, `Print` → use `Println()`
- `foreach` + `Println` to display data → use `.Table()` instead
- `string.Join` to display element IDs → use `.Table()` instead
- `ElementId.IntegerValue` → use `.Value` (long)
- Manual unit conversion math (3.28084, 0.3048, etc.) → use unit arguments
- `OutputUnit.SquareMeters`, `UnitType.UT_Area`, "Square Meters", "Cubic Meters"
- `.Select()` chained after `.GroupByParam()` → chain `.Table()`/`.BarGraph()` directly
"""
