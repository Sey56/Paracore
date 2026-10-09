---
applyTo: "Scripts/**/*.cs"
---

# Paracore script contract

Rules for every `.cs` file under `Scripts/`. They apply to both the Paracore **desktop** (gallery)
and the **VS Code** extension — the same engine compiles and runs the code either way.

## Structure

- **Top-level statements only.** No `namespace`, no `class Program`, no `static void Main()`.
  The engine wraps your file itself.
- **Exactly ONE file may contain top-level statements.** The engine throws *"Only one script file
  can contain top-level statements."* if a second one does. In VS Code that file is
  `Scripts/Main.cs`; in a gallery workspace it is the script file the card names.
- **Every other `.cs` file in `Scripts/` declares TYPES ONLY** — `class`, `record`, `struct`,
  `interface`, `enum`, or extension methods. No top-level statements.
- **A helper type is only compiled if something actually uses it.** The engine sends the entry file
  plus the files it references, so reference your helpers from the entry file.
- **All type definitions go AFTER all top-level code.** Order is mandatory:
  `① top-level logic → ② top-level helper methods → ③ class/struct/interface definitions`.
- If the task is small, keep everything in the entry file. Split out a file only for a reusable type.

## No `using` statements

Every namespace is pre-imported through `global using` directives in the workspace's `Globals.cs`.
**Never write a `using` statement, and never write a fully-qualified type name** — write `XYZ`, not
`Autodesk.Revit.DB.XYZ`.

Pre-imported: `System`, `System.Collections.Generic`, `System.Linq`, `System.Text`,
`System.Text.Json`, `System.Globalization`, `Microsoft.CSharp`, `Autodesk.Revit.DB`,
`Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`, `Autodesk.Revit.DB.Mechanical`,
`Autodesk.Revit.DB.Plumbing`, `Autodesk.Revit.DB.Electrical`, `Autodesk.Revit.UI`,
`CoreScript.Engine.Globals`, `SixLabors.ImageSharp`, `SixLabors.ImageSharp.Processing`,
`SixLabors.ImageSharp.PixelFormats`, `MiniExcelLibs`, `MathNet.Numerics`,
`MathNet.Numerics.LinearAlgebra`, `MathNet.Numerics.Statistics`.

**The one exception — `RestSharp`.** HTTP calls need an explicit `using RestSharp;`. It is
deliberately excluded from `Globals.cs` because `RestSharp.Parameter` collides with
`Autodesk.Revit.DB.Parameter`, the most-used type in Revit scripts. Nothing else needs a `using`.

## Solve in this order

**① Paracore extension methods — always first.** They are shorter, unit-aware and
transaction-safe. The `paracore-engine` skill maps them.

**② LINQ.** Element collections are `IEnumerable<T>`, so `Where`, `Select`, `OrderBy`, `GroupBy`,
`Sum`, `Any`, `Count`, `FirstOrDefault` and `Distinct` all work. The extension methods **preserve
the concrete element type** through the chain (`GetElements<Wall>()` stays `IEnumerable<Wall>`), so
you keep full IntelliSense and can mix fluent calls with lambdas.

**③ Raw Revit API — last resort only.** Only when ① and ② genuinely cannot express it. Write it
inline in the entry file, in the same top-level flow.

```csharp
// ① and ② exhausted — a native call with no engine equivalent.
var opt = new Options { ComputeReferences = true, DetailLevel = ViewDetailLevel.Fine };
var solid = someElement.get_Geometry(opt).OfType<Solid>().FirstOrDefault(s => s.Volume > 0);

// …and combine it with the engine API freely:
GetElements<Wall>()
    .Where(w => w.GetNum("Unconnected Height", "m") > 3.0)
    .Select(w => new { w, Footprint = w.get_Geometry(opt) })
    .Table();
```

⚠ Even on the fallback path: **still no `FilteredElementCollector`** (unless the engine genuinely
has no getter for that, which is rare), wrap modifications in `Transact(...)` rather than a
hand-rolled `Transaction`, and keep it in the entry file — do not create a second top-level file.

> Do not reach for ③ until you have checked ① and ②. They cover the vast majority of querying,
> filtering, reading, writing, grouping and UI work.

## Banned — the engine already replaces all of it

| Never write | Use instead |
|---|---|
| `new FilteredElementCollector(Doc).OfClass(...)` | `GetElements<T>()` |
| `new FilteredElementCollector(Doc).OfCategory(...)` | `GetElements("Category")` · `GetElements<T>("Category")` |
| `FilteredElementCollector` in **any** form | `GetElements<T>()` — there is no legitimate use |
| `el.get_Parameter(BuiltInParameter.X)` | `el.GetStr("Name")` · `el.GetNum("Name")` |
| `el.LookupParameter("X").AsString()` | `el.GetStr("X")` |
| `.AsString()` · `.AsDouble()` · `.AsValueString()` | `.GetStr()` · `.GetNum()` · `.GetVal()` |
| `switch (p.StorageType) { … }` | the typed getters above |
| `new Transaction(Doc, "x")` … `t.Commit()` | `Transact("x", () => { … })` |
| `Doc.Regenerate()` outside a transaction | `Regen()`, or rely on the committed transaction |
| `using Autodesk.Revit.DB;` (any `using`) | nothing — all namespaces are pre-imported |
| `namespace X { class Program { static void Main() } }` | top-level statements in the entry file |
| `IExternalCommand` / `IExternalApplication` / `.addin` | not applicable — this is not an add-in |
| `.Where(e => e.LookupParameter(...))` | `.WhereParam()` |
| `.GroupBy(e => …)` for parameter grouping | `.GroupByParam()` |
| `.OrderBy(e => …)` / `.OrderByDescending(e => …)` for parameters | `.OrderByParam()` / `.OrderByParamDesc()` |
| `Console.WriteLine(...)` / `println(...)` | `Println(...)` |
| `foreach` + `Println` to display data | `.Table()` |
| `ElementId.IntegerValue` | `.Value` (long) — `IntegerValue` is FORBIDDEN in Revit 2025+ |
| manual unit math (`3.28084`, `0.3048`, `* 304.8`) | `.InputUnit()` / `.OutputUnit()` / a unit argument |
| `OutputUnit.SquareMeters`, `UnitType.UT_Area` | `"m2"`, `"sqm"` (plain strings) |
| `"Square Meters"`, `"Cubic Meters"` | `"m2"`, `"m3"` |
| `==` / `!=` on doubles | `.IsAlmostEqualTo()` · `.IsLessThan()` · `.IsGreaterThan()` |
| top-level `return` | `throw new Exception("message")` for an early exit |

If you find yourself writing `FilteredElementCollector`, stop — you want `GetElements<T>()` or
`GetElements("Category")`.

## Units

Revit stores lengths in **feet**. The engine converts at the boundary, so **always pass the unit
string and think in human units**. Never convert by hand.

```csharp
wall.GetNum("Width", "mm")                     // read in mm
wall.SetVal("Unconnected Height", 2800, "mm")  // write in mm
```

Without a unit, a `double` is read/written in the parameter's **own display unit**.

Accepted strings: `mm cm m km in ft m2 sqm ft2 sqft m3 cum ft3 cuft deg % kg nr no`.

⚠ **Never use `[Unit]` for imperial** (feet, sqft, cuft) — Revit *is* imperial internally.

## Transactions

- Read-only work needs no transaction.
- Any change to the document must be inside `Transact("name", () => { … })`.
- `SetVal` / `SetNum` and the collection methods `SetParam` / `Delete` / `Hide` open a transaction
  automatically.
- ⚠ **A manual `foreach` that writes MUST be wrapped in `Transact`.** Without it every iteration
  opens its own transaction — 50 doors means 50 undo steps.

```csharp
// CORRECT — the collection method handles the transaction
GetElements("Doors").WhereParam("Comments", "").SetParam("Comments", "Pending Review");

// CORRECT — a manual loop, wrapped
Transact("Update Doors", () => {
    foreach (var door in doors) door.SetVal("Comments", "Pending Review");
});

// WRONG — 50 doors, 50 undo steps
foreach (var door in doors) door.SetVal("Comments", "Pending Review");
```

- Never call `Doc.Regenerate()` outside a transaction — it throws *"Modification of the document is
  forbidden"*, which names neither the method nor the cause. A committed transaction already
  regenerates.

## Precision

**Never use `==` or `!=` on doubles.** Revit produces floating-point noise. Use the precision-aware
methods: `.IsAlmostEqualTo()`, `.AlmostZero()`, `.IsLessThan()`, `.IsGreaterThan()`,
`.IsLessThanOrEqual()`, `.IsGreaterThanOrEqual()`, `.IsPositive()`, `.IsNegative()`.

⚠ `IsLessThan` **excludes** the tolerance band, so a boundary test must use `IsLessThanOrEqual` —
that accepts a `2000.0000000001` from unit-conversion noise, `IsLessThan` does not.

## Displaying results

- **Always `.Select()` explicit columns before `.Table()`** — a raw `.Table()` on a query dumps
  hundreds of columns.
- Column names must **exactly match the parameter name**, with underscores for spaces, and
  **no unit suffix** (`Length`, not `Length_mm`).
- `.GroupByParam()` already produces clean columns — chain `.Table()` / `.BarGraph()` / `.PieGraph()`
  **directly**, never `.Select()` after it.
- **State what changed** with `Println` after a modification: how many, and the relevant values.

## Other rules

- **No async.** Never `await` or `async` — scripts run synchronously on the Revit UI thread.
- **Write in the file provided.** Never create a second entry file.
- **Safety:** a destructive operation (delete, bulk overwrite) needs a `[Confirm("DELETE")]` gate in
  the desktop gallery flow.
- Use `SetExecutionTimeout(seconds)` to extend the default execution timeout.
