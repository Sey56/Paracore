# 🧩 Paracore Extension Methods Reference

A comprehensive guide to every extension method the **engine** provides on Revit elements and collections in Paracore scripts. All methods are globally available in the REPL and in all scripts.

⚠⚠ **This document is ENGINE-ONLY, and there is exactly ONE of it (2026-10-09).** There is no free/Pro split any more — the engine and the add-in are always free and generic, so there is no `#PRO-ONLY` region, no stripped variant, and no second copy with different content. A method provided by a tool's **pack** (the Pro/free unit) is documented **with that tool**, never here: the takeoff pack's `CoordinationExtensions.cs`, `CurtainGridRepairExtensions.cs` and `Eco.cs` live in `paracore-takeoff/pack/Engine/Globals/` and are documented in **`paracore-takeoff/Docs/TAKEOFF_REFERENCE.md`**.

This document has TWO halves, and only one of them is written by hand.

**The prose** (everything down to §17) is hand-authored: it explains *how* to use the methods, and
carries the traps, the recipes and the worked examples. Keep it here.

**Appendix A — the API index** is **GENERATED from the engine source** by
`paracore/scripts/gen-ext-methods.py`. It lists every extension method and every global `ScriptApi`
member with its exact signature and the file it lives in. Regenerate it with `--write`; `--check`
fails when it is stale. ⚠ **Do not hand-edit the region between the `GENERATED:EXT-INDEX` markers** —
the next `--write` discards it, and every copy of this file in the other MCPs is rebuilt from here.

⚠ **Appendix A is EXHAUSTIVE, and it is the ONLY place the engine API is inventoried.** Every
`public static … (this …)` declared under `CoreScript.Engine/` appears there, and so does every
`public static` member of the `ScriptApi*` partials. (Host plumbing that a script cannot call — the DI
registration `AddCoreScriptEngineServices` in `ServiceCollectionExtensions.cs` — is deliberately out of
scope.) A method provided by a tool's **pack** is documented **with that tool**, never here: the takeoff
pack's `CoordinationExtensions.cs`, `CurtainGridRepairExtensions.cs` and `Eco.cs` live in
`paracore-takeoff/pack/Engine/Globals/` and are documented in
**`paracore-takeoff/Docs/TAKEOFF_REFERENCE.md`**.

> [!NOTE]
> All extension methods work identically in the **REPL** and in **Gallery scripts**. They are standard C# extension methods available everywhere the engine runs.

> [!TIP]
> All collection extension methods are **fully generic** — they preserve the specific element type (`Wall`, `FamilyInstance`, etc.) throughout the entire fluent chain.

> [!IMPORTANT]
> **Script Rules:** Top-level statements only — no `namespace`, `class Program`, or `Main()`. All namespaces pre-imported — never write `using` or fully-qualified names. No `FilteredElementCollector` — use `GetElements<T>()` or `GetElements("Category")`. No `IExternalApplication`/`IExternalCommand`.

---

## 📦 Element Retrieval

SYSTEM FAMILIES (`Wall`, `Floor`, `Room`, `Ceiling`, etc.):
```
GetElements<Wall>()      → typed Wall instances, no category string needed
GetElements<WallType>()  → typed wall type definitions
GetElements("Walls")     → untyped Element list (use only when necessary)
```

LOADABLE FAMILIES (Doors, Windows, Furniture, Columns, etc.):
```
GetElements<FamilyInstance>("Doors")  → typed FamilyInstance, door category
GetElements<FamilySymbol>("Doors")    → typed type symbols (door family types)
GetElements("Doors")                  → untyped Element list
```

⚠⚠ **INSTANCES MEAN INSTANCES — a category with none returns ZERO, not its types.**
`GetElements("Doors")` and `GetElements<FamilyInstance>("Doors")` return the doors **in the model**.
On a project with no doors they return an **empty list** and report the zero —
`[INFO] Doors: valid Class or Category with 0 instances in this document.` They never substitute the
door **types**. Types are still reachable, but only by **asking** for them:

```
GetElements<FamilySymbol>("Doors")   → the door symbols (the types)
GetElements<WallType>()              → the wall types
GetElements("WallType")              → a name that is itself a type name
```

⚠ Why this matters: an `ElementType` returned in place of an instance is a **routing key**, not a
label. `.Count()` would count types as instances, `.Delete()` would remove **every instance** of
them, and `.SetVal()` would write to the TYPE — silently repricing every instance at once. Until
2026-10-14 an "automatic type fallback" did exactly that for any category with no matching Revit
class (Doors, Windows, Furniture, Columns, Roofs) whenever the model had 0 instances of it.

⚠ **A category name is not a class name.** The string in the parentheses is the **PLURAL category
name** — `"Walls"`, `"Doors"`, `"Structural Columns"`. The space is optional: `"StructuralColumns"`
resolves to the same category (matching is exact-name, no-space, or a `BuiltInCategory` substring).
For a **loadable** family the CLASS goes in the angle brackets and the CATEGORY in the parentheses —
Structural Columns are loadable, so it is `GetElements<FamilyInstance>("Structural Columns")`
(**there is no `StructuralColumn` type**). A **system** family needs no category at all:
`GetElements<Wall>()`.

Single-element: `GetElement("name-or-id")` | Discovery: `GetMagicNames()`, `GetCategories()`

---

## 📖 Table of Contents

1. [Element: Parameter & Property Accessors (Read)](#1-element-parameter--property-accessors-read)
2. [Element: Type-Level Accessors](#2-element-type-level-accessors)
3. [Element: Smart Write Methods](#3-element-smart-write-methods)
4. [Element: Identity & Discovery](#4-element-identity--discovery)
5. [Element: Specialized Door/Window](#5-element-specialized-doorwindow)
6. [Element: Materials & Sustainability](#6-element-materials--sustainability)
7. [Element: Geometry](#7-element-geometry)
8. [Element: Revit UI Actions](#8-element-revit-ui-actions)
9. [Collection: Filtering](#9-collection-filtering)
10. [Collection: Sorting](#10-collection-sorting)
11. [Collection: Grouping & Aggregation](#11-collection-grouping--aggregation)
12. [Collection: Bulk Write](#12-collection-bulk-write)
13. [Collection: Revit UI Actions](#13-collection-revit-ui-actions)
14. [Collection: Notebook Export](#14-collection-notebook-export)
15. [Numeric & Unit Helpers](#15-numeric--unit-helpers)
16. [Global ScriptApi Methods](#16-global-scriptapi-methods)
17. [Complete Fluent Chain Examples](#17-complete-fluent-chain-examples)

---

## 1. Element: Parameter & Property Accessors (Read)

### GetStr — parameter value as string

```csharp
// Resolution chain: Level → LookupParameter → BuiltInParameter → C# Property → NativeProperties → Type
GetElements("Walls").First().GetStr("Comments")        // "North wall"
GetElements("Walls").First().GetStr("Fire Rating")      // "2 hr"
GetElements("Walls").First().GetStr("Room Bounding")    // "1" or "0" (yes/no checkbox)
GetElements("Walls").First().GetStr("Level")            // "02 - Ground Floor Plan" (via NativeProperties)
```

**"Level" resolution**: GetStr("Level") works on ALL categories. Walls → NativeProperties LevelId, Structural Framing → "Reference Level", Columns → "Base Level", Doors/Windows/Rooms → built-in "Level" parameter. Uses category-specific fallback chain: Reference Level → Base Level → Base Constraint → Native LevelId.

**Unknown parameters**: GetStr returns "" silently (safe for chained queries) but logs a one-time warning: `⚠ GetStr("BadParam"): parameter not found on element. Check spelling or use .CombinedParams().Table() to discover available parameters.`

### GetNum — parameter value as double

```csharp
wall.GetNum("Area")                   // internal units (sq ft)
wall.GetNum("Area", "m2")            // 14.52
wall.GetNum("Unconnected Height")     // internal units (ft)
wall.GetNum("Unconnected Height", "m") // 2.80
wall.GetNum("Width", "mm")            // 200
```

Falls back to C# properties via Reflection if the parameter isn't found.

### GetInt — parameter value as integer

```csharp
wall.GetInt("Room Bounding")          // 1 or 0 (yes/no checkbox)
beam.GetInt("Number of Studs")        // 3
```

### GetVal — formatted value string as seen in Revit Properties

```csharp
wall.GetVal("Area")                   // "14.52 m²"
wall.GetVal("Volume", "m3")           // "2.450 m³"
```

### GetVal with unit

```csharp
wall.GetVal("Area", "m2")             // "14.52 m²"
```

---

## 2. Element: Type-Level Accessors

All instance-level getters have type-level equivalents:

```csharp
column.GetTypeStr("Material")         // "Concrete - C-25"
column.GetTypeNum("b", "mm")          // 250
column.GetTypeNum("h", "mm")          // 300
column.GetTypeInt("Usage")            // 0
column.GetTypeVal("Cost")             // "25.00 Birr"
```

`GetElementType()` returns the `ElementType` for any instance.

### Type-level writers — write through to the element's TYPE

⚠ Every reader above has a writer, and the writers are **type-level**: they set the parameter on
`e.GetElementType()`, so **every instance of that type changes at once**. That is the point of them —
you cannot set a type parameter per instance. If you want one element only, use the instance setter
(`SetVal` / `SetNum`) and make sure the parameter is an instance parameter.

```csharp
column.SetTypeVal("Cost", "30.00 Birr")        // SetVal on the ElementType
column.SetTypeVal("b", 250, "mm")              // with unit conversion
column.SetTypeNum("h", 300, "mm")              // numeric + unit, SetNum on the ElementType
```

All three are `void` — they return nothing, so they **end** a fluent chain. They no-op silently when
the element has no `ElementType` (e.g. a system-family instance such as a `Wall`), because the
implementation is `e.GetElementType()?.SetVal(...)`. To write a type parameter across many elements
without touching each one, use `SetTypeParam` (§12).

### ⚠⚠ The ACCIDENTAL type write — and how it is caught

`e.LookupParameter(name)` on an **instance** also finds the **type's** parameters — Revit projects
them — so `SetNum` / `SetVal` can land on the type without saying so. Measured 2026-10-14 on a
5-window model: one `SetNum("Width", 1511, "mm")` on ONE window reported `created 0 · modified 8` —
the four windows **and** their four host walls, re-cut.

`SetNum` and `SetVal` now **report** it, once per (type, parameter):

```
⚠ "Width" is a TYPE parameter on Windows_Sgl_Plain: 910x910mm — this writes to the TYPE, so all 4
  instance(s) of it change together (and any host opening they cut is re-cut). For ONE instance
  only: .NewType("<name>") and set the parameter on the returned symbol.
```

⚠ It INFORMS, it never refuses — writing a type is legitimate and often intended. The helpers:

```csharp
p.IsTypeParameter()             // true when this Parameter lives on an ElementType
e.TypeInstanceCount()           // how many elements use this element's type — the blast radius
win.NewType("PC 1511x1350mm")   // duplicate the type, assign it to THIS instance, return it
win.SwapSymbol(otherSymbol)     // re-type, and REPORT the parameter delta
```

`NewType` is the escape hatch: after it, a parameter write has a blast radius of **one**. It is
idempotent by name — a type of that name already on the family is reused, so a re-run converges
instead of littering the model with "Type 2", "Type 3".

⚠⚠ **`SwapSymbol` reports what the swap CHANGED.** `fi.Symbol = sym` is a one-line assignment that
can resize the element: swapping four windows to a fixed family silently took them 1400 mm → 1050 mm
(25 %), committed, re-cut the walls, and said nothing. `SwapSymbol` lists every parameter whose value
differs between the old and the new type, and how many instances share the new type:

⚠ The block below is the tool's OUTPUT, not C# — a bare fence on purpose, so
`scripts/check-skill-snippets.py` does not try to compile it. ⚠ Tagging it `csharp` made it the gate's
ONLY fatal finding across 185 fences / 5 repos: CS1056 on `✅`, `→`, `·` and `⚠`.

```
✅ Swapped 359617 → Windows_Sgl_Plain: 1511x1350mm   (1 parameter(s) changed · 1 instance(s) now use this type)
   ⚠ the geometry these drive changed with the swap:
     Width: 1400 → 1511
```

---

## 3. Element: Smart Write Methods

### SetNum — set a numeric value with unit conversion

```csharp
wall.SetNum("Unconnected Height", 3.0, "m")   // converts 3.0m → internal ft, sets parameter
wall.SetNum("Base Offset", -150, "mm")         // converts -150mm → internal ft
```

Wraps in a transaction automatically if one isn't active.

### SetVal — THE smart setter

```csharp
wall.SetVal("Comments", "New comment")         // String
wall.SetVal("Unconnected Height", 3.0)         // Double
wall.SetVal("Room Bounding", 0)                // Int (yes/no checkbox — 0 = unchecked)
wall.SetVal("Level", "Level 2")                // ElementId resolved by name
wall.SetVal("Mark", "A-12")                    // String parameter
```

### SetVal with unit

```csharp
wall.SetVal("Unconnected Height", 2800, "mm")  // converts from mm
column.SetVal("Base Offset", -0.15, "m")       // converts from m
```

When no unit is specified for a Double parameter, the handler defaults to the parameter's own display unit (via `GetUnitTypeId()`).

---

## 4. Element: Identity & Discovery

### Reflection discovery

```csharp
wall.ReflectionProperties().Table()   // all C# properties on Wall
wall.ReflectionMethods().Table()      // all C# methods on Wall (public, not Object)
```

### Parameter discovery

```csharp
wall.BuiltInParams().Table()          // built-in parameters with current values
wall.InstanceParams().Table()         // instance parameters: Name, Storage, Value
wall.TypeParams().Table()             // type parameters on the element's family type
wall.CombinedParams().Table()         // instance + type + native properties, separated by scope
wall.ParamsDict()                     // Dictionary<string,string> of all params
wall.NativeProperties()               // Category, Level, Workset, etc.
```

### Element snoop — Peek

```csharp
wall.Peek()                           // dumps EVERY parameter as a table; returns the element
GetElements("Walls").Peek()           // snoop each element in turn; returns the collection
```

`Peek` is the discovery shortcut for *"what does this thing actually have?"* — one row per parameter
with `Parameter | Storage | StringValue | NumericValue | UIValue`, the last being the exact string
Revit's Properties palette shows. Both overloads are **read-only** and chainable.

### Identity helpers

```csharp
wall.Matches("HCB")                   // fuzzy match against Type Name + Family Name
wall.FamilyName()                     // "Basic Wall"
wall.GetStr("Family and Type")        // full identity string
```

### ElementId → Element

```csharp
id.ToElement(doc)                     // ElementId / long / int → Element (null if it is gone)
```

Three overloads — `ElementId`, `long`, `int` — each taking the `Document` as the second argument. It
exists so an id read out of a parameter (a `LevelId`, a `GroupId`, an `OwnerViewId`) can be resolved
without an `ElementId` cast.

---

## 5. Element: Specialized Door/Window

### Orientation (stable regardless of flips)

```csharp
door.RoomFrom()                       // "LIVING ROOM"
door.RoomTo()                         // "CORRIDOR"
door.RoomAccess()                     // alias for RoomFrom
door.RoomDestination()                // alias for RoomTo
door.Handing()                        // "LH" or "RH"
door.HingeSide()                      // "Left" or "Right"
door.IsHandFlipped()                  // true/false
door.IsFacingFlipped()                // true/false
door.FindSwingArc()                   // largest Arc in geometry (swing path)
```

### Standard door filter

```csharp
// Exclude curtain-wall-hosted glass doors
GetElements<FamilyInstance>("Doors").StandardDoor().Table()
// → 33 standard doors (out of 40 total)

door.IsStandardDoor()                 // true if NOT hosted on a Curtain Wall
```

---

## 6. Element: Materials & Sustainability

```csharp
wall.Materials().Table()              // all Material objects on the element
wall.MaterialNames()                  // IEnumerable<string>: "Concrete - C-25", "Plaster - Cement"
wall.GetMaterialNames()              // comma-separated string
```

---

## 7. Element: Geometry

```csharp
wall.GeometrySummary()                // recursive: Solids, Curves, Arcs in world space
room.GetZSpan()                       // (Bot, Top) — the room's world Z band, internal feet
```

⚠ `GetZSpan()` returns a **world Z band in internal feet**, not a height. `Bot` is
`Level.Elevation + BaseOffset`; `Top` is `Bot + UnboundedHeight`, and `UnboundedHeight` is the
height to the upper-limit **plane** — it does not subtract geometry intruding into the room, so
this is the design band, not an as-built bounded height. A room that is unplaced or not properly
enclosed reports a non-positive `UnboundedHeight`; the method then falls back to the level /
upper-limit arithmetic the UI uses, and if the result is still degenerate it forces a 10 ft span
(and returns `(0, 10)` for a null room). Convert with `.OutputUnit("m")` before showing a number.

### ⚠⚠ Face references — and the one-call dimension chain

A dimension chain runs **face to face**, not centreline to centreline, and building one used to take
about forty lines of plumbing: `get_Geometry(new Options { ComputeReferences = true })` → walk to the
`PlanarFace`s → filter by normal → convert to millimetres → match each plane by hand. That is now one
call:

```csharp
// The whole top-wall chain, on a line 900 mm above it. Harvests the wall faces itself.
ActiveView.ChainDim("X", 8400, 0, 150, 3150, 3265, 5065, 5215);

// Several chains: harvest ONCE, then chain against the index.
var faces = Doc.FaceRefs();                        // every wall's vertical planar faces
ActiveView.ChainDim(faces, "X", 8400, 0, 150, 3150, 3265, 5065, 5215);
ActiveView.ChainDim(faces, "Y", 6100, 0, 150, 2245, 3275, 5225, 7350, 7500);
```

`ChainDim(view, axis, lineMm, planes…)` — `axis` is `"X"` or `"Y"`, `lineMm` is where the DIMENSION
LINE sits on the other axis (put it clear of the geometry; a chain laid on a wall is unreadable), and
`planes…` are the model planes in millimetres. It returns the `Dimension`.

The pieces, if you need them separately:

```csharp
GetElements("Walls").FaceRefs()      // FaceRefIndex — every vertical planar face, indexed by plane
Doc.FaceRefs()                       // the same, over every Wall in the document
wall.SideFaceRefs()                  // IReadOnlyList<FaceRef> — that wall's two SIDE faces
faces.All                            // IReadOnlyList<FaceRef> — Axis, Mm, Ref, Owner
faces.Nearest("X", 3150)             // the FaceRef on that plane, or null
faces.Array("X", 0, 150, 3150)       // ReferenceArray, ready for Doc.Create.NewDimension
faces.Misses                         // the planes that did NOT resolve — read this
```

⚠⚠ **CHECK `Misses` AFTER A CHAIN.** A plane that does not resolve is silently absent from the
`ReferenceArray`, so a chain that lost one produces segments that are plausible and wrong. A face
whose reference is null is SKIPPED, never guessed at; `Nearest` also records a miss when the closest
face is further than its tolerance (default 2 mm) — a face 40 mm off is a different plane, not a
rounding error.

⚠ A face's position is its own origin in millimetres, and only **vertical** faces are harvested (a
normal with a Z component is skipped). Solids nested inside a `GeometryInstance` — a loadable
family's own geometry — carry no usable reference, so they are deliberately not offered as
dimension targets.

---

## 8. Element: Revit UI Actions

```csharp
element.Select()                      // select in UI, returns element (chainable)
element.Zoom()                        // zoom to fit
element.Isolate()                     // temporarily isolate in active view
element.Hide() / element.Unhide()     // hide/unhide in active view
element.Delete()                      // delete from document
```

---

## 9. Collection: Filtering

All filters preserve the generic element type and track pipeline counts.

### WhereParam — string match

```csharp
GetElements("Walls").WhereParam("Fire Rating", "2 hr")
GetElements("Walls").WhereParam("Comments", "!=", "")    // has a comment
```

### WhereParam — numeric

```csharp
GetElements("Structural Columns").WhereParam("Volume", ">", 1.0, "m3")
GetElements("Walls").WhereParam("Unconnected Height", ">=", 2.5, "m")
```

### WhereParam — string operators (contains, starts, ends)

```csharp
GetElements("Doors").WhereParam("Type", "starts", "Interior")
GetElements("Walls").WhereParam("Type Name", "contains", "HCB")
```

### WhereAnyParam

```csharp
// Matches if ANY of the named parameters contains the value
GetElements("Walls").WhereAnyParam(new[]{"Comments","Mark"}, "fire")
```

### WhereTypeParam — filter by type-level parameter

```csharp
GetElements("Walls").WhereTypeParam("Material", "contains", "HCB")
```

### WhereMatches — fuzzy name search

```csharp
GetElements<FamilyInstance>("Doors").WhereMatches("flush")
```

### WhereMaterial / WhereMaterialNot

```csharp
GetElements("Structural Framing").WhereMaterial("Concrete").Table()
GetElements("Structural Framing").WhereMaterialNot("Steel")
```

### WhereCategory — filter by category, several at once

```csharp
GetElements<Element>().WhereCategory("Structural Framing", "Structural Columns", "Floors")
GetElements<Element>().WhereCategory("Doors", "Windows")
```

⚠ **Chained filters AND together, so you cannot OR two categories with `WhereParam`.** `WhereCategory`
is the OR: it keeps an element whose category matches **ANY** of the names given (it is
`params string[]`, so pass as many as you like). Category matching is exactly as lenient as the
`GetElements("Category")` magic string — exact name case-insensitively, the no-space form
(`"StructuralColumns"` ≡ `"Structural Columns"`), or a `BuiltInCategory` substring
(`"OST_StructuralFraming"`).

### Standard C# Where (lambda)

```csharp
GetElements<Wall>()
    .Where(w => w.GetNum("Unconnected Height", "m") > 3.0)
    .Table()
```

---

## 10. Collection: Sorting

```csharp
GetElements<FamilyInstance>("Doors")
    .OrderByParam("Width")
    .Table()

GetElements("Structural Columns")
    .OrderByParamDesc("Volume")
    .Table()
```

Automatically uses numeric sorting for Double/Integer parameters, string sorting otherwise.

---

## 11. Collection: Grouping & Aggregation

### GroupByParam — count per group

```csharp
GetElements("Structural Framing").GroupByParam("Type").Table()
// Group | Count
// Grade Beam | 81
// IntermediateBeams | 145
```

### GroupByParam with sum

```csharp
GetElements("Structural Columns").GroupByParam("Type", "Volume", "m3").Table()
// Group | Count | Total (m3)
// Basement Column | 21 | 3.250
```

### SumParam

```csharp
GetElements("Structural Framing").SumParam("Volume", "m3")  // 59.67
```

---

## 12. Collection: Bulk Write

All set operations run in a single transaction. All methods are chainable.

```csharp
GetElements("Walls")
    .WhereParam("Fire Rating", "None")
    .SetParam("Fire Rating", "2 hr")

GetElements("Structural Columns")
    .SetParam("Base Offset", -150, "mm")        // with unit conversion

GetElements("Doors")
    .SetParam("Mark", d => $"D-{d.RoomFrom()}")  // dynamic factory

GetElements("Walls")
    .SetParam("Mark", (w, idx) => $"W{idx+1:D3}") // indexed factory
```

### SetTypeParam — write a TYPE parameter across the collection

```csharp
GetElements("Structural Columns").SetTypeParam("Cost", "30.00 Birr")
GetElements("Structural Columns").SetTypeParam("b", 250, "mm")   // with unit conversion
```

⚠ **This does not touch each element — it touches each distinct `ElementType` once.** The collection is
collapsed to unique element types first (`GroupBy(t => t.Id.Value)`), then each type is written, all in
a single transaction. So a selection of 40 columns sharing 3 types produces **3 writes**, not 40, and
the change applies to **every instance of those types in the model** — including ones you did not
select. That is inherent to type parameters, not a bug; use `SetParam` (instance-level) when you mean
only what you selected.

---

## 13. Collection: Revit UI Actions

```csharp
elements.Select()                     // select in UI + zoom
elements.Zoom()                       // zoom to fit
elements.Isolate()                    // temporarily isolate
elements.Hide() / elements.Unhide()   // hide/unhide
elements.Delete()                     // delete all in one transaction
```

---

## 14. Collection: Notebook Export

```csharp
GetElements("Doors").ToNotebook("DoorAnalysis")
// → JSON file + auto-generated Jupyter Notebook, opens in VS Code
```

---

## 15. Numeric & Unit Helpers

### Unit Conversion

```csharp
// Input (human → Revit internal feet)
3.0.InputUnit("m")                    // 9.8425
150.InputUnit("mm")                   // 0.4921

// Output (Revit internal feet → human)
196.85.OutputUnit("m2")              // 18.29
area.OutputUnit("mm", 0)             // round to nearest mm

// String dimension parser
"50mm".ToMeters()                    // 0.05
"2ft".ToMeters()                     // 0.6096
```

### Formatting

```csharp
value.FormatUnit("m2")               // "18.29 m²"
value.FormatValueOnly("m2", 1)       // "18.3"
value.RoundTo("mm")                  // round internal value to nearest mm
```

### Unit Type Resolution

```csharp
UnitExtensions.GetUnitTypeId("m3")   // ForgeTypeId for cubic meters
```

Accepted unit strings: `mm`, `cm`, `m`, `km`, `in`, `ft`, `m2`, `sqm`, `ft2`, `sqft`, `m3`, `cum`, `ft3`, `cuft`, `deg`, `%`, `kg`, `nr`, `no`

### Precision-Aware Comparisons (fuzzy equality)

```csharp
x.IsAlmostEqualTo(y)                 // tolerance 1e-9
x.AlmostZero()                       // |x| < 1e-9
x.IsLessThan(limit) / IsGreaterThan(limit)
x.IsLessThanOrEqual(limit) / IsGreaterThanOrEqual(limit)
x.IsPositive() / IsNegative()
```

⚠ **These are not the raw operators — the tolerance band is excluded.** `IsLessThan` is
`x < limit` **only when the two are not almost equal**; a value inside 1e-9 of the limit is neither
less nor greater, so both return false. `IsLessThanOrEqual` / `IsGreaterThanOrEqual` add the band back
(`x < limit || x.IsAlmostEqualTo(limit)`), which makes them the safe choice for a boundary test —
`IsLessThanOrEqual(2000)` accepts a 2000.0000000001 from unit-conversion noise, `IsLessThan` does not.
`IsPositive` / `IsNegative` likewise mean *outside the band* (`x > tolerance` / `x < -tolerance`), so a
0.0000000001 is neither positive nor negative. All take an optional `tolerance` third argument.

---


---

## 16. Global ScriptApi Methods

These are called directly without a prefix — available in every script.

### Properties

```csharp
Doc           // current Document
UIApp         // current UIApplication
UIDoc         // current UIDocument
ActiveView    // current active View
Selection     // current selected elements
Parameters    // parameters from agent/UI context
```

### Output

```csharp
Println(message)          // print to console
Table(data)               // render list as interactive table
Table(elements)           // render elements (adapts columns to element kind)
BarGraph(data)            // bar chart
PieGraph(data)            // pie chart
LineGraph(data)           // line chart
Show("table", data)       // generic render
```

### Element Retrieval

```csharp
GetElement<Wall>("name-or-id")              // single element
GetElements<Wall>()                         // all Walls (typed)
GetElements<FamilyInstance>("Doors")        // typed, door category
GetElements("Walls")                        // untyped
GetElements(BuiltInCategory.OST_Doors)      // by BuiltInCategory
GetMagicNames()                             // all discoverable categories/classes
GetCategories()                             // all Revit categories in doc
```

### Transactions

```csharp
Transact("My Operation", () => { /* modify doc */ });
Transact("With Doc Access", doc => { /* use doc */ });
Regen()                   // regenerate the document (opens the transaction for you)
```

⚠ `Doc.Regenerate()` requires an open transaction — called outside one it throws *"Modification of
the document is forbidden"*, which names neither the method nor the cause. `Regen()` wraps it.
You rarely need it: a committed transaction already regenerates, and `ExportImage` exports after the
model has settled.

### Batches — one build stage, stamped and reversible

```csharp
var report = Batch("ESB-v3", "Create walls", () => { /* one stage */ });
ListBatch("ESB-v3").Table()                  // what the stage made, BY THE STAMP
var r = DeleteBatch("ESB-v3");               // DRY RUN — reports the count, deletes nothing
var r2 = DeleteBatch("ESB-v3", confirm: true);   // actually deletes
```

`Batch` is a `TransactionGroup`: the whole stage is ONE undo unit, and every element it creates is
**stamped** with the batch id in ExtensibleStorage — no parameter to add, no project to set up.
The stamp is what makes "redo the walls" possible without redoing the levels. The batch id is the
**spec's** version, not a timestamp.

⚠⚠ **Read the stamp count in the report.** `created 12 … stamped 0` means the stage committed but
nothing carries the id, so `ListBatch` will never find those elements and `DeleteBatch` can never
remove them. The report prints `COMMITTED BUT STAMPED NOTHING` for exactly this case.

⚠ `DeleteBatch` DELETES NOTHING unless you pass `confirm: true`. A count is returned either way, and
Revit refuses some deletions outright (pinned, hosted) — if `carried` and `deleted` disagree, list
the batch again rather than assuming it is gone.

⚠ A batch is **per-DOCUMENT** — the stamp lives in the model file, so a batch built in one file is
invisible in another. Stamp only what the stage itself MADE.

⚠ `Batch` re-throws when the stage body fails (same contract as `Transact`): a stage that threw has
NOT been built, so the script must not carry on as though it had. `DeleteBatch` does NOT throw — it
returns a report. Full recipe: the `project-modeling` skill.

### ⚠⚠ Checkpoints — Mark / RollbackTo, the undo the staged workflow was missing

`Batch` + `DeleteBatch` undo what a stage **created**. They cannot undo a stage that **moved,
re-typed or edited** elements that already existed — a stamp only marks what a stage made. A
checkpoint is a whole-document bookmark that covers both:

```csharp
Mark("stage-3-rooms", "before rooms and tags");   // READ ONLY — snapshots ids + parameter values
// … build the stage, export a view, look at it …
RollbackTo("stage-3-rooms");                      // DRY RUN — reports what it WOULD undo
RollbackTo("stage-3-rooms", confirm: true);       // deletes what was created, restores what changed
Checkpoints()                                     // what exists in THIS document
DropCheckpoint("stage-3-rooms")                   // forget the bookmark; the model is untouched
```

`Mark` snapshots every element id plus every **writable** parameter value (type parameters are
captured on the type, not once per instance). `RollbackTo` then deletes the elements that did not
exist at the mark and writes back the values that changed.

⚠⚠ **DESTRUCTIVE — `confirm: true` is required**, the same contract as `DeleteBatch`. The default is
a dry run that reports the counts and changes nothing.

⚠ The RESTORE runs before the DELETE: `Doc.Delete` cascades (a wall takes its hosted doors), and a
cascade must not run before the values it would otherwise preserve are back.

⚠ **A checkpoint is per-DOCUMENT** (keyed by its path) and lives in the process, not in the model
file — unlike a batch stamp, it does not survive a restart or a re-open. Take the mark in the session
that is about to build.

⚠ It is a snapshot restore, not a Revit undo: it survives any number of intervening transactions and
works across a committed `Batch`, which a transaction group cannot. The report's `Note` line carries
the real numbers — e.g. `12 element(s) restored · 7 created element(s) deleted`.

### Interaction & background tasks

```csharp
Pick()                        // prompt the user to pick ONE element in the Revit UI
Print(message)                // alias for Println — the legacy name, kept for compatibility
SetExecutionTimeout(seconds)  // raise the script budget (default 10 s)
Watchdog(callback, 5)         // run `callback` when Revit is IDLE, at most every 5 s
WatchdogReport("Found 5 issues", "warning")   // report a watchdog run's outcome
```

⚠ `SetExecutionTimeout` — the default budget is **10 seconds** and the clock starts when the script
does, so call it as the FIRST statement, not once the expensive work has already begun.

⚠ `Watchdog` fires on Revit **idle**, not on a timer: `intervalSeconds` is a MINIMUM gap and Revit
must actually go idle for it to run. Called outside a registration context (e.g. straight from the
REPL) it runs the callback ONCE immediately so the logic can be tested in the Console. The two
overloads differ only in whether the callback receives the `Document`. Backed by `WatchdogRegistry`.

### UI Actions (on collections, without prefixes)

```csharp
Select(elements)          // select + zoom in Revit
Isolate(elements)         // isolate + zoom
Zoom(elements)            // zoom to fit
```

### Image Export

Render a view to an image file — how a script, or an AI agent driving the REPL, **looks** at what
it built. Returns the path that was actually written.

```csharp
// Active view → returns the file that exists
var shot = ExportImage(@"C:\tmp\current");

// A named view, at 2000 px
var elev = ExportImage(@"C:\tmp\north-elev", "North Elevation", 2000);

// Keep the level/grid tags in the picture (they are suppressed by default)
var tagged = ExportImage(@"C:\tmp\tagged", "Ground Floor", 2000, hideAnnotation: false);
```

⚠ **Use the RETURN value — it is the file that exists, not the path you passed.** Revit appends the
view identity to the base name and may change the extension: asking for `C:\tmp\shot` on the default
3D view writes `C:\tmp\shot - 3D View - {3D}.jpg`. **A 3D or shaded view is written as `.jpg` even
though PNG is requested.**

⚠ **Annotation is suppressed by default** (`hideAnnotation: true`). Revit's export does not clip
annotation to the view, so level heads, grid bubbles and elevation/section marks are drawn wherever
they sit — and because the whole extent is fitted to the page, they **shrink the subject**. A plan
view with elevation markers beside it renders the building into a fraction of the frame. The whole
`CategoryType.Annotation` set is hidden for the export and restored afterwards (no undo entry).

- Pass the path **without** an extension. The directory is created if it does not exist.
- `viewName` omitted ⇒ the **active view**. Matched case-insensitively; view templates are rejected.
- **No `Transact()` needed** — the suppression transaction is opened and rolled back internally, so
  the model and the view are unchanged when this returns.

---

## 17. Complete Fluent Chain Examples

```csharp
// Doors on Level 1, sorted by width
GetElements<FamilyInstance>("Doors")
    .WhereParam("Level", "Level 1")
    .StandardDoor()
    .OrderByParam("Width")
    .Table()

// Concrete framing by type with volume totals
GetElements("Structural Framing")
    .WhereMaterial("Concrete")
    .GroupByParam("Type", "Volume", "m3")
    .Table()

// Find and fix missing fire ratings
GetElements("Walls")
    .WhereParam("Fire Rating", "None")
    .SetParam("Fire Rating", "2 hr")
    .Select()

// Heavy columns
GetElements<FamilyInstance>("Structural Columns")
    .WhereParam("Volume", ">", 1.0, "m3")
    .OrderByParamDesc("Volume")
    .Table()

```

---

## Appendix A — Generated API Index

⚠ **The region below is GENERATED from the engine's C# source — do not edit it by hand.** It is
rebuilt by `paracore/scripts/gen-ext-methods.py` (`--write`), which
`paracore/scripts/gen-engine-docs.py` runs for every copy of this file. See the note at the top of
this document.

<!-- GENERATED:EXT-INDEX:BEGIN -->
⚠ **GENERATED — do not edit this region.** Extracted from `CoreScript.Engine/` by `paracore/scripts/gen-ext-methods.py`.

The extraction is mechanical: it lists what the source declares, so it cannot forget a member. `python scripts/gen-ext-methods.py --write` refreshes it; `--check` fails when it is stale.

### A.1 Extension methods — `this`-receivers

**119 declarations · 87 distinct names · 16 source files.**

Called on an element or a collection: `GetElements("Walls").WhereParam(...)`. The `this` on the first parameter is the test.

#### `Globals/CollectionAggregateExtensions.cs`

| Method | Signature |
| --- | --- |
| `SumParam` | `double SumParam<T>(this IEnumerable<T> elements, string name, string unit = null, int decimals = 3)` |
| `OrderByParam` | `IEnumerable<T> OrderByParam<T>(this IEnumerable<T> elements, string name)` |
| `OrderByParamDesc` | `IEnumerable<T> OrderByParamDesc<T>(this IEnumerable<T> elements, string name)` |
| `GroupByParam` | `IEnumerable<object> GroupByParam<T>(this IEnumerable<T> elements, string groupBy)` |
| `GroupByParam` | `IEnumerable<object> GroupByParam<T>(this IEnumerable<T> elements, string groupBy, string sum, string unit = "")` |

#### `Globals/CollectionUIExtensions.cs`

| Method | Signature |
| --- | --- |
| `Delete` | `IEnumerable<T> Delete<T>(this IEnumerable<T> elements)` |
| `Select` | `IEnumerable<T> Select<T>(this IEnumerable<T> elements)` |
| `Zoom` | `IEnumerable<T> Zoom<T>(this IEnumerable<T> elements)` |
| `Isolate` | `IEnumerable<T> Isolate<T>(this IEnumerable<T> elements)` |
| `Hide` | `IEnumerable<T> Hide<T>(this IEnumerable<T> elements)` |
| `Unhide` | `IEnumerable<T> Unhide<T>(this IEnumerable<T> elements)` |

#### `Globals/CollectionWriteExtensions.cs`

| Method | Signature |
| --- | --- |
| `SetParam` | `IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, object value)` |
| `SetParam` | `IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, object value, string unit)` |
| `SetParam` | `IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, Func<T, object> valueFactory)` |
| `SetParam` | `IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, Func<T, int, object> valueFactory)` |
| `SetTypeParam` | `IEnumerable<T> SetTypeParam<T>(this IEnumerable<T> elements, string name, object value)` |
| `SetTypeParam` | `IEnumerable<T> SetTypeParam<T>(this IEnumerable<T> elements, string name, object value, string unit)` |

#### `Globals/ElementDiscoveryExtensions.cs`

| Method | Signature |
| --- | --- |
| `BuiltInParams` | `IEnumerable<object> BuiltInParams(this Element e)` |
| `InstanceParams` | `IEnumerable<object> InstanceParams(this Element e)` |
| `TypeParams` | `IEnumerable<object> TypeParams(this Element e)` |
| `CombinedParams` | `IEnumerable<object> CombinedParams(this Element e)` |
| `ParamsDict` | `Dictionary<string, string> ParamsDict(this Element e)` |
| `NativeProperties` | `IEnumerable<object> NativeProperties(this Element e)` |

#### `Globals/ElementDoorExtensions.cs`

| Method | Signature |
| --- | --- |
| `RoomFrom` | `string RoomFrom(this Element e)` |
| `RoomTo` | `string RoomTo(this Element e)` |
| `RoomAccess` | `string RoomAccess(this Element e)` |
| `RoomDestination` | `string RoomDestination(this Element e)` |
| `Handing` | `string Handing(this Element e)` |
| `HingeSide` | `string HingeSide(this Element e)` |
| `FindSwingArc` | `Arc? FindSwingArc(this Element e)` |
| `IsHandFlipped` | `bool IsHandFlipped(this FamilyInstance fi)` |
| `IsFacingFlipped` | `bool IsFacingFlipped(this FamilyInstance fi)` |
| `IsStandardDoor` | `bool IsStandardDoor(this FamilyInstance fi)` |
| `StandardDoor` | `IEnumerable<FamilyInstance> StandardDoor(this IEnumerable<FamilyInstance> elements)` |

#### `Globals/ElementExtensions.cs`

| Method | Signature |
| --- | --- |
| `ReflectionProperties` | `IEnumerable<object> ReflectionProperties(this Element e)` |
| `ReflectionMethods` | `IEnumerable<object> ReflectionMethods(this Element e)` |
| `Matches` | `bool Matches(this Element e, string pattern)` |
| `FamilyName` | `string FamilyName(this Element e)` |
| `Materials` | `IEnumerable<Material> Materials(this Element e)` |
| `MaterialNames` | `IEnumerable<string> MaterialNames(this Element e)` |
| `GetMaterialNames` | `string GetMaterialNames(this Element e)` |
| `ToElement` | `Element ToElement(this long id, Document doc)` |
| `ToElement` | `Element ToElement(this int id, Document doc)` |
| `ToElement` | `Element ToElement(this ElementId id, Document doc)` |
| `WhereParam` | `IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string value)` |
| `WhereParam` | `IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, double value, string unit = "")` |
| `WhereParam` | `IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, double value, string unit = "")` |
| `WhereParam` | `IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, string value)` |
| `WhereCategory` | `IEnumerable<T> WhereCategory<T>(this IEnumerable<T> elements, params string[] categories)` |
| `WhereAnyParam` | `IEnumerable<T> WhereAnyParam<T>(this IEnumerable<T> elements, string[] names, string value)` |
| `WhereAnyParam` | `IEnumerable<T> WhereAnyParam<T>(this IEnumerable<T> elements, string[] names, string op, string value)` |
| `WhereTypeParam` | `IEnumerable<T> WhereTypeParam<T>(this IEnumerable<T> elements, string paramName, string op, string value)` |
| `WhereMatches` | `IEnumerable<T> WhereMatches<T>(this IEnumerable<T> elements, string pattern)` |
| `WhereMaterial` | `IEnumerable<T> WhereMaterial<T>(this IEnumerable<T> elements, string materialName)` |
| `WhereMaterialNot` | `IEnumerable<T> WhereMaterialNot<T>(this IEnumerable<T> elements, string materialName)` |

#### `Globals/ElementFaceExtensions.cs`

| Method | Signature |
| --- | --- |
| `FaceRefs` | `FaceRefIndex FaceRefs(this IEnumerable<Element> elements)` |
| `FaceRefs` | `FaceRefIndex FaceRefs(this Document doc)` |
| `SideFaceRefs` | `IReadOnlyList<FaceRef> SideFaceRefs(this Wall wall)` |
| `ChainDim` | `Dimension ChainDim(this View view, string axis, double lineMm, params double[] planeMm)` |
| `ChainDim` | `Dimension ChainDim(this View view, FaceRefIndex faces, string axis, double lineMm, params double[] planeMm)` |

#### `Globals/ElementGeometryExtensions.cs`

| Method | Signature |
| --- | --- |
| `GeometrySummary` | `List<object> GeometrySummary(this Element e)` |
| `GetZSpan` | `(double Bot, double Top) GetZSpan(this Room room)` |

#### `Globals/ElementParamExtensions.cs`

| Method | Signature |
| --- | --- |
| `GetStr` | `string GetStr(this Element e, string name)` |
| `GetStr` | `string GetStr(this Element e, string name, string unit, int decimals = 2)` |
| `GetNum` | `double GetNum(this Element e, string name)` |
| `GetInt` | `int GetInt(this Element e, string name)` |
| `GetVal` | `string GetVal(this Element e, string name)` |
| `GetVal` | `string GetVal(this Element e, string name, string unit, int decimals = 2)` |
| `GetNum` | `double GetNum(this Element e, string name, string unit, int decimals = 2)` |
| `GetElementType` | `Element GetElementType(this Element e)` |
| `GetTypeStr` | `string GetTypeStr(this Element e, string name)` |
| `GetTypeStr` | `string GetTypeStr(this Element e, string name, string unit, int decimals = 2)` |
| `GetTypeNum` | `double GetTypeNum(this Element e, string name)` |
| `GetTypeNum` | `double GetTypeNum(this Element e, string name, string unit, int decimals = 2)` |
| `GetTypeInt` | `int GetTypeInt(this Element e, string name)` |
| `GetTypeVal` | `string GetTypeVal(this Element e, string name)` |
| `GetTypeVal` | `string GetTypeVal(this Element e, string name, string unit, int decimals = 2)` |

#### `Globals/ElementSwapExtensions.cs`

| Method | Signature |
| --- | --- |
| `SwapSymbol` | `FamilySymbol? SwapSymbol(this FamilyInstance instance, FamilySymbol symbol)` |
| `NewType` | `FamilySymbol NewType(this FamilyInstance instance, string typeName)` |

#### `Globals/ElementTypeWriteGuard.cs`

| Method | Signature |
| --- | --- |
| `IsTypeParameter` | `bool IsTypeParameter(this Parameter p)` |
| `TypeInstanceCount` | `int TypeInstanceCount(this Element e)` |

#### `Globals/ElementUIExtensions.cs`

| Method | Signature |
| --- | --- |
| `Select` | `Element Select(this Element e)` |
| `Zoom` | `Element Zoom(this Element e)` |
| `Isolate` | `Element Isolate(this Element e)` |
| `Delete` | `Element Delete(this Element e)` |
| `Hide` | `Element Hide(this Element e)` |
| `Unhide` | `Element Unhide(this Element e)` |

#### `Globals/ElementWriteExtensions.cs`

| Method | Signature |
| --- | --- |
| `SetNum` | `void SetNum(this Element e, string name, double value, string unit)` |
| `SetVal` | `void SetVal(this Element e, string name, object value)` |
| `SetVal` | `void SetVal(this Element e, string name, object value, string unit)` |
| `SetTypeVal` | `void SetTypeVal(this Element e, string name, object value)` |
| `SetTypeVal` | `void SetTypeVal(this Element e, string name, object value, string unit)` |
| `SetTypeNum` | `void SetTypeNum(this Element e, string name, double value, string unit)` |

#### `Globals/NotebookExtensions.cs`

| Method | Signature |
| --- | --- |
| `ToNotebook` | `IEnumerable<T> ToNotebook<T>(this IEnumerable<T> elements, string notebookName = "Paracore_Analysis")` |

#### `Globals/UnitExtensions.cs`

| Method | Signature |
| --- | --- |
| `InputUnit` | `double InputUnit(this double value, string unit)` |
| `InputUnit` | `double InputUnit(this int value, string unit)` |
| `InputUnit` | `double InputUnit(this decimal value, string unit)` |
| `OutputUnit` | `double OutputUnit(this double value, string unit, int decimals = 2)` |
| `OutputUnit` | `double OutputUnit(this int value, string unit, int decimals = 2)` |
| `OutputUnit` | `double OutputUnit(this decimal value, string unit, int decimals = 2)` |
| `IsAlmostEqualTo` | `bool IsAlmostEqualTo(this double value, double other, double tolerance = 1e-9)` |
| `AlmostZero` | `bool AlmostZero(this double value, double tolerance = 1e-9)` |
| `IsLessThan` | `bool IsLessThan(this double value, double limit, double tolerance = 1e-9)` |
| `IsGreaterThan` | `bool IsGreaterThan(this double value, double limit, double tolerance = 1e-9)` |
| `IsLessThanOrEqual` | `bool IsLessThanOrEqual(this double value, double limit, double tolerance = 1e-9)` |
| `IsGreaterThanOrEqual` | `bool IsGreaterThanOrEqual(this double value, double limit, double tolerance = 1e-9)` |
| `IsPositive` | `bool IsPositive(this double value, double tolerance = 1e-9)` |
| `IsNegative` | `bool IsNegative(this double value, double tolerance = 1e-9)` |
| `RoundTo` | `double RoundTo(this double value, string unit, int decimals = 2)` |
| `FormatUnit` | `string FormatUnit(this double value, string unit, int decimals = 2)` |
| `FormatValueOnly` | `string FormatValueOnly(this double value, string unit, int decimals = 2)` |
| `ToMeters` | `double ToMeters(this string value)` |

#### `Globals/VisualizationExtensions.cs`

| Method | Signature |
| --- | --- |
| `Peek` | `Element Peek(this Element e)` |
| `Peek` | `IEnumerable<Element> Peek(this IEnumerable<Element> data)` |
| `Show` | `IEnumerable<T> Show<T>(this IEnumerable<T> data)` |
| `Table` | `IEnumerable<T> Table<T>(this IEnumerable<T> data)` |
| `BarGraph` | `IEnumerable<T> BarGraph<T>(this IEnumerable<T> data)` |
| `PieGraph` | `IEnumerable<T> PieGraph<T>(this IEnumerable<T> data)` |
| `LineGraph` | `IEnumerable<T> LineGraph<T>(this IEnumerable<T> data)` |

### A.2 Global `ScriptApi` surface — no prefix

**49 members · 36 distinct names · 5 source files.**

Called bare, without a receiver: `Doc`, `GetElements<Wall>()`, `Transact(...)`. ⚠ These are NOT extension methods — the `this` test does not see them, which is why this half of the reference used to drift on its own.

#### `Globals/ScriptApi.Batch.cs`

| Member | Signature |
| --- | --- |
| `Batch` | `BatchReport Batch(string batchId, Action body)` |
| `Batch` | `BatchReport Batch(string batchId, Action<Document> body)` |
| `Batch` | `BatchReport Batch(string batchId, string stageName, Action body)` |
| `StampBatch` | `int StampBatch(string batchId, IEnumerable<ElementId> ids)` |
| `GetBatchId` | `string GetBatchId(Element element)` |
| `GetBatchId` | `string GetBatchId(ElementId id)` |
| `ListBatch` | `IReadOnlyList<BatchElement> ListBatch(string batchId)` |
| `DeleteBatch` | `BatchReport DeleteBatch(string batchId, bool confirm = false)` |

#### `Globals/ScriptApi.Checkpoints.cs`

| Member | Signature |
| --- | --- |
| `Mark` | `Checkpoint Mark(string name, string note = "")` |
| `Checkpoints` | `IReadOnlyList<Checkpoint> Checkpoints()` |
| `DropCheckpoint` | `bool DropCheckpoint(string name)` |
| `RollbackTo` | `BatchReport RollbackTo(string name, bool confirm = false)` |

#### `Globals/ScriptApi.Sentinels.cs`

| Member | Signature |
| --- | --- |
| `Watchdog` | `void Watchdog(Action<Document> callback, int intervalSeconds = 5)` |
| `Watchdog` | `void Watchdog(Action callback, int intervalSeconds = 5)` |
| `WatchdogReport` | `void WatchdogReport(string summary, string status = "success", object? data = null)` |

#### `Globals/ScriptApi.ViewExport.cs`

| Member | Signature |
| --- | --- |
| `ExportImage` | `string ExportImage(string path, string? viewName = null, int pixelSize = 1200, bool hideAnnotation = true)` |

#### `Globals/ScriptApi.cs`

| Member | Signature |
| --- | --- |
| `UIApp` | `UIApplication UIApp` |
| `UIDoc` | `UIDocument UIDoc` |
| `Doc` | `Document Doc` |
| `ActiveView` | `View ActiveView` |
| `Selection` | `List<Element> Selection` |
| `Pick` | `Element Pick()` |
| `Parameters` | `Dictionary<string, object> Parameters` |
| `Println` | `void Println(string message)` |
| `Println` | `void Println(object message)` |
| `Println` | `void Println()` |
| `Print` | `void Print(string message)` |
| `Print` | `void Print(object message)` |
| `Transact` | `TxReport Transact(string name, Action<Document> action)` |
| `Transact` | `TxReport Transact(string name, Action action)` |
| `Regen` | `void Regen()` |
| `Show` | `void Show(string type, object data)` |
| `Table` | `void Table(object data)` |
| `Table` | `void Table(IEnumerable<Element> elements)` |
| `Select` | `void Select(IEnumerable<Element> elements)` |
| `Isolate` | `void Isolate(IEnumerable<Element> elements)` |
| `Zoom` | `void Zoom(IEnumerable<Element> elements)` |
| `BarGraph` | `void BarGraph(object data)` |
| `PieGraph` | `void PieGraph(object data)` |
| `LineGraph` | `void LineGraph(object data)` |
| `SetExecutionTimeout` | `void SetExecutionTimeout(int seconds)` |
| `GetElement` | `T? GetElement<T>(string identity) where T : Element` |
| `GetElement` | `Element? GetElement(string identity)` |
| `GetElements` | `PipelineEnumerable<T> GetElements<T>() where T : Element` |
| `GetElements` | `PipelineEnumerable<T> GetElements<T>(string categoryName) where T : Element` |
| `GetElements` | `PipelineEnumerable<Element> GetElements(BuiltInCategory category)` |
| `GetElements` | `PipelineEnumerable<Element> GetElements(string categoryOrClass)` |
| `GetMagicNames` | `List<string> GetMagicNames()` |
| `GetCategories` | `List<string> GetCategories()` |
<!-- GENERATED:EXT-INDEX:END -->
