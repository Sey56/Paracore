---
name: display-visualize
description: Rendering data as tables and charts — Table, BarGraph, PieGraph, LineGraph, ExportImage (view → image), Println, Select projection
---

# Display & Visualize

Render query results as tables, charts, and text output. These are the final step in every fluent chain.

## Table() — interactive data grid

`.Table()` renders data as an interactive grid. Column headers match Revit parameter names for editing.

**SAFE — always works (fixed columns):**
```csharp
GetElements("Walls").First().CombinedParams().Table()                    // 4 cols: Scope | Name | Storage | Value
GetElements("Walls").GroupByParam("X").Table()                           // 2 cols: Group | Count
GetElements("Walls").GroupByParam("X", "Sum", "u").Table()               // 3 cols: Group | Count | Total
GetElements("Walls").Select(w => new { w.Id, Name = w.Name }).Table()    // you chose the columns
```

**FORBIDDEN — dumps every parameter as a column (50-200 columns):**
```csharp
GetElements("Walls").Table()                                             // 78+ columns × 593 rows = disaster
GetElements("Walls").WhereParam("Base Constraint", "Level 01").Table()   // filtered, still all columns
GetElements("Walls").SetParam("Comments", "x").Table()                   // after write, still all columns
```

**Rule:** If the thing before `.Table()` is NOT `CombinedParams`, `GroupByParam`, or `Select` with explicit columns, add `.Select()` first.

## Column Naming Rules for .Select()

Column names MUST match Revit parameter names. Replace spaces with underscores — the renderer converts them BACK to spaces:

```csharp
// CORRECT:
GetElements("Walls").Select(w => new {
    w.Id,
    Base_Constraint = w.GetStr("Base Constraint"),    // displays as "Base Constraint"
    Top_Offset = w.GetNum("Top Offset", "cm"),        // displays as "Top Offset"
    Area = w.GetNum("Area", "m2")                     // displays as "Area"
}).Table()

// WRONG — the unit suffix leaks into the column header:
GetElements("Walls").Select(w => new {
    w.Id,
    Top_Offset_cm = w.GetNum("Top Offset", "cm")      // "Top Offset cm" ≠ "Top Offset"
}).Table()
```

**NEVER add unit suffixes to column names.** The unit is in `GetNum(name, unit)`, not in the column header.

## Charts

After `GroupByParam` — chain directly, no `.Select()` needed:
```csharp
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph()
GetElements("Doors").GroupByParam("Level").PieGraph()
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").LineGraph()
```

**NOTE:** `.Bar()` does NOT exist — use `.BarGraph()`.

Charts render in the Analytics tab, not in chat. Tell the user to check there.

## Println() — status messages

```csharp
Println($"Updated {walls.Count()} walls — Top Offset set to -150 cm.");
Println("Done. Deleted 5 columns.");
```

**Use Println ONLY for status messages**, not data display. Never foreach+Println loops for data — use `.Table()` instead.

## Projection with .Select()

LINQ `.Select()` projects columns for `.Table()`:
```csharp
GetElements("Walls").WhereParam("Base Constraint", "Level 1")
    .Select(w => new {
        w.Id,
        Name = w.GetStr("Name"),
        Length = w.GetNum("Length", "m"),
        Area = w.GetNum("Area", "m2")
    }).Table()
```

Always put `Id` as the first column in `.Select()` projections.

## Seeing the model — `export_view` (tool) and `ExportImage()` (in-script)

This is how you **look at what you built** — numbers alone cannot tell you whether a proportion
is right.

**`export_view(view_name, pixel_size, annotations)` — the tool. Prefer this.** It renders a named
view (or the active view when `view_name` is omitted) and returns the **image itself**, so you can
see it in one step. The file is written to a temp directory and returned directly.

```text
export_view("3D View - {3D}")                        # a named view, annotation hidden
export_view()                                        # the active view
export_view("North Elevation", 2000)                 # named view, 2000 px
export_view("00 - Ground Floor", 1600, "tags")       # dimensions + tags kept
```

⚠ **`annotations` decides whether you can read the drawing.** Default is `"model"`:

| mode | what it does | when |
|---|---|---|
| `"model"` | hides **all** annotation — the model fills the frame | 3D views, checking geometry |
| `"tags"` | hides datum/marker categories, **keeps dimensions, text notes and room/door/window tags** | checking a dimensioned drawing, reading a room tag |
| `"all"` | hides nothing — everything is visible, but markers outside the model are drawn too and the model shrinks to a fraction of the frame | rarely; when you need one specific marker |

⚠⚠ **A default export of a floor plan contains NO dimensions and NO room tags.** That is by
design, and it is the single easiest way to conclude "my dimensions are missing" when they are
present and merely hidden. If the task mentions dimensions, tags or room names, pass `"tags"`.

⚠ **The loop is build → export → look → correct.** Export after *every* build stage, not only at
the end — a wall in the wrong place is far cheaper to fix before the next 30 elements exist.

**`ExportImage(path, viewName, pixelSize)` — the in-script form.** Use it when you are already
writing C# and want the **path** back instead of the image. It returns the path that was actually
written.

```csharp
// Active view
var shot = ExportImage(@"C:\tmp\current");

// A named view, at 2000 px
var elev = ExportImage(@"C:\tmp\north-elev", "North Elevation", 2000);
Println($"wrote {shot}");
```

⚠ **Use the RETURN value — it is the file that exists, not the path you passed.** Revit appends the
view identity to the base name and may change the extension: asking for `C:\tmp\shot` on the default
3D view writes `C:\tmp\shot - 3D View - {3D}.jpg`. **A 3D or shaded view is written as `.jpg` even
though PNG is requested.**

- Pass the path **without** an extension. The directory is created if it does not exist.
- `viewName` omitted ⇒ the **active view**. Matched case-insensitively; view templates are rejected.
- **No `Transact()` needed** — an export does not modify the model.
- Plain Revit API, no Pro dependency — it works on the free add-in and the Pro add-in alike.

⚠ **`ExportImage` suppresses annotation for you — by default.** Revit's image export does **not**
clip annotation to the view, so level heads, grid bubbles and **elevation/section marks** are drawn
wherever they sit — even far outside the model — and because the export fits the whole extent to the
page, they **shrink the subject**. This is *not* limited to 3D views: a **plan** view with elevation
markers beside it renders the building into a fraction of the frame. `ExportImage` therefore hides
the whole `CategoryType.Annotation` set on the view for the duration of the export and restores it —
the caller sees no change and no undo entry.

**Three ways to get the tags into the picture, in increasing order of fidelity:**

1. **`export_view(..., annotations: "tags")`** — the tool, and the one to reach for. It hides only
   the datum/marker categories and keeps dimensions, text notes and room/door/window tags. Measured
   2026-10-08: on the house model this is the difference between a plan with no readable information
   and a legible dimensioned drawing.
2. `export_view(..., annotations: "all")` — everything visible, model shrunk by the markers.
3. In-script `ExportImage(path, viewName, pixelSize, hideAnnotation: false)` — the raw engine
   primitive. Use it only when you are already writing C# and want the **path** back. It has no
   middle setting: `hideAnnotation` is all-or-nothing.

⚠ **"tags" is implemented on the MCP side, using raw Revit API**, so it needs no add-in change and
works on the free and Pro add-in alike. It rolls its own transaction back, so the view is left
exactly as the user had it.

**Use it whenever the user asks "does this look right?"** — build, export, look, correct.
