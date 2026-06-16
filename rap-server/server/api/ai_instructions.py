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
`Autodesk.Revit.DB`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`,
`Autodesk.Revit.UI`, `CoreScript.Engine.Globals`

## Available Globals

| Global | Type | Purpose |
|--------|------|---------|
| `Doc` | Document | Active Revit document |
| `UIDoc` | UIDocument | UI document for selections |
| `UIApp` | UIApplication | Revit application |
| `Println(msg)` | void | Print to output |
| `Transact(name, action)` | void | Wrap modifications in a transaction |
| `SetExecutionTimeout(s)` | void | Extend default 10s timeout |
| `GetElement<T>(name)` | T? | Find element by Name |
| `GetElements<T>()` | List<T> | All elements of type T |
| `GetElements("Category")` | List<Element> | All elements of that category |
| `GetElements<T>("Category")` | List<T> | Typed + category-filtered |
| `Table(data)` | void | Render interactive data table |
| `BarChart(data)` | void | Render bar chart |
| `PieChart(data)` / `LineChart(data)` | void | Charts |
| `Selection` | IList<Element> | Currently selected elements in Revit |

---

# PARACORE FLUENT METHODS (PREFERRED)

Use these FIRST. They are shorter, cleaner, and unit-aware.
Only fall back to raw Revit API when Paracore methods can't express the logic.

## Element Retrieval

```csharp
// Typed (gives .Area, .Level, etc. directly)
GetElements<Room>()
GetElements<Wall>()
GetElements<Level>()
GetElements<FamilyInstance>("Doors")    // typed + category filtered

// Category string (generic — use GetStr/GetNum for params)
GetElements("Walls")
GetElements("Structural Columns")
GetElements("Doors")
```

## Parameter name mapping (CRITICAL)

Different categories use DIFFERENT parameter names for the same concept:

| Concept | Walls | Rooms | Columns | Floors | Doors/Windows |
|---------|-------|-------|---------|--------|---------------|
| Level | `Base Constraint` | `Level` | `Base Level` | `Level` | `Level` |
| Top | `Top Constraint` | — | `Top Level` | — | — |
| Offset | `Top Offset` / `Base Offset` | — | `Top Offset` / `Base Offset` | — | — |
| Height | `Unconnected Height` | — | — | — | — |

## Parameters & Units

```csharp
// Reading values
el.GetStr("Comments")                    // → "Reviewed"
el.GetNum("Area", "m2")                 // → 25.46 (converted from feet)
el.GetNum("Length", "cm")               // → 360.0
el.GetInt("Is External")                // → 1

// Writing values (auto-transact on single elements)
el.SetVal("Comments", "Done")           // Smart setter — resolves Level names
el.SetVal("Level", "Level 2")           // Resolves ElementId automatically
el.SetNum("Offset", -150, "cm")         // Unit-aware: converts cm → internal feet

// Unit conversion on values
var areaM2 = value.OutputUnit("m2", 2);  // internal feet → display
var input = 5000.InputUnit("mm");        // user unit → internal feet

// Unit strings: "m" "cm" "mm" "ft" "in" | "m2" "sqm" "ft2" "sqft" | "m3" "cum" "ft3" "cuft"
```

**CRITICAL — [Unit] params and double conversion:**
When a `Params` property has `[Unit("mm")]`, the value is ALREADY converted to
internal feet by the time the script runs. Do NOT pass a unit argument again —
that would convert it twice:

```csharp
// CORRECT — p.LengthThreshold is already internal feet (thanks to [Unit])
walls.WhereParam("Length", "<", p.LengthThreshold)
walls.SetNum("Length", p.LengthThreshold)

// WRONG — double-converts (first [Unit], then "mm" argument)
walls.WhereParam("Length", "<", p.LengthThreshold, "mm")
```

**BANNED:**
- Manual unit conversion math (3.28084, 0.3048) — use unit arguments
- `OutputUnit.SquareMeters`, `UnitType.UT_Area`, "Square Meters", "Cubic Meters"

## Filtering & Sorting

```csharp
// Exact match
walls.WhereParam("Base Constraint", "Level 1")

// Numeric comparison
walls.WhereParam("Length", ">", 3000, "mm")
walls.WhereParam("Area", "<", 20, "m2")

// String operations
walls.WhereParam("Mark", "starts", "D-")
walls.WhereParam("Type Name", "contains", "Fire")

// Fuzzy name match
elements.WhereMatches("Single-Flush")

// Exclude curtain-wall doors
doors.StandardDoor()

// Sort
.OrderByParam("Length")
.OrderByParamDesc("Area")
```

## Grouping & Aggregation

```csharp
// Group + count → Group | Count columns
GetElements("Doors").GroupByParam("Level")

// Group + sum → Group | Count | Total columns
GetElements("Rooms").GroupByParam("Level", "Area", "m2")
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m")

// Sum only (returns double)
walls.SumParam("Length", "m")
```

## Bulk Write (collection-level, single transaction)

```csharp
// Set parameters on filtered collection
walls.WhereParam("Base Constraint", "Level 01")
     .SetParam("Comments", "Reviewed")
     .SetParam("Top Offset", -150, "cm");

// BIM-safe bulk operations
elements.WhereMatches("TEMP").Delete();
elements.WhereParam("Mark", "starts", "OLD").Hide();
elements.Unhide();
elements.Isolate();
elements.Select();     // Select in Revit UI
elements.Zoom();       // Zoom to elements
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

// GroupByParam chains directly to Table/Chart — no .Select()
GetElements("Doors").GroupByParam("Level").Table();
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").PieGraph();

// BANNED: .Table() without .Select() on non-GroupByParam results
//  ✗ GetElements("Walls").Table()       ← dumps hundreds of columns
//  ✗ walls.WhereParam(...).Table()      ← same problem
```

## Column naming for .Select() projections

Column names must EXACTLY match parameter names (underscores for spaces). NO unit suffixes.

```csharp
// CORRECT
.Select(w => new {
    Base_Constraint = w.GetStr("Base Constraint"),
    Top_Offset = w.GetNum("Top Offset", "cm"),
    Length = w.GetNum("Length", "mm")
})

// WRONG
.Select(w => new {
    BaseConstraint = w.GetStr("Base Constraint"),   // made-up name
    Top_Offset_cm = w.GetNum("Top Offset", "cm"),   // unit suffix
    Length_mm = w.GetNum("Length", "mm")            // unit suffix
})
```

## Element Creation

```csharp
var lvl = GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1");
var wallType = GetElements<WallType>().FirstOrDefault(t => t.Name == "Generic - 200mm");
var point = new XYZ(5000.InputUnit("mm"), 3000.InputUnit("mm"), 0);

// Wall
Transact("Place Wall", () => {
    var wall = Wall.Create(Doc, Line.CreateBound(point,
        new XYZ(point.X + 4000.InputUnit("mm"), point.Y, 0)), lvl.Id, false);
    wall.WallType = wallType;
    wall.SetVal("Unconnected Height", 300, "cm");
});

// Family instance (door, window, furniture, etc.)
var symbol = GetElements<FamilySymbol>("Desk").FirstOrDefault();
Transact("Place Family", () =>
    Doc.Create.NewFamilyInstance(point, symbol, lvl, StructuralType.NonStructural));
```

## Diagnostics & Discovery

```csharp
el.CombinedParams().Table()       // All instance + type params (Scope|Name|Storage|Value)
el.Peek()                         // Full parameter audit
GetMagicNames()                   // All available category/class/family names
```

## Door/Window Helpers

```csharp
fi.RoomFrom()          // Room name on non-swing side
fi.RoomTo()            // Room name door swings into
fi.Handing()           // "LH", "RH", "LHR", "RHR"
fi.HingeSide()         // "Left" or "Right"
fi.IsStandardDoor()    // Excludes curtain-wall doors
```

---

# RAW REVIT API (Fallback)

Use when Paracore methods don't cover the use case:

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

// Writing
wall.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set("Reviewed");

// ElementId: use .Value (long) — IntegerValue is FORBIDDEN in Revit 2025+
var id = element.Id.Value;
```

---

# PARAMS CLASS (Editable Parameters)

All user-configurable values go in `public class Params` at the BOTTOM of the file.

**RULES:**
1. `Params` is the ONLY class the engine scans for UI parameters
2. Properties must be flat — no nested objects
3. Instantiate at the top: `var p = new Params();`
4. Access via instance: `p.MyLevel`, never `Params.MyLevel`

## Property Types

| C# Type | UI Control |
|---------|-----------|
| `string` | Text input |
| `int` / `double` | Numeric field |
| `bool` | Toggle |
| `Level`, `WallType`, `Wall`, `Room`, etc. | Dropdown (auto-discovered) |
| `FamilySymbol`, `FamilyInstance` | Dropdown of types/instances |
| `ViewSheet`, `View`, `Material` | Dropdown |
| `BuiltInCategory`, `BuiltInParameter` | Searchable enum dropdown |
| `List<T>` | Multi-select checkboxes |

## Attributes

| Attribute | Purpose |
|-----------|---------|
| `[Unit("mm")]` | Metric conversion (keys: mm, cm, m, in, m2, sqm, m3, cum) |
| `[Range(0, 100, 5)]` | Slider with bounds |
| `[Required]` | Mandatory field |
| `[Confirm("DELETE")]` | Safety lock for destructive ops |
| `[Select(SelectionType.Element)]` | Pick from Revit viewport |
| `[EnabledWhen(nameof(Prop), "value")]` | Conditional enable |
| `[InputFile("csv,xlsx")]` / `[OutputFile("xlsx")]` | File dialogs |
| `[FolderPath]` | Folder browser |
| `[Color]` | Color swatch picker |
| `[Stepper]` | +/- buttons for int |
| `[Segmented]` | Button group for string |

**UNIT RULES:**
- NEVER use `[Unit]` for imperial (feet, sqft, cuft) — redundant. Revit IS imperial internally.
- Only use: `mm`, `cm`, `m`, `in`, `m2`, `sqm`, `m3`, `cum`
- NEVER use: `sf`, `sq`, `ft`, `ft2`, `sqft`

## Suffix Conventions

```csharp
// Custom dropdown filter
public List<WallType> WallType_Options => GetElements<WallType>()
    .Where(t => t.Name.Contains("Generic")).ToList();

// Conditional visibility
public bool ShowAdvanced_Visible => IsActive;

// Dynamic range
public (double, double, double) Count_Range => (1, 100, 1);
```

## Params Example

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

    /// New mark value to apply
    public string NewMark { get; set; } = "UPDATED";

    /// Apply the changes
    public bool ApplyChanges { get; set; } = false;

    #endregion
}
```

---

# CODING RULES

1. **Transactions**: `.SetParam()`, `.Delete()`, `.Hide()` on collections auto-transact. Manual `foreach` writes MUST wrap in `Transact("Name", () => { ... })`.
2. **No Async**: NEVER use `await` or `async`. Scripts run synchronously.
3. **Target Existing File**: Write in the .cs file provided. NEVER create `Script.cs`.
4. **ElementId**: Use `.Value` (long). IntegerValue is FORBIDDEN in Revit 2025+.
5. **Safety**: For destructive ops, require `[Confirm("DELETE")]`.
6. **Println after modifications**: Always state what was changed and how many.
7. **Unit args over manual math**: NEVER convert cm→ft or mm→m yourself. Pass unit strings.
8. **Paracore methods PREFERRED** over raw Revit API when available.

---

# EXAMPLES

## Query with Table

```csharp
var p = new Params();

GetElements<Room>()
    .WhereParam("Level", p.TargetLevel.Name)
    .WhereParam("Area", ">", p.MinArea)        // [Unit("m2")] already converted — no unit arg
    .OrderByParamDesc("Area")
    .Select(r => new {
        Id = r.Id.Value,
        Name = r.Name,
        Level = r.GetStr("Level"),
        Area = r.GetNum("Area", "m2")          // GetNum converts to display unit here
    })
    .Table();

Println($"Rooms on {p.TargetLevel.Name} above {p.MinArea.OutputUnit("m2", 1)} m².");

public class Params
{
    public Level TargetLevel { get; set; }
    [Unit("m2")]
    public double MinArea { get; set; } = 15;
}
```

## Modification (bulk write)

```csharp
var p = new Params();

var walls = GetElements("Walls")
    .WhereParam("Base Constraint", p.SourceLevel.Name);

walls.SetParam("Top Constraint", p.TargetLevel.Name)
     .SetParam("Top Offset", p.TopOffset);    // [Unit("cm")] already converted — no unit arg

Println($"Updated {walls.Count()} walls — Top Constraint → {p.TargetLevel.Name}, Offset → {p.TopOffset.OutputUnit("cm", 0)} cm.");

public class Params
{
    [Required] public Level SourceLevel { get; set; }
    [Required] public Level TargetLevel { get; set; }
    [Unit("cm")] public double TopOffset { get; set; } = -150;
}
```

## Element Creation

```csharp
var p = new Params();
var lvl = p.TargetLevel;

XYZ start = new XYZ(0, 0, 0);
XYZ end = new XYZ(p.Length.InputUnit("mm"), 0, 0);

Transact("Create Wall", () => {
    var wall = Wall.Create(Doc, Line.CreateBound(start, end), lvl.Id, false);
    wall.WallType = p.WallType;
    wall.SetVal("Unconnected Height", p.Height);  // [Unit("cm")] already converted
});

Println($"Created wall: {p.WallType.Name}, {p.Length.OutputUnit("mm", 0)}mm long, {p.Height.OutputUnit("cm", 0)}cm high.");

public class Params
{
    [Required] public Level TargetLevel { get; set; }
    [Required] public WallType WallType { get; set; }
    [Unit("mm")] public double Length { get; set; } = 5000;
    [Unit("cm")] public double Height { get; set; } = 300;
}
```

## Spatial Deduplication

```csharp
var cols = GetElements("Structural Columns")
    .Where(c => c.Location is LocationPoint)
    .GroupBy(c => {
        var lp = c.Location as LocationPoint;
        return new {
            Level = c.GetStr("Base Level"),
            X = Math.Round(lp.Point.X, 4),
            Y = Math.Round(lp.Point.Y, 4)
        };
    })
    .Where(g => g.Count() > 1)
    .ToList();

var toDelete = cols.SelectMany(g => g.Skip(1)).ToList();
toDelete.Delete();
Println($"Deleted {toDelete.Count} overlapping columns across {cols.Count} locations.");
```

## Grouped Chart

```csharp
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();
Println("Room area per level bar chart rendered.");
```

---

# BANNED PATTERNS

NEVER use:
- `FilteredElementCollector` when `GetElements<T>()` works
- `BuiltInParameter` / `get_Parameter` / `.AsString()` / `.AsDouble()` when `GetStr`/`GetNum` works
- `.Where(e => e.LookupParameter(...))` — use `.WhereParam()` instead
- `.GroupBy(e => ...).Select(g => ...)` — use `.GroupByParam()` instead
- `.OrderBy(e => ...)` / `.OrderByDescending(e => ...)` — use `.OrderByParam()` instead
- `Console.WriteLine`, `println` — use `Println()`
- `foreach` + `Println` for data display — use `.Table()`
- `string.Join` for element IDs — use `.Table()`
- `ElementId.IntegerValue` — use `.Value` (long)
- Manual unit conversion math (3.28084, 0.3048, etc.) — use unit arguments
- `OutputUnit.SquareMeters`, `UnitType.UT_Area`, "Square Meters", "Cubic Meters"
- `.Select()` after `.GroupByParam()` — chain `.Table()`/`.BarGraph()` directly
"""
