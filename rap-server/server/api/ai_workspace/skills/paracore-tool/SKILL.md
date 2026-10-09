---
name: paracore-tool
description: How to turn a Paracore gallery script into a configurable TOOL — the Params class, every supported attribute, the property-to-UI-control mapping, the [Unit] conversion rules and the _Options/_Visible/_Range data providers. Read this when the script should let the user set values in the gallery before it runs.
---

# Making a gallery script a TOOL

A **tool** is a script that carries a `public class Params` at the bottom of the entry file. Each
public property becomes an **editable control in the Paracore gallery**, and the user sets the values
**before** the script runs.

⚠ **A `Params` class is optional.** Add one only when the script genuinely has values a user should
choose — a level, a threshold, a family type. A plain query or audit needs no `Params` class.

## Rules

1. `Params` is the **only** class the engine scans for UI parameters. Other classes are ignored.
2. Properties must be **flat** — no nested objects.
3. Instantiate at the top of the script: `var p = new Params();`
4. Access through the instance — `p.MyLevel`, **never** `Params.MyLevel`.
5. The class goes **LAST** in the file, after all top-level code.
6. Group properties with `#region GroupName` / `#endregion` to organise the configurator panel.

## Property → UI control

| C# type | UI control |
|---|---|
| `string` | Text input |
| `int` / `double` | Numeric field |
| `bool` | Toggle switch |
| `Level`, `WallType`, `Wall`, `Room`, … | Auto-discovered dropdown |
| `FamilySymbol`, `FamilyInstance` | Dropdown of types / instances |
| `ViewSheet`, `View`, `Material` | Dropdown |
| `BuiltInCategory`, `BuiltInParameter` | Searchable enum dropdown |
| `List<T>` | Multi-select checkboxes |

## Attributes

| Attribute | Purpose | Example |
|---|---|---|
| `[Unit("key")]` | Metric conversion | `[Unit("mm")] public double Width { get; set; } = 250;` |
| `[Range(min, max, step)]` | Slider with bounds | `[Range(0, 100, 5)] public int Count { get; set; } = 10;` |
| `[Required]` | Mandatory field | `[Required] public Level BaseLevel { get; set; }` |
| `[Confirm("TEXT")]` | Safety lock for a destructive op | `[Confirm("DELETE")] public string Confirm { get; set; }` |
| `[Select(SelectionType.Element)]` | Pick from the Revit viewport | `[Select(SelectionType.Element)] public Wall MyWall { get; set; }` |
| `[Select(SelectionType.Point)]` | Pick a point in Revit | `[Select(SelectionType.Point)] public XYZ Origin { get; set; }` |
| `[EnabledWhen(nameof(Prop), "value")]` | Conditional enable | `[EnabledWhen(nameof(ShowAdvanced), "true")]` |
| `[RevitElements(Category = "Doors")]` | Filter a dropdown by category | on `FamilyInstance` or `List<FamilyInstance>` |
| `[InputFile("csv,xlsx")]` | Open-File dialog | `[InputFile("csv")] public string DataPath { get; set; }` |
| `[OutputFile("xlsx")]` | Save-File dialog | `[OutputFile("xlsx")] public string ExportPath { get; set; }` |
| `[FolderPath]` | Folder browser | `[FolderPath] public string BackupFolder { get; set; }` |
| `[Color]` | Colour swatch | `[Color] public string HighlightColor { get; set; } = "#3B82F6";` |
| `[Stepper]` | +/− buttons for an int | `[Stepper] public int Iterations { get; set; } = 10;` |
| `[Segmented]` | Button group for a string | `[Segmented] public string Mode { get; set; } = "Preview";` |

⚠ A destructive operation (delete, bulk overwrite) should require a `[Confirm("DELETE")]` gate.

## `[Unit]` rules

- **NEVER use `[Unit]` for imperial** (feet, sqft, cuft) — Revit *is* imperial internally, so a
  conversion would be wrong. Skip the attribute entirely.
- Only use: `mm`, `cm`, `m`, `in`, `m2`, `sqm`, `m3`, `cum`.
- **Never** use: `sf`, `sq`, `ft`, `ft2`, `sqft`.

### ⚠ `[Unit]` converts BEFORE your code runs — do not convert twice

When a property carries `[Unit("mm")]`, its value is **already internal feet** by the time the script
runs. Passing a unit argument again double-converts.

```csharp
// CORRECT — p.LengthThreshold is already internal feet, thanks to [Unit]
walls.WhereParam("Length", "<", p.LengthThreshold)
walls.SetNum("Length", p.LengthThreshold)

// WRONG — double-converts (first [Unit], then the "mm" argument)
walls.WhereParam("Length", "<", p.LengthThreshold, "mm")
```

## Data provider suffixes

Convention-based hooks that feed the configurator dynamically:

```csharp
// Custom dropdown filter
public List<WallType> WallType_Options => GetElements<WallType>()
    .Where(t => t.Name.Contains("Generic")).ToList();

// Conditional visibility
public bool ShowAdvanced_Visible => IsActive;

// Dynamic slider range
public (double, double, double) Count_Range => (1, 100, 1);

// Options for a [Segmented] control
[Segmented]
public string Mode { get; set; } = "Preview";
public List<string> Mode_Options => new() { "Preview", "Commit", "Audit" };
```

## Example

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
        Area = r.GetNum("Area", "m2")
    })
    .Table();

Println($"Rooms on {p.TargetLevel.Name} above {p.MinArea.OutputUnit("m2", 1)} m².");

public class Params
{
    #region Target

    /// Select the level to process
    [Required]
    public Level TargetLevel { get; set; }

    /// Filter rooms smaller than this (m²)
    [Unit("m2")]
    [Range(0, 500, 5)]
    public double MinArea { get; set; } = 15;

    #endregion

    #region Action

    /// New mark value to apply
    public string NewMark { get; set; } = "UPDATED";

    /// Apply the changes
    public bool ApplyChanges { get; set; } = false;

    #endregion
}
```

## A write tool

```csharp
var p = new Params();

GetElements("Walls")
    .WhereParam("Base Constraint", p.SourceLevel.Name)
    .SetParam("Top Constraint", p.TargetLevel.Name)
    .SetParam("Top Offset", p.TopOffset);      // [Unit("cm")] already converted

Println($"Updated walls — Top Constraint → {p.TargetLevel.Name}, " +
        $"Offset → {p.TopOffset.OutputUnit("cm", 0)} cm.");

public class Params
{
    [Required] public Level SourceLevel { get; set; }
    [Required] public Level TargetLevel { get; set; }
    [Unit("cm")] public double TopOffset { get; set; } = -150;
}
```

## Creating elements

```csharp
var p = new Params();
XYZ start = new XYZ(0, 0, 0);
XYZ end = new XYZ(p.Length.InputUnit("mm"), 0, 0);   // NOT [Unit] here — converted by hand

Transact("Create Wall", () => {
    var wall = Wall.Create(Doc, Line.CreateBound(start, end), p.TargetLevel.Id, false);
    wall.WallType = p.WallType;
    wall.SetVal("Unconnected Height", p.Height);      // [Unit("cm")] already converted
});

public class Params
{
    [Required] public Level TargetLevel { get; set; }
    [Required] public WallType WallType { get; set; }
    [Unit("mm")] public double Length { get; set; } = 5000;
    [Unit("cm")] public double Height { get; set; } = 300;
}
```
