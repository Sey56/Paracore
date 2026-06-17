# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.
# If simple, keep everything in the entry file.
# If complex, create helpers in Scripts/ (Utils.cs, Models.cs, etc.).
# Use #region GroupName directives to organize parameters.

Generate C# Revit API scripts for the Paracore runtime (CoreScript.Engine).

## Code Structure (STRICT ORDER)

Scripts use **Top-Level Statements**. Order is mandatory:

```
1. Top-level logic (var p = new Params(); queries, Transact blocks, output)
2. Top-level helper methods (if needed)
3. Class definitions (Params class MUST be LAST)
```

## Implicit Usings (from Globals.cs)

ALL namespaces are pre-imported via `global using` directives in the workspace's `Globals.cs`. **Never write `using` statements** — they are redundant and clutter the script. There is exactly **one exception** (see below).

These namespaces are already available everywhere:
`System`, `System.Collections.Generic`, `System.Linq`, `System.Text`, `System.Text.Json`, `System.Globalization`,
`Microsoft.CSharp`,
`Autodesk.Revit.DB`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`,
`Autodesk.Revit.DB.Mechanical`, `Autodesk.Revit.DB.Plumbing`, `Autodesk.Revit.DB.Electrical`,
`Autodesk.Revit.UI`, `CoreScript.Engine.Globals`,
`SixLabors.ImageSharp`, `SixLabors.ImageSharp.Processing`, `SixLabors.ImageSharp.PixelFormats`,
`MiniExcelLibs`, `MathNet.Numerics`, `MathNet.Numerics.LinearAlgebra`, `MathNet.Numerics.Statistics`

### The ONE exception: RestSharp

`RestSharp` is the **only** package that requires an explicit `using RestSharp;` statement. It was deliberately excluded from `Globals.cs` because `RestSharp.Parameter` conflicts with `Autodesk.Revit.DB.Parameter` (the most-used type in Revit scripts). If your script makes HTTP calls, add `using RestSharp;` at the top. Otherwise, you never need `using` statements.

## Available Globals

| Global | Type | Purpose |
|--------|------|---------|
| `Doc` | Document | Active Revit document |
| `UIDoc` | UIDocument | UI document for selections |
| `UIApp` | UIApplication | Revit application |
| `Println(msg)` | void | Print to output with newline |
| `Print(msg)` | void | Print without newline |
| `Transact(name, action)` | void | Wrap modifications in a single undo-step transaction |
| `Transact(name, Action<Document>)` | void | Transaction with Document parameter |
| `SetExecutionTimeout(s)` | void | Extend default 10s timeout |
| `GetElements<T>()` | PipelineEnumerable<T> | All elements of type T (with pipeline diagnostics) |
| `GetElements("Category")` | PipelineEnumerable<Element> | All elements of that category |
| `GetElements<T>("Category")` | PipelineEnumerable<T> | Typed + category-filtered |
| `GetElements(BuiltInCategory)` | PipelineEnumerable<Element> | Query by BuiltInCategory enum |
| `GetElement<T>(name)` | T? | Find one typed element by name |
| `GetElement("name")` | Element? | Find one element by name |
| `GetMagicNames()` | List<string> | All targetable category/family/class names |
| `GetCategories()` | List<string> | All project category names |
| `Table(data)` | void | Render as interactive data grid |
| `BarChart(data)` / `BarGraph(data)` | void | Render bar chart |
| `PieChart(data)` / `PieGraph(data)` | void | Render pie chart |
| `LineChart(data)` / `LineGraph(data)` | void | Render line chart |
| `Selection` | IList<Element> | Currently selected elements in Revit |
| `Watchdog(callback, intervalSeconds)` | void | Register background sentinel *(Sentinel Scripts Only)* |
| `WatchdogReport(summary, status, ids?)` | void | Report health status from sentinels *(Sentinel Scripts Only)* |

**Pipeline Diagnostics (v4.6.0+):** `GetElements<T>()` returns a `PipelineEnumerable<T>` that reports element counts at every stage of a LINQ chain. Each `.Where()`, `.GroupBy()`, `.Select()`, etc. shows how many elements survived — no more guessing why a pipeline returned fewer results.

---

# PARACORE FLUENT METHODS (ALWAYS USE FIRST)

These are shorter, cleaner, unit-aware, and transaction-safe. **Only fall back to raw Revit API when Paracore methods literally cannot express the logic.**

## Element Retrieval

```csharp
// Typed (gives .Area, .Level, .Name, etc. directly)
GetElements<Room>()
GetElements<Wall>()
GetElements<WallType>()
GetElements<Level>()
GetElements<FamilyInstance>("Doors")    // typed + category filtered
GetElements<FamilySymbol>("Doors")      // door family types
GetElements<Element>()                  // universal — every element in the model

// Category string (generic Element — use GetStr/GetNum for params)
GetElements("Walls")
GetElements("Structural Columns")
GetElements("Doors")
GetElements("Windows")

// Single element lookup
GetElement<Level>("Level 1")
GetElement("Level 1")
```

## Parameter Name Mapping (CRITICAL — STUDY THIS TABLE)

Different categories use DIFFERENT parameter names for the same concept:

| Concept | Walls | Rooms | Columns | Floors | Doors/Windows | Ceilings |
|---------|-------|-------|---------|--------|---------------|----------|
| Level | `Base Constraint` | `Level` | `Base Level` | `Level` | `Level` | `Level` |
| Top Level | `Top Constraint` | — | `Top Level` | — | — | — |
| Base Offset | `Base Offset` | — | `Base Offset` | — | — | — |
| Top Offset | `Top Offset` | — | `Top Offset` | — | — | — |
| Height | `Unconnected Height` | — | — | — | — | — |
| Length | `Length` | — | — | — | — | — |
| Area | `Area` | `Area` | — | `Area` | — | `Area` |
| Width | `Width` | — | `Width` | — | `Width` (type) | — |
| Thickness | — | — | — | `Thickness` | — | — |
| Function | `Function` | — | — | — | — | — |
| Mark | `Mark` | — | `Mark` | `Mark` | `Mark` | `Mark` |
| Comments | `Comments` | `Comments` | `Comments` | `Comments` | `Comments` | `Comments` |
| Fire Rating | `Fire Rating` | — | `Fire Rating` | `Fire Rating` | `Fire Rating` | `Fire Rating` |
| Type Name | `Type Name` | — | `Type Name` | `Type Name` | `Type Name` | `Type Name` |
| Family Name | `Family Name` | — | — | — | `Family Name` | — |
| Volume | `Volume` | `Volume` | `Volume` | `Volume` | — | `Volume` |
| Phase Created | `Phase Created` | `Phase Created` | `Phase Created` | `Phase Created` | `Phase Created` | `Phase Created` |

**ALWAYS explore the model before assuming parameter names.** Use `First().CombinedParams().Table()` or `search_schema` to verify.

## Reading Parameters

```csharp
// Smart string getter (resolves ElementIds → names, falls back to Type params)
el.GetStr("Comments")                    // → "Reviewed"
el.GetStr("Level")                       // → "Level 1" (resolves ElementId)
el.GetStr("HandFlipped")                 // → "True" (via Reflection)
el.GetStr("Length", "mm")                // → "3600" (unit-converted, 2 decimals)
el.GetStr("Area", "m2", 4)               // → "25.4578" (specified decimals)

// Numeric getters
el.GetNum("Area")                        // → raw internal feet (18.4 sqft)
el.GetNum("Length", "m")                 // → 3.6 (converted from feet)
el.GetNum("Area", "m2", 4)               // → 25.4578 (specified decimals)

// WYSIWYG getter (exactly as seen in Revit Properties palette)
el.GetVal("Width")                       // → "900.0 mm"
el.GetVal("Area", "m2", 3)               // → "25.458 m²"

// Integer / boolean
el.GetInt("Is External")                 // → 1 (true) or 0 (false)

// Type-level accessors (explicit — for disambiguation)
el.GetTypeStr("Width")                   // force Type-level lookup
el.GetTypeNum("Width", "mm")
el.GetTypeVal("Width")
el.GetTypeInt("Count")

// Note: Instance-level GetStr/GetNum/GetVal AUTO-FALLBACK to Type parameters.
// You only need GetType* when both Instance and Type share the same parameter name.
```

## Writing Parameters

### Single Element (`SetVal` / `SetNum`)
```csharp
// Smart setter — auto-resolves types
el.SetVal("Comments", "Reviewed")        // string
el.SetVal("Base Offset", "500 mm")       // value string — unit parsed
el.SetVal("Base Offset", -150, "cm")     // converts -150cm → internal feet
el.SetVal("Level", "Level 2")            // ElementId resolved by name
el.SetVal("Pinned", true)                // Native C# property via Reflection

// Decimal-safe numeric setter
el.SetNum("Unconnected Height", 3.0, "m") // converts 3m → internal feet
```

### Collection Bulk Write (`SetParam`)
```csharp
// Set same value on every element — single transaction
walls.WhereParam("Base Constraint", "Level 01")
     .SetParam("Comments", "Reviewed")
     .SetParam("Top Offset", -150, "cm");

// Dynamic renumbering (factory pattern)
int i = 1;
GetElements("Doors")
    .WhereParam("Level", "Level 2")
    .OrderByParam("Mark")
    .SetParam("Mark", e => $"D2-{i++:000}");
```

## Transaction Rules (CRITICAL)

| Scenario | Transaction? | Undo Steps |
|----------|:---:|:---:|
| Single-element `.SetVal()` / `.SetNum()` | Auto-creates one | 1 |
| Collection `.SetParam()` / `.Delete()` / `.Hide()` | Auto-creates one | 1 |
| `foreach` WITHOUT `Transact()` | Each iteration makes its own | N (BAD!) |
| `foreach` WITH `Transact()` | One for entire block | 1 |

**Rule:** Fluent chain with collection method → no `Transact()` needed. Manual `foreach` → **ALWAYS** wrap in `Transact()`.

```csharp
// CORRECT — collection method handles transaction
GetElements("Doors").WhereParam("Comments", "").SetParam("Comments", "Pending Review");

// CORRECT — manual foreach wrapped in Transact
Transact("Update Doors", () => {
    foreach (var door in doors)
        door.SetVal("Comments", "Pending Review");
});

// WRONG — each SetVal creates its own transaction (50 doors = 50 undo steps)
foreach (var door in doors)
    door.SetVal("Comments", "Pending Review");
```

## Unit Conversion

### Unit strings (use these everywhere: InputUnit, OutputUnit, GetNum, SetNum, etc.)

| Type | Unit Strings |
|------|-------------|
| Length | `mm`, `cm`, `m`, `ft`, `in` |
| Area | `m2` / `sqm`, `ft2` / `sqft` |
| Volume | `m3` / `cum`, `ft3` / `cuft` |

### Input: Human units → Revit internal feet
```csharp
200.0.InputUnit("mm")       // → 0.656... feet
3.6.InputUnit("m")          // → 11.811 feet
25.0.InputUnit("m2")        // → 269.098 sqft
```

### Output: Revit internal feet → Human units
```csharp
wall.GetNum("Length").OutputUnit("mm")      // → 3600.0 (double)
wall.GetNum("Length").FormatUnit("mm")      // → "3600.0 mm" (string with suffix)
wall.GetNum("Length").FormatValueOnly("mm") // → "3600" (string, no suffix — good for CSV)
value.OutputUnit("m2", 3)                   // → 25.458 (3 decimals)
```

### Precision Math
```csharp
value.Round(2)                              // → 3.14 (round to N decimals)
value.RoundTo("mm", 0)                      // snap to nearest mm, return internal feet
value.AlmostZero()                          // abs(value) < 1e-9 feet
value.IsAlmostEqualTo(target)               // precision-aware equality
value.IsLessThan(limit)                     // value < limit AND not ~equal
value.IsGreaterThan(limit)                  // value > limit AND not ~equal
value.IsLessThanOrEqual(limit)              // value ≤ limit (including ~equal)
value.IsGreaterThanOrEqual(limit)           // value ≥ limit (including ~equal)
value.IsPositive()                          // value > tolerance
value.IsNegative()                          // value < -tolerance

// Unit-aware comparison
room.GetNum("Area").IsGreaterThan(25.0.InputUnit("m2"))   // area > 25m²
wall.GetNum("Width", "mm").IsGreaterThanOrEqual(300)       // width ≥ 300mm
```

**NEVER use `==` or `!=` for doubles.** Revit produces floating-point noise. Always use precision-aware methods.

## Filtering & Sorting

```csharp
// Exact string match
walls.WhereParam("Base Constraint", "Level 1")
doors.WhereParam("HandFlipped", "True")     // C# property via Reflection

// String operations
doors.WhereParam("Mark", "starts", "D-")
doors.WhereParam("Type Name", "contains", "Fire")
doors.WhereParam("Comments", "ends", "done")

// Numeric equality (with tolerance)
walls.WhereParam("Width", 200, "mm")        // exactly 200mm

// Numeric comparison
rooms.WhereParam("Area", ">", 25.0, "m2")   // larger than 25m²
walls.WhereParam("Length", "<", 10.0, "m")   // shorter than 10m
walls.WhereParam("Width", ">=", 300, "mm")   // 300mm or wider
doors.WhereParam("Height", "<=", 2.1, "m")   // 2.1m or shorter

// Fuzzy name match (searches Type Name AND Family Name)
elements.WhereMatches("Single-Flush")

// Curtain-wall door exclusion
doors.StandardDoor()                        // excludes glass curtain-wall doors

// Sort (auto-detects numeric vs string)
.OrderByParam("Area")                       // smallest first
.OrderByParamDesc("Area")                   // largest first
.OrderByParam("Mark")                       // alphabetical
```

## Grouping & Aggregation

```csharp
// Group + count → Group | Count columns
GetElements("Doors").GroupByParam("Level")

// Group + count + sum → Group | Count | Total columns
GetElements("Rooms").GroupByParam("Level", "Area", "m2")
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m")

// Sum only (returns double)
walls.SumParam("Length", "m")
rooms.SumParam("Area", "m2")
```

**GroupByParam chains directly to Table/Chart — no .Select() needed:**
```csharp
GetElements("Doors").GroupByParam("Level").Table()
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph()
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").PieGraph()
```

## Bulk Write & Revit UI Actions

All work on collections, all are chainable, all batch into a single transaction:

```csharp
// Parameter writes
elements.SetParam("Comments", "Pending Review")
elements.SetParam("Top Offset", -150, "cm")

// Revit UI
elements.Select()     // Select in Revit UI
elements.Zoom()       // Zoom to fit in active view
elements.Isolate()    // Temporarily isolate in active view
elements.Hide()       // Hide in active view
elements.Unhide()     // Unhide in active view

// BIM-Smart Delete (auto-skips Pinned elements, Curtain Panels, Curtain-hosted doors)
elements.WhereMatches("TEMP").Delete()

// Forensic audit on every element
elements.Peek()
```

## Visualization

**ALWAYS use `.Select()` to pick explicit columns before `.Table()`** (unless coming from GroupByParam):

```csharp
// CORRECT — explicit columns
walls.WhereParam("Base Constraint", "Level 1")
     .Select(w => new {
         Id = w.Id,
         Name = w.Name,
         Length = w.GetNum("Length", "cm"),
         Level = w.GetStr("Base Constraint")
     })
     .Table();

// CORRECT — GroupByParam chains directly (no .Select() needed)
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();

// WRONG — dumps hundreds of columns (never do this)
GetElements("Walls").Table()
walls.WhereParam(...).Table()
```

## Column Naming for .Select() Projections

Column names must EXACTLY match the parameter names (use underscores for spaces). **NO unit suffixes in column names.**

```csharp
// CORRECT
.Select(w => new {
    Base_Constraint = w.GetStr("Base Constraint"),
    Top_Offset = w.GetNum("Top Offset", "cm"),
    Wall_Length = w.GetNum("Length", "mm")
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
// Full parameter audit — instance + type (Scope | Name | Storage | Value)
el.CombinedParams().Table()

// Side-by-side forensic comparison
el.Peek()
elements.Peek()                     // Peek on every element in collection

// Instance-only or type-only params
el.InstanceParams().Table()
el.TypeParams().Table()

// BuiltInParameter identifiers
el.BuiltInParams().Table()

// Native Revit API properties (Name, Id, Category, Level, Workset, Pinned, etc.)
el.NativeProperties().Table()

// Reflection discovery
el.ReflectionProperties().Table()   // All C# properties
el.ReflectionMethods().Table()      // All public methods

// Parameter dictionary
el.ParamsDict()                     // → Dictionary<string, string>

// Family identity
el.FamilyName()                     // → "M_Single-Flush" or "Basic Wall"
el.Matches("Single")                // → true (fuzzy name match)

// Available lookup strings
GetMagicNames()                     // All targetable category/family/class names
GetCategories()                     // All project category names

// ElementId conversion
123456L.ToElement(Doc)              // long → Element
someId.ToElement(Doc) as Wall       // ElementId → typed element
```

## Door & Window Orientation

```csharp
fi.RoomFrom()          // Room on non-swing side (stable regardless of flips)
fi.RoomTo()            // Room door swings into (geometric swing arc)
fi.Handing()           // "LH" or "RH" (as seen from RoomFrom)
fi.HingeSide()         // "Left" or "Right"
fi.IsStandardDoor()    // Excludes curtain-wall glass doors
fi.IsHandFlipped()     // true/false
fi.IsFacingFlipped()   // true/false
fi.FindSwingArc()      // World-space Arc geometry
```

## Materials

```csharp
el.Materials()          // List<Material> — all materials on the element
el.MaterialNames()      // List<string> — material names
el.GetMaterialNames()   // string — comma-separated material names
```

## Geometry

```csharp
el.GeometrySummary().Table()  // Solids | Curves | PolyLines (type, source, material, volume, area, faces)
```

## Advanced Features

### Clash Detection *(Enterprise — gated)*\*
```csharp
GetElements("Walls").AuditClashes("StructuralColumns", "2mm").Table()
GetElements("Pipes").AuditClashes("Ducts", 5.0).Table()      // numeric tolerance (feet)
Doc.ClearClashHelpers()   // remove visual helper geometry
```

### Sustainability *(Enterprise — gated)*\*
```csharp
Eco.GetCarbon(wall)       // → embodied carbon (kgCO2e)
Eco.GetUValue(wall)       // → thermal transmittance (W/m²K)
Eco.GetWeather()          // → live weather at project coordinates
```

### Jupyter Export
```csharp
GetElements<Room>()
    .Select(r => new { Number = r.GetStr("Number"), Name = r.Name,
        Level = r.GetStr("Level"), Area = r.Area.OutputUnit("m2", 2) })
    .ToNotebook("Room_Analysis");
```

---

# RAW REVIT API (RARELY NEEDED)

Paracore fluent methods cover ~95% of scripting needs. When you truly need raw API, follow these rules:

**`FilteredElementCollector` is BANNED.** Use `GetElements<T>()` or `GetElements("Category")` instead. There is no legitimate use case for `FilteredElementCollector` in Paracore scripts.

**`BuiltInParameter` / `get_Parameter` is BANNED for reading.** Use `GetStr()`, `GetNum()`, `GetVal()`, `GetInt()` instead. The only valid use is `.Set()` for writing when `SetVal()`/`SetNum()` cannot express the logic — but that is exceedingly rare.

**When `WhereParam` can't express your filter**, use typed `.Where()` with lambdas (NOT FilteredElementCollector):
```csharp
GetElements<Wall>()
    .Where(w => w.Width > 0.2 && w.GetStr("Fire Rating").Contains("2"))
    .Table();
```

**ElementId**: ALWAYS use `.Value` (long). `IntegerValue` is FORBIDDEN in Revit 2025+.

---

# PARAMS CLASS (Editable Parameters)

All user-configurable values go in `public class Params` at the **BOTTOM** of the file.

**RULES:**
1. `Params` is the ONLY class the engine scans for UI parameters
2. Properties must be flat — no nested objects
3. Instantiate at the top: `var p = new Params();`
4. Access via instance: `p.MyLevel`, NEVER `Params.MyLevel`
5. Group with `#region GroupName` / `#endregion`

## Property → UI Control Mapping

| C# Type | UI Control |
|---------|-----------|
| `string` | Text input |
| `int` / `double` | Numeric field |
| `bool` | Toggle switch |
| `Level`, `WallType`, `Wall`, `Room`, etc. | Auto-discovered dropdown |
| `FamilySymbol`, `FamilyInstance` | Dropdown of types/instances |
| `ViewSheet`, `View`, `Material` | Dropdown |
| `BuiltInCategory`, `BuiltInParameter` | Searchable enum dropdown |
| `List<T>` | Multi-select checkboxes |

## All Supported Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `[Unit("key")]` | Metric conversion | `[Unit("mm")] public double Width { get; set; } = 250;` |
| `[Range(min, max, step)]` | Slider with bounds | `[Range(0, 100, 5)] public int Count { get; set; } = 10;` |
| `[Required]` | Mandatory field | `[Required] public Level BaseLevel { get; set; }` |
| `[Confirm("TEXT")]` | Safety lock for destructive ops | `[Confirm("DELETE")] public string Confirm { get; set; }` |
| `[Select(SelectionType.Element)]` | Pick from Revit viewport | `[Select(SelectionType.Element)] public Wall MyWall { get; set; }` |
| `[Select(SelectionType.Point)]` | Pick a point in Revit | `[Select(SelectionType.Point)] public XYZ Origin { get; set; }` |
| `[EnabledWhen(nameof(Prop), "value")]` | Conditional enable | `[EnabledWhen(nameof(ShowAdvanced), "true")]` |
| `[RevitElements(Category = "Doors")]` | Filter by category | On `FamilyInstance` or `List<FamilyInstance>` |
| `[InputFile("csv,xlsx")]` | Open File dialog | `[InputFile("csv")] public string DataPath { get; set; }` |
| `[OutputFile("xlsx")]` | Save File dialog | `[OutputFile("xlsx")] public string ExportPath { get; set; }` |
| `[FolderPath]` | Folder browser | `[FolderPath] public string BackupFolder { get; set; }` |
| `[Color]` | Color swatch picker | `[Color] public string HighlightColor { get; set; } = "#3B82F6";` |
| `[Stepper]` | +/- buttons for int | `[Stepper] public int Iterations { get; set; } = 10;` |
| `[Segmented]` | Button group for string | `[Segmented] public string Mode { get; set; } = "Preview";` |

## UNIT RULES for `[Unit]`:
- **NEVER** use `[Unit]` for imperial (feet, sqft, cuft) — Revit IS imperial internally
- Only use: `mm`, `cm`, `m`, `in`, `m2`, `sqm`, `m3`, `cum`
- **NEVER** use: `sf`, `sq`, `ft`, `ft2`, `sqft`

## `[Unit]` and Double Conversion (CRITICAL)

When a `Params` property has `[Unit("mm")]`, the value is **ALREADY converted** to internal feet by the time the script runs. Do NOT pass a unit argument again:

```csharp
// CORRECT — p.LengthThreshold is already internal feet (thanks to [Unit])
walls.WhereParam("Length", "<", p.LengthThreshold)
walls.SetNum("Length", p.LengthThreshold)

// WRONG — double-converts (first [Unit], then "mm" argument)
walls.WhereParam("Length", "<", p.LengthThreshold, "mm")
```

## Data Provider Suffixes

```csharp
// Custom dropdown filter (_Options)
public List<WallType> WallType_Options => GetElements<WallType>()
    .Where(t => t.Name.Contains("Generic")).ToList();

// Conditional visibility (_Visible)
public bool ShowAdvanced_Visible => IsActive;

// Dynamic range (_Range)
public (double, double, double) Count_Range => (1, 100, 1);

// String options for [Segmented]
[Segmented]
public string Mode { get; set; } = "Preview";
public List<string> Mode_Options => new() { "Preview", "Commit", "Audit" };
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

    /// Wall types to include
    public List<WallType> WallTypes { get; set; }

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

1. **Paracore methods ONLY**: `FilteredElementCollector` is BANNED. Always use `GetElements<T>()`, `.WhereParam()`, `.GetStr()`, `.SetParam()` etc. The ONLY raw API allowed is `.Set()` on a `Parameter` object in the rarest of edge cases.
2. **Transactions**: `.SetParam()`, `.Delete()`, `.Hide()` on collections auto-transact. Manual `foreach` writes MUST wrap in `Transact("Name", () => { ... })`.
3. **No Async**: NEVER use `await` or `async`. Scripts run synchronously on the Revit UI thread.
4. **Target Existing File**: Write in the `.cs` file provided. NEVER create a new `Script.cs`.
5. **ElementId**: Use `.Value` (long). `IntegerValue` is FORBIDDEN in Revit 2025+.
6. **Safety**: For destructive ops (Delete, Bulk Overwrite), require `[Confirm("DELETE")]`.
7. **Println after modifications**: Always state what was changed, how many, and relevant values.
8. **Unit args over manual math**: NEVER convert cm→ft or mm→m yourself. Pass unit strings to methods.
9. **No floating-point equality**: Never `==` on doubles. Use `.IsAlmostEqualTo()`, `.IsLessThan()`, etc.
10. **Column names**: Use underscores for spaces, NO unit suffixes in `.Select()` projection column names.
11. **No `using` statements**: All namespaces are `global using` in `Globals.cs`. NEVER write `using` or fully-qualified type names (e.g., `Autodesk.Revit.DB.XYZ`). Just use the short name (`XYZ`).
12. **Classes at bottom**: Any `class`, `struct`, or `interface` definitions go AFTER all top-level code.

---

# EXAMPLES

## 1. Query with Table (Gallery Script)

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
        Area = r.GetNum("Area", "m2")          // GetNum converts to display unit
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

## 2. Bulk Write (Modification)

```csharp
var p = new Params();

GetElements("Walls")
    .WhereParam("Base Constraint", p.SourceLevel.Name)
    .SetParam("Top Constraint", p.TargetLevel.Name)
    .SetParam("Top Offset", p.TopOffset);      // [Unit("cm")] already converted — no unit arg

Println($"Updated walls — Top Constraint → {p.TargetLevel.Name}, Offset → {p.TopOffset.OutputUnit("cm", 0)} cm.");

public class Params
{
    [Required] public Level SourceLevel { get; set; }
    [Required] public Level TargetLevel { get; set; }
    [Unit("cm")] public double TopOffset { get; set; } = -150;
}
```

## 3. Element Creation

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

## 4. Grouped Chart

```csharp
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();
Println("Room area per level bar chart rendered.");
```

## 5. Door Schedule with Handing

```csharp
GetElements<FamilyInstance>("Doors")
    .StandardDoor()
    .OrderByParam("Mark")
    .Select(d => new {
        Mark = d.GetStr("Mark"),
        Level = d.GetStr("Level"),
        Width = d.GetTypeVal("Width"),
        Height = d.GetTypeVal("Height"),
        From = d.RoomFrom(),
        To = d.RoomTo(),
        Handing = d.Handing()
    })
    .Table();
```

## 6. Spatial Deduplication (advanced)

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

## 7. Sentinel Script

```csharp
Watchdog((doc) => {
    var walls = GetElements<Wall>()
        .WhereParam("Mark", "");
    
    if (walls.Any())
        WatchdogReport($"{walls.Count()} walls missing Mark values", "warning", walls.Select(w => w.Id).ToList());
    else
        WatchdogReport("All walls have valid Mark values", "success");
}, 10);

public class Params { }
```

## 8. Sequential Renumbering

```csharp
int i = 1;
GetElements("Doors")
    .WhereParam("Level", "Level 2")
    .OrderByParam("Mark")
    .SetParam("Mark", e => $"D2-{i++:000}");

Println($"Renumbered doors on Level 2.");
```

## 9. Structural Wall Audit (Width ≥ 300mm)

```csharp
GetElements<Wall>()
    .Where(w => w.GetNum("Width", "mm").IsGreaterThanOrEqual(300))
    .OrderByParamDesc("Width")
    .Select(w => new {
        Name = w.Name,
        Level = w.GetStr("Base Constraint"),
        Width = w.GetVal("Width"),
        Length = w.GetVal("Length")
    })
    .Table();
```

---

# BANNED PATTERNS

## NEVER use these patterns:

| Banned | Use Instead |
|--------|------------|
| `new FilteredElementCollector(Doc).OfClass(...).Cast<>()` | `GetElements<T>()` — NO exceptions |
| `new FilteredElementCollector(Doc).OfCategory(...)` | `GetElements("Category")` or `GetElements<T>("Category")` |
| `FilteredElementCollector` in ANY form | `GetElements<T>()` / `GetElements("Category")` — always |
| `el.get_Parameter(BuiltInParameter.X)` | `el.GetStr("ParamName")` / `el.GetNum("ParamName")` |
| `.AsString()` / `.AsDouble()` / `.AsValueString()` | `.GetStr()` / `.GetNum()` / `.GetVal()` |
| `.LookupParameter("X").AsString()` | `.GetStr("X")` |
| `.Where(e => e.LookupParameter(...))` | `.WhereParam()` |
| `.GroupBy(e => ...).Select(g => ...)` for param grouping | `.GroupByParam()` |
| `.OrderBy(e => ...)` / `.OrderByDescending(e => ...)` for params | `.OrderByParam()` / `.OrderByParamDesc()` |
| `Console.WriteLine(...)` / `println(...)` | `Println(...)` |
| `foreach` + `Println` for data display | `.Table()` |
| `string.Join` for element IDs | `.Table()` |
| `ElementId.IntegerValue` | `.Value` (long) |
| Manual unit math (`3.28084`, `0.3048`, `* 304.8`, etc.) | `.InputUnit()` / `.OutputUnit()` / unit args |
| `OutputUnit.SquareMeters`, `UnitType.UT_Area` | `"m2"`, `"sqm"` (plain strings) |
| `"Square Meters"`, `"Cubic Meters"` | `"m2"`, `"m3"` (short strings) |
| `==` / `!=` on doubles | `.IsAlmostEqualTo()`, `.IsLessThan()`, `.IsGreaterThan()`, etc. |
| `.Select()` after `.GroupByParam()` | Chain `.Table()` / `.BarGraph()` / `.PieGraph()` directly |
| `.Table()` without `.Select()` on non-GroupByParam results | Always `.Select()` to pick explicit columns first |
| Unit suffix in `.Select()` column names (e.g., `Length_mm`) | Plain column name (`Length`), unit handled by `GetNum` |
| Top-level `return` statements | `throw new Exception("message")` for early exits |
| `[Unit("ft")]` / `[Unit("sqft")]` / `[Unit("ft2")]` | Skip `[Unit]` entirely — Revit IS imperial |
