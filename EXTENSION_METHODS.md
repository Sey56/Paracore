# 🧩 Paracore Extension Methods Reference

A comprehensive guide to every extension method available on Revit elements and collections in Paracore scripts. All methods are globally available in the REPL and in all scripts.

Source files: `ElementExtensions.cs`, `ElementParamExtensions.cs`, `ElementWriteExtensions.cs`, `ElementDoorExtensions.cs`, `ElementDiscoveryExtensions.cs`, `ElementGeometryExtensions.cs`, `ElementUIExtensions.cs`, `CollectionAggregateExtensions.cs`, `CollectionWriteExtensions.cs`, `CollectionUIExtensions.cs`, `PipelineEnumerable.cs`, `UnitExtensions.cs`, `NotebookExtensions.cs`, `ScriptApi.cs`.

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
// Smart resolution: BuiltInParameter → LookupParameter → C# Property → AsValueString
GetElements("Walls").First().GetStr("Comments")        // "North wall"
GetElements("Walls").First().GetStr("Fire Rating")      // "2 hr"
GetElements("Walls").First().GetStr("Room Bounding")    // "1" or "0" (yes/no checkbox)
GetElements("Floors").First().GetStr("Level")           // "Level 1" (ElementId resolved to name)
```

`GetStr` handles String, ElementId (resolves to name), Double/Integer (formatted), and falls back to C# properties via Reflection.

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

### Identity helpers

```csharp
wall.Matches("HCB")                   // fuzzy match against Type Name + Family Name
wall.FamilyName                       // "Basic Wall"
wall.GetStr("Family and Type")        // full identity string
```

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
door.IsHandFlipped                    // true/false
door.IsFacingFlipped                  // true/false
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
```

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
x.IsPositive() / IsNegative()
```

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
Table(object)             // render list as interactive table
Table(elements)           // render elements (adapts columns to element kind)
BarChart(data)            // bar chart
PieChart(data)            // pie chart
LineChart(data)           // line chart
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
```

### Watchdogs (background idle-time callbacks)

```csharp
Watchdog(() => { /* check something */ }, 5);     // every 5s when idle
WatchdogReport("All good", "success", data);      // send status
```

### UI Actions (on collections, without prefixes)

```csharp
Select(elements)          // select + zoom in Revit
Isolate(elements)         // isolate + zoom
Zoom(elements)            // zoom to fit
```

---

## 18. Complete Fluent Chain Examples

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
GetElements<StructuralColumn>("Structural Columns")
    .WhereParam("Volume", ">", 1.0, "m3")
    .OrderByParamDesc("Volume")
    .Table()
```
