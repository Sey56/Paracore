# Current Script Context: FOLDER PROJECT
# All logic goes into the Scripts/ folder.
# Use #region GroupName directives to organize parameters.

# Paracore Scripting Reference

Generate C# Revit API scripts for the Paracore / CoreScript.Engine runtime.

## Code Structure (STRICT ORDER)

Scripts use **Top-Level Statements**. The order is mandatory:

```
1. using statements
2. Top-level logic (var p = new Params(); queries, Transact blocks, output)
3. Top-level helper methods (if needed)
4. Class definitions (Params class MUST be LAST)
```

## Available Globals

| Global | Type | Purpose |
|--------|------|---------|
| `Doc` | Document | Active Revit document |
| `UIDoc` | UIDocument | UI document for selections |
| `UIApp` | UIApplication | Revit application |
| `Println(msg)` | void | Print to Console tab |
| `Print(msg)` | void | Print without newline |
| `Transact("Name", () => { })` | void | Wrap modifications in a transaction |
| `Table(data)` | void | Render data as a sortable table in the Table tab |
| `BarChart(data)` | void | Render a bar chart in the Summary tab |
| `PieChart(data)` | void | Render a pie chart in the Summary tab |
| `LineChart(data)` | void | Render a line chart in the Summary tab |
| `SetExecutionTimeout(seconds)` | void | Extend the default 10s timeout |

## Implicit Using Statements

These namespaces are available without explicit `using`:
`System`, `System.Collections.Generic`, `System.Linq`, `System.Text.Json`,
`Autodesk.Revit.DB`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`, `Autodesk.Revit.UI`,
`CoreScript.Engine.Globals`

## Params Class (THE ONLY PARAMETER SOURCE)

All user-configurable values MUST go in `public class Params` at the bottom of the file. 

**STRICT RULES FOR PARAMETERS:**
1. **SINGLE SOURCE**: `Params` is the ONLY class the engine scans for UI parameters.
2. **NO NESTING**: Properties in `Params` must be flat. Do NOT put other classes or objects inside `Params`.
3. **ISOLATION**: Other user-defined classes (e.g., `public class HelperData`) MUST NOT contain properties with Paracore attributes (`[Unit]`, `[Select]`, etc.). They will be ignored and may cause errors.
4. **INSTANTIATION**: Instantiate it at the top: `var p = new Params();`
5. **ACCESS**: Access values via the instance: `p.MyLevel`, never `Params.MyLevel`.

### Basic Property Types

| C# Type | UI Control | Default Example |
|---------|-----------|-----------------|
| `string` | Text input | `= "My Value"` |
| `int` | Numeric field | `= 5` |
| `double` | Numeric field | `= 3.2` |
| `bool` | Toggle switch | `= true` |

### Revit Element Types (Magic Hydration)

Use Revit types directly — the engine auto-discovers all instances/types and populates a dropdown:

| C# Type | What appears in UI |
|---------|--------------------|
| `Level` | Dropdown of all levels |
| `WallType` | Dropdown of all wall types |
| `Wall` | Dropdown of all wall instances |
| `Material` | Dropdown of all materials |
| `FamilySymbol` | Dropdown of all family types |
| `FamilyInstance` | Dropdown of all family instances |
| `ViewSheet` | Dropdown of all sheets |
| `View` | Dropdown of all views |
| Any `Element` subclass | Auto-discovered dropdown |
| Any `ElementType` subclass | Auto-discovered dropdown |

**Lists** create multi-select checkboxes: `List<Wall>`, `List<Level>`, etc.

### Revit Enum Types

Use Revit enums directly — all enum values are listed in a searchable dropdown:

```csharp
public BuiltInParameter TargetParam { get; set; }
public BuiltInCategory TargetCategory { get; set; }
```

### Supported Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `[Unit("key")]` | Metric-to-Feet conversion | `[Unit("mm")] public double Width { get; set; } = 250;` |
| `[Range(min, max, step)]` | Slider with bounds | `[Range(0, 100, 5)] public int Count { get; set; } = 10;` |
| `[Required]` | Mark as mandatory | `[Required] public Level BaseLevel { get; set; }` |
| `[Confirm("TEXT")]` | Safety lock for destructive ops | `[Confirm("DELETE")] public string Confirm { get; set; }` |
| `[Select(SelectionType.Element)]` | Pick from Revit viewport | `[Select(SelectionType.Element)] public Wall MyWall { get; set; }` |
| `[Select(SelectionType.Point)]` | Pick a point in Revit | `[Select(SelectionType.Point)] public XYZ Origin { get; set; }` |
| `[EnabledWhen(nameof(Prop), "value")]` | Conditional enable | `[EnabledWhen(nameof(ShowAdvanced), "true")]` |
| `[RevitElements(Category = "Doors")]` | Filter by Revit category | On `FamilyInstance` or `List<FamilyInstance>` properties |
| `[InputFile("csv, xlsx")]` | Open File dialog | `[InputFile("csv")] public string DataPath { get; set; }` |
| `[OutputFile("xlsx")]` | Save File dialog | `[OutputFile("xlsx")] public string ExportPath { get; set; }` |
| `[FolderPath]` | Folder Browser dialog | `[FolderPath] public string BackupFolder { get; set; }` |
| `[Color]` | Color swatch picker | `[Color] public string HighlightColor { get; set; } = "#3B82F6";` |
| `[Stepper]` | +/- buttons for integers | `[Stepper] public int Iterations { get; set; } = 10;` |
| `[Segmented]` | Horizontal button group | `[Segmented] public string Mode { get; set; } = "Preview";` |

**STRICT UNIT REALITY (IMPORTANT):**
Revit's internal units are ALWAYS **Feet** (Decimal Feet, Square Feet, Cubic Feet).
1. **NO [Unit] FOR IMPERIAL**: If the user wants Feet, Square Feet, or Cubic Feet, **DO NOT** use the `[Unit]` attribute. It is redundant and forbidden.
2. **SUPPORTED KEYS ONLY**: The engine ONLY supports these Metric/Conversion keys: `mm`, `cm`, `m`, `in`, `m2` (or `sqm`), `m3` (or `cum`).
3. **NO HALLUCINATIONS**: Never use `sf`, `sq`, `ft`, `ft2`, `sqft` or other custom keys. 
4. **PURPOSE**: `[Unit]` is exclusively for Metric shielding.

### Data Providers (Suffix Conventions)

Define a companion property or method with the `_Suffix` naming convention:

| Suffix | Purpose | Example |
|--------|---------|---------|
| `_Options` | Custom dropdown items | See below |
| `_Visible` | Conditional visibility | `public bool ShowAdvanced_Visible => IsActive;` |
| `_Range` | Dynamic range values | `public (double, double, double) Count_Range => (1, 100, 1);` |

#### _Options: Custom Data Provider (IMPORTANT)

When the engine's auto-discovery is too broad, define custom filtered options:

```csharp
// The parameter — a dropdown of walls
public Wall TargetWall { get; set; }

// Custom filter — only show walls with "Generic" in the name
public List<Wall> TargetWall_Options => new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall)).Cast<Wall>()
    .Where(w => w.Name.Contains("Generic")).ToList();
```

For string dropdowns with `[Segmented]`:
```csharp
[Segmented]
public string Mode { get; set; } = "Preview";
public List<string> Mode_Options => ["Preview", "Commit", "Audit"];
```

### Formatting Rules

- Group related parameters with `#region GroupName` / `#endregion`
- One empty line above `#region` and `#endregion`
- One empty line between each property for readability
- Use `/// Short description` for one-liners
- Use `/// <summary>Multi-line description</summary>` for longer docs

## Coding Rules

1. **Transactions**: One `Transact("Name", () => { ... })` block. All modifications inside.
2. **No Async**: NEVER use `await` or `async`. Scripts run in a synchronous UI thread.
3. **Target Existing File**: Write ALL code in the existing .cs file provided in the context (e.g. `MyScript.cs`). NEVER create `Script.cs` or other new files.
4. **Early Exits**: Use `throw new Exception("message")` instead of top-level `return`.
5. **ElementId**: `ElementId.IntegerValue` is FORBIDDEN in Revit 2025+. Use `ElementId.Value` (long).
6. **Safety Locks**: For destructive operations (Delete, Overwrite), MUST use `[Confirm("DELETE")]`.
7. **Unit suffix shorthand**: Name parameters with `_mm`, `_cm`, `_m`, `_ft`, `_in` for auto unit detection.

## Complete Example

```csharp
using Autodesk.Revit.DB;

var p = new Params();

// 1. Query
var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall)).Cast<Wall>()
    .Where(w => w.LevelId == p.TargetLevel.Id).ToList();

// 2. Visualize
Table(walls.Select(w => new { Name = w.Name, Length = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() }));
Println($"Found {walls.Count} walls on {p.TargetLevel.Name}");

// 3. Modify (if needed)
if (p.ApplyChanges)
{
    Transact("Update Walls", () =>
    {
        foreach (var wall in walls)
        {
            wall.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set(p.NewMark);
        }
    });
    Println($"Updated {walls.Count} wall marks to '{p.NewMark}'");
}

// ---------------------------------------------------------
// PARAMS (MUST BE LAST)
// ---------------------------------------------------------
public class Params
{
    #region Target

    /// Select the level to filter walls
    public Level TargetLevel { get; set; }

    #endregion

    #region Action

    /// Set a new mark value for all walls on the selected level
    public string NewMark { get; set; } = "UPDATED";

    /// Toggle to apply changes
    public bool ApplyChanges { get; set; } = false;

    #endregion
}
```
