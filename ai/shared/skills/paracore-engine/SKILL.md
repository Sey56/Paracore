---
name: paracore-engine
description: The Paracore engine API for Revit — element retrieval, parameter read/write, filtering, sorting, grouping, units, UI actions and diagnostics. Read this BEFORE writing any element query or document modification in a Paracore script, and before reaching for the raw Revit API. Carries the complete extension-method reference.
---

# Paracore engine API

The engine puts a fluent, unit-aware, transaction-safe API on **every element** and on **every
element collection**. It replaces nearly all raw Revit boilerplate. Use it first; this skill maps
the methods you will reach for most, and `references/EXTENSION_METHODS.md` is the **complete,
authoritative** list.

## Getting elements

Three forms — know which one you need:

```csharp
// ① SYSTEM families (Wall, Floor, Room, Ceiling, Level, …) — type in <>, NO category string
GetElements<Wall>()                       // typed Wall instances
GetElements<WallType>()                   // typed wall type definitions

// ② LOADABLE families (Doors, Windows, Furniture, Columns, …) — CLASS in <>, CATEGORY in ()
GetElements<FamilyInstance>("Doors")      // typed instances
GetElements<FamilySymbol>("Doors")        // typed type symbols

// ③ Category string only — untyped; use only when you do not need the typed form
GetElements("Walls")
GetElements(BuiltInCategory.OST_Doors)    // by BuiltInCategory
GetElements<Element>()                    // universal — every element in the model
```

⚠ **A category name is not a class name.** The string is the **PLURAL category name** —
`"Walls"`, `"Doors"`, `"Structural Columns"`. Matching is lenient: the exact name
(case-insensitive), the no-space form (`"StructuralColumns"`), or a `BuiltInCategory` substring
(`"OST_StructuralFraming"`) all resolve to the same category. Structural Columns are **loadable**,
so the typed form is `GetElements<FamilyInstance>("Structural Columns")` — **there is no
`StructuralColumn` type**. A *system* family needs no category at all: `GetElements<Wall>()`.

Single element: `GetElement<Wall>("name-or-id")` · `GetElement("name-or-id")`.
Discovery: `GetMagicNames()` (every targetable category/family/class) · `GetCategories()`.

⚠ `GetElements<T>()` returns a `PipelineEnumerable<T>` that **reports the element count at every
stage** of a chain, so you can see exactly where a pipeline dropped rows.

## Parameter names differ per category — verify, never assume

| Concept | Walls | Rooms | Columns | Floors | Doors/Windows | Ceilings |
|---|---|---|---|---|---|---|
| Level | `Base Constraint` | `Level` | `Base Level` | `Level` | `Level` | `Level` |
| Top Level | `Top Constraint` | — | `Top Level` | — | — | — |
| Base Offset | `Base Offset` | — | `Base Offset` | — | — | — |
| Top Offset | `Top Offset` | — | `Top Offset` | — | — | — |
| Height | `Unconnected Height` | — | — | — | — | — |
| Length | `Length` | — | — | — | — | — |
| Area | `Area` | `Area` | — | `Area` | — | `Area` |
| Width | `Width` | — | `Width` | — | `Width` (type) | — |
| Thickness | — | — | — | `Thickness` | — | — |
| Mark | `Mark` | — | `Mark` | `Mark` | `Mark` | `Mark` |
| Comments | `Comments` | `Comments` | `Comments` | `Comments` | `Comments` | `Comments` |
| Fire Rating | `Fire Rating` | — | `Fire Rating` | `Fire Rating` | `Fire Rating` | `Fire Rating` |
| Type Name | `Type Name` | — | `Type Name` | `Type Name` | `Type Name` | `Type Name` |
| Volume | `Volume` | `Volume` | `Volume` | `Volume` | — | `Volume` |

**Always explore the model before assuming a name** — `el.CombinedParams().Table()` lists what
actually exists. `GetStr("Level")` is special: it works on *all* categories through a
category-specific fallback chain (Reference Level → Base Level → Base Constraint → native `LevelId`).

## Reading

```csharp
el.GetStr("Comments")                 // string; resolves ElementIds → names, falls back to Type params
el.GetStr("Length", "mm")             // unit-converted string, 2 decimals
el.GetStr("Area", "m2", 4)            // …with an explicit decimal count
el.GetNum("Area")                     // double, raw internal feet
el.GetNum("Length", "m")              // double, converted
el.GetVal("Width")                    // WYSIWYG — exactly what Revit's Properties palette shows
el.GetInt("Is External")              // int (yes/no → 1 or 0)
```

Instance getters **auto-fall back to Type parameters**, so `GetTypeStr` / `GetTypeNum` /
`GetTypeInt` / `GetTypeVal` are only needed when instance and type share a parameter name.
`GetElementType()` returns the `ElementType` for any instance.

⚠ An unknown parameter returns `""` silently and logs a **one-time warning** — safe for chained
queries, but it means a typo does not throw. Verify names with `.CombinedParams().Table()`.

## Writing

```csharp
el.SetVal("Comments", "Reviewed")      // string
el.SetVal("Base Offset", "500 mm")     // value string — the unit is parsed out of it
el.SetVal("Base Offset", -150, "cm")   // numeric + unit conversion
el.SetVal("Level", "Level 2")          // ElementId resolved by name
el.SetVal("Pinned", true)              // native C# property, via Reflection
el.SetNum("Unconnected Height", 3.0, "m")

// Type-level writes — these hit EVERY instance of that type, not just this one
el.SetTypeVal("Cost", "30.00 Birr")    // SetVal on the element's ElementType
el.SetTypeNum("h", 300, "mm")
```

`SetVal` / `SetNum` open a transaction for you when none is active. `SetTypeVal` / `SetTypeNum`
are `void` and silently no-op when the element has no `ElementType` (e.g. a `Wall`).

## Filtering, sorting, grouping

```csharp
// Exact / operator string match
walls.WhereParam("Base Constraint", "Level 1")
doors.WhereParam("Comments", "!=", "")            // has a comment
doors.WhereParam("Mark", "starts", "D-")          // starts / contains / ends
GetElements("Walls").WhereParam("Comments", "!=", "")

// Numeric
walls.WhereParam("Width", 200, "mm")              // equality, with tolerance
rooms.WhereParam("Area", ">", 25.0, "m2")         // > < >= <= !=
GetElements<Element>().WhereCategory("Structural Framing", "Structural Columns", "Floors")

// Fuzzy / material / any-of
elements.WhereMatches("Single-Flush")             // searches Type Name AND Family Name
GetElements("Walls").WhereAnyParam(new[]{"Comments","Mark"}, "fire")
GetElements("Walls").WhereTypeParam("Material", "contains", "HCB")
GetElements("Structural Framing").WhereMaterial("Concrete")
GetElements("Structural Framing").WhereMaterialNot("Steel")
doors.StandardDoor()                              // excludes curtain-wall glass doors

// Sort — numeric or string, auto-detected
.OrderByParam("Area")  .OrderByParamDesc("Area")  .OrderByParam("Mark")
```

⚠ **Chained filters AND together.** To match **any** of several categories you need `WhereCategory`
— `WhereParam` cannot express an OR. ⚠ **`.ThenBy` is broken in the REPL host** — it discards the
primary ordering. `OrderBy` alone is stable; for a second key, sort inside one lambda.

```csharp
// Group + count → Group | Count
GetElements("Doors").GroupByParam("Level")
// Group + count + sum → Group | Count | Total
GetElements("Rooms").GroupByParam("Level", "Area", "m2")
walls.SumParam("Length", "m")                     // sum only, returns double
```

`GroupByParam` chains **directly** to `.Table()` / `.BarGraph()` / `.PieGraph()` — no `.Select()`.

## Bulk write and Revit UI

```csharp
elements.SetParam("Comments", "Pending Review")   // one transaction for the whole collection
elements.SetParam("Top Offset", -150, "cm")
elements.SetParam("Mark", d => $"D-{d.RoomFrom()}")        // factory
elements.SetParam("Mark", (w, idx) => $"W{w+1:D3}")        // indexed factory
elements.SetTypeParam("Cost", "30.00 Birr")       // writes each DISTINCT type once

elements.Select(); elements.Zoom(); elements.Isolate()
elements.Hide(); elements.Unhide(); elements.Delete()    // Delete skips Pinned + curtain panels
elements.Peek()                                            // forensic dump of every parameter
```

⚠ `SetTypeParam` collapses the collection to **unique element types** and writes each once — so 40
selected columns over 3 types is 3 writes, and the change applies to **every instance of those
types in the model**, including ones you did not select. That is inherent to type parameters.

## Displaying results

```csharp
// CORRECT — pick explicit columns first
GetElements<Wall>()
    .WhereParam("Base Constraint", "Level 1")
    .Select(w => new {
        Id = w.Id.Value,
        Name = w.Name,
        Length = w.GetNum("Length", "cm"),
        Level = w.GetStr("Base Constraint")
    })
    .Table();

// WRONG — dumps hundreds of columns
GetElements("Walls").Table();
```

Column names must **exactly match the parameter name** (underscores for spaces) with **no unit
suffix**. Charts: `.Table()`, `.BarGraph()`, `.PieGraph()`, `.LineGraph()`.

## Diagnostics

```csharp
el.CombinedParams().Table()      // instance + type + native, with Scope | Name | Storage | Value
el.Peek()                        // every parameter, side by side — the forensic view
el.InstanceParams().Table()      // instance only
el.TypeParams().Table()          // type only
el.BuiltInParams().Table()       // BuiltInParameter identifiers
el.NativeProperties().Table()    // Name, Id, Category, Level, Workset, Pinned, Location…
el.ReflectionProperties().Table();  el.ReflectionMethods().Table()
el.ParamsDict()                  // Dictionary<string, string>
el.FamilyName();  el.Matches("Single")
id.ToElement(Doc)                // ElementId / long / int → Element
```

## Domain helpers

```csharp
// Doors & windows — orientation is stable regardless of flips
fi.RoomFrom();  fi.RoomTo();  fi.Handing();  fi.HingeSide()
fi.IsHandFlipped();  fi.IsFacingFlipped();  fi.FindSwingArc()

// Materials & geometry
el.Materials();  el.MaterialNames();  el.GetMaterialNames()
el.GeometrySummary().Table()     // solids | curves | polylines, in world space

// Notebook export
GetElements<Room>().Select(r => new { Number = r.GetStr("Number"), Area = r.Area.OutputUnit("m2", 2) })
    .ToNotebook("Room_Analysis");
```

⚠ **Enterprise-gated, not always present:** clash detection
(`elements.AuditClashes("StructuralColumns", "2mm")`, `Doc.ClearClashHelpers()`) and sustainability
(`Eco.GetCarbon(wall)`, `Eco.GetUValue(wall)`, `Eco.GetWeather()`) require a Pro licence. Do not
assume they are available — guard or ask.

## Units and precision

```csharp
3.6.InputUnit("m")                  // human → internal feet
value.OutputUnit("m2", 3)           // internal → human, 3 decimals
value.FormatUnit("mm")              // "3600.0 mm"
value.FormatValueOnly("mm")         // "3600"  — no suffix, good for CSV
value.RoundTo("mm", 0)              // snap to the nearest mm, return internal feet
"50mm".ToMeters()                   // 0.05
x.IsAlmostEqualTo(y);  x.AlmostZero();  x.IsLessThan(limit);  x.IsGreaterThan(limit)
x.IsLessThanOrEqual(limit);  x.IsGreaterThanOrEqual(limit);  x.IsPositive();  x.IsNegative()
```

Strings: `mm cm m km in ft m2 sqm ft2 sqft m3 cum ft3 cuft deg % kg nr no`.

## The complete reference

`references/EXTENSION_METHODS.md` — **every** extension method the engine declares, with signatures,
overloads and worked chains. Read it when this skill does not cover the method you need, when you
are unsure whether an overload exists, or before concluding that the raw Revit API is required.

If you need a method that is in neither this skill nor that reference, the correct move is **LINQ**
on the element collection — and only then the raw Revit API.
