# 🧩 Paracore Extension Methods Reference

A comprehensive guide to every extension method available on Revit elements and collections in Paracore scripts. All methods are defined in `ElementExtensions.cs` and are globally available in the REPL and in all scripts.

> [!TIP]
> All collection extension methods are **fully generic** — they preserve the specific element type (`Wall`, `FamilyInstance`, etc.) throughout the entire fluent chain. You never lose type information.

---

## 📖 Table of Contents

1. [Two Query Modes](#-two-query-modes)
2. [Element: Parameter & Property Accessors (Read)](#-element-parameter--property-accessors-read)
3. [Element: Type-Level Accessors](#-element-type-level-accessors)
4. [Element: Smart Write Methods](#-element-smart-write-methods)
5. [Element: Identity & Discovery](#-element-identity--discovery)
6. [Element: Specialized Door/Window Orientation](#-element-specialized-doorwindow-orientation)
7. [Element: Diagnostics & Inspection](#-element-diagnostics--inspection)
8. [Element: Geometry](#-element-geometry)
9. [Element: Revit UI Actions](#-element-revit-ui-actions)
10. [Collection: Filtering](#-collection-filtering)
11. [Collection: Sorting](#-collection-sorting)
12. [Collection: Grouping & Aggregation](#-collection-grouping--aggregation)
13. [Collection: Bulk Write](#-collection-bulk-write)
14. [Collection: Visualization](#-collection-visualization)
15. [Collection: Revit UI Actions](#-collection-revit-ui-actions)
16. [Complete Fluent Chain Examples](#-complete-fluent-chain-examples)

---

## 🔀 Two Query Modes

Paracore's collection extensions support two styles, each with trade-offs:

### Mode 1: String / Parameter Mode (Generic Elements)

```csharp
GetElements("Doors")
    .WhereParam("Level", "Level 1")
    .WhereParam("HandFlipped", "True")   // Uses reflection for C# properties
    .OrderByParam("Mark")
    .Table()
```

- Works on `List<Element>` — the most permissive mode.
- `.WhereParam` uses `GetStr()` internally, which falls back to **Reflection** for C# native properties (`HandFlipped`, `Area`, `Volume`, etc.).
- No type casting needed. Works for any param name or native C# property name.

### Mode 2: Typed / Lambda Mode (Specific Types)

```csharp
GetElements<FamilyInstance>("Doors")
    .WhereParam("Level", "Level 1")
    .Where(dr => !dr.HandFlipped && dr.Symbol.FamilyName.Contains("Single"))
    .OrderByParam("Mark")
    .Table()
```

- Works on `List<T>` — preserves the specific type throughout the chain.
- Enables strongly-typed lambda expressions with IntelliSense.
- Use when you need direct access to type-specific C# properties or methods.

> [!IMPORTANT]
> `WhereParam("HandFlipped", "True")` ← string mode — works via reflection.
> `.Where(dr => dr.HandFlipped)` ← typed mode — requires `GetElements<FamilyInstance>`.
> Both are valid. Use whichever is cleaner for your task.

---

## 📥 Element: Parameter & Property Accessors (Read)

All methods on `Element`. Automatically handle:
- `BuiltInParameter` name lookups
- `ElementId` → Element Name resolution
- C# native property fallback via Reflection
- Unit conversion (where applicable)

---

### `element.GetStr(name)`

> **Smart String Getter.** Returns a human-readable string value.

- If parameter is an `ElementId` (Level, Type, Room), returns the **element name** (e.g., `"Level 1"`).
- Falls back to Revit's formatted value string for numbers.
- Falls back to C# property via Reflection (e.g., `"HandFlipped"` → `"True"`).
- Returns `""` if not found.

```csharp
wall.GetStr("Level")       // → "Level 1"
door.GetStr("Mark")        // → "D-101"
door.GetStr("HandFlipped") // → "True" (via reflection)
```

---

### `element.GetStr(name, unit)`

> **Unit-Converted String Getter.** Returns the value converted to the given unit as a plain number string (no suffix).

```csharp
wall.GetStr("Length", "mm")   // → "3600"
room.GetStr("Area", "m2")     // → "25.46"
```

---

### `element.GetNum(name)`

> **Raw Numeric Getter.** Returns the raw `double` value in Revit internal units (feet / sq.ft / cu.ft).

- Returns `0.0` if not found.
- Falls back to C# property via Reflection for native doubles (`Width`, `Volume`, etc.).

```csharp
wall.GetNum("Length")    // → 11.811 (feet)
room.GetNum("Area")      // → 18.4 (sq.ft)
```

---

### `element.GetNum(name, unit)`

> **Unit-Converted Numeric Getter.** Returns the value converted to the specified unit.

| Unit String | Meaning |
|---|---|
| `mm`, `cm`, `m`, `ft`, `in` | Length |
| `m2`, `sqm`, `ft2`, `sqft` | Area |
| `m3`, `cum`, `ft3`, `cuft` | Volume |

```csharp
wall.GetNum("Length", "m")     // → 3.6
room.GetNum("Area", "m2")      // → 25.46
floor.GetNum("Volume", "m3")   // → 0.72
```

---

### `element.GetVal(name)`

> **WYSIWYG Getter.** Returns the formatted string exactly as seen in Revit's Properties palette.

- Returns values like `"3600.0 mm"`, `"1.25 m³"`, `"Level 1"`.
- Falls back to `GetStr` if Revit doesn't provide a formatted string.
- Returns `"-"` if not found.

```csharp
room.GetVal("Area")   // → "25.46 m²"
wall.GetVal("Level")  // → "Level 1"
```

---

### `element.GetVal(name, unit)`

> **Unit-Formatted WYSIWYG Getter.** Returns a value string with the specified unit suffix.

```csharp
wall.GetVal("Length", "mm")   // → "3600.0 mm"
```

---

### `element.GetInt(name)`

> **Integer Getter.** Returns the integer value — also works for yes/no (boolean) parameters.

- Returns `0` (false) if not found.

```csharp
wall.GetInt("Is External")   // → 1 (true) or 0 (false)
element.GetInt("Count")      // → 4
```

---

## 📤 Element: Type-Level Accessors

Same as instance accessors but target the element's **ElementType** (e.g., Wall Type, Door Type).

| Method | Description |
|---|---|
| `element.GetElementType()` | Returns the ElementType element |
| `element.GetTypeStr(name)` | Type-level `GetStr` |
| `element.GetTypeStr(name, unit)` | Type-level `GetStr` with unit |
| `element.GetTypeNum(name)` | Type-level `GetNum` |
| `element.GetTypeNum(name, unit)` | Type-level `GetNum` with unit |
| `element.GetTypeInt(name)` | Type-level `GetInt` |
| `element.GetTypeVal(name)` | Type-level `GetVal` |
| `element.GetTypeVal(name, unit)` | Type-level `GetVal` with unit |

```csharp
wall.GetTypeStr("Wrapping at Inserts")  // → "Do not wrap"
door.GetTypeNum("Width", "mm")          // → 900.0 (type width)
```

---

## ✏️ Element: Smart Write Methods

### `element.SetVal(name, value)`

> **The Smart Setter.** Automatically determines how to write the value based on parameter type.

| Input type | Behavior |
|---|---|
| `string "500 mm"` | Calls `SetValueString` — parses value + unit |
| `string "Level 1"` | Resolves name to `ElementId` automatically |
| `string "Updated"` | Standard string set |
| `double 3.5` | Direct numeric set (internal units) |
| `int 4` | Integer set |

```csharp
wall.SetVal("Comments", "Reviewed")    // string
wall.SetVal("Base Offset", "500 mm")   // value string — unit parsed
wall.SetVal("Level", "Level 2")        // ElementId resolved by name
wall.SetVal("Mark", "W-01")
```

> [!NOTE]
> `SetVal` automatically wraps in a transaction if none is active.

---

### `element.SetNum(name, value, unit)`

> **Explicit Unit-Aware Numeric Setter.** Converts from the specified unit to internal Revit units before setting.

```csharp
wall.SetNum("Base Offset", 500, "mm")   // sets 500mm in Revit internal feet
wall.SetNum("Sill Height", 0.9, "m")
```

---

## 🔍 Element: Identity & Discovery

### `id.ToElement(doc)`
> **Identity Resolver.** Converts an `ElementId`, `int`, or `long` directly to a Revit `Element`.
> Available on `ElementId`, `int`, and `long`.

```csharp
var el = 123456L.ToElement(Doc);
var wall = someId.ToElement(Doc) as Wall;
```

---

### `element.FamilyName()`

> Returns the true Family Name for both Loadable and System families.

```csharp
door.FamilyName()   // → "M_Single-Flush"
wall.FamilyName()   // → "Basic Wall" (via ELEM_FAMILY_PARAM fallback)
```

---

### `element.Matches(pattern)`

> **Fuzzy Name Matcher.** Returns `true` if the pattern is found in the element's Type Name OR Family Name (case-insensitive).

```csharp
door.Matches("Single")        // → true (Family Name contains "Single")
door.Matches("Flush")         // → true (Type Name contains "Flush")
door.Matches("NonExistent")   // → false
```

---

### `element.ReflectionProperties()`

> Returns a list of all native C# properties on the element's runtime type (via Reflection).

```csharp
GetElements<Wall>().First().ReflectionProperties().Table()
// Columns: Name | Type
```

---

## 🚪 Element: Specialized Door/Window Orientation

Revit's native `ToRoom`/`FromRoom` properties swap when a door is flipped. These helpers are stable regardless of flip state.

---

### `fi.RoomAccess()` / `fi.RoomFrom()`

> Returns the room on the **non-swing side** — the "Access" side. Immutable.

```csharp
door.RoomAccess()   // → "Corridor"
```

---

### `fi.RoomDestination()` / `fi.RoomTo()`

> Returns the room the door **swings into**. Immutable.

```csharp
door.RoomDestination()  // → "Office 101"
```

---

### `fi.Handing()`

> Returns the industry-standard handing code using a geometric swing arc analysis.

| Code | Meaning |
|---|---|
| `LH` | Left Hand (Push) |
| `RH` | Right Hand (Push) |
| `LHR` | Left Hand Reverse (Pull) |
| `RHR` | Right Hand Reverse (Pull) |

```csharp
door.Handing()    // → "RHR"
```

---

### `fi.HingeSide()`

> Returns `"Left"` or `"Right"` as seen from the Access Room.

```csharp
door.HingeSide()  // → "Right"
```

---

### `fi.IsHandFlipped()` / `fi.IsFacingFlipped()`

> Direct wrappers for Revit's `FamilyInstance.HandFlipped` and `FamilyInstance.FacingFlipped`.

```csharp
door.IsHandFlipped()    // → true / false
door.IsFacingFlipped()  // → true / false
```

> [!TIP]
> In string mode, use `WhereParam("HandFlipped", "True")` instead. This uses reflection and works even on `List<Element>`.

---

### `fi.FindSwingArc()`

> Returns the largest `Arc` found in the door's geometry — the physical swing arc in World Space.

```csharp
var arc = door.FindSwingArc();
// arc.Radius, arc.Center, arc.GetEndPoint(0)
```

---

## 🔎 Element: Diagnostics & Inspection

### `element.Peek()`
> Side-by-side parameter audit: `Parameter | Storage | GetStr | GetNum | UI Value`.
> Returns the element (chainable).

### `elements.Peek()`
> Executes `.Peek()` on every element in a collection.

```csharp
Selection.Peek();
GetElements("Walls").Peek();
```

---

### `element.InstanceParams()`

> Returns all instance parameters as `Name | Storage | Value`.

```csharp
wall.InstanceParams().Table()
```

---

### `element.TypeParams()`

> Returns all type parameters as `Name | Storage | Value`.

```csharp
wall.TypeParams().Table()
```

---

### `element.CombinedParams()`

> Returns instance + type parameters together with a `Scope` column (`"Instance"` or `"Type"`).

```csharp
wall.CombinedParams().Table()
```

---

### `element.BuiltInParams()`

> Returns all `BuiltInParameter` identifiers for the element: `Name | BIP | Value`.

```csharp
wall.BuiltInParams().Table()
// Use to find the BIP string for language-independent code
```

---

### `element.NativeProperties()`

> Returns key Revit API properties not in the parameter dict: Name, Id, Category, Level, Workset, Design Option, Owner, Location, Pinned.

```csharp
wall.NativeProperties().Table()
```

---

### `element.ParamsDict()`

> Returns all parameter values as a `Dictionary<string, string>`.

```csharp
var dict = wall.ParamsDict();
Println(dict["Mark"]);
```

---

## 🔷 Element: Geometry

### `element.GeometrySummary()`

> Returns a table of all geometry objects in the element: Solids (Volume, Area, Faces), Curves (Arc, Line), PolyLines.

```csharp
wall.GeometrySummary().Table()
// Columns: Type | Source | Material | Volume | Area | Faces | Edges
```

---

## 🖱️ Element: Revit UI Actions

These return the element (chainable).

| Method | Single | Collection | Description |
|---|---|---|---|
| `.Select()` | ✅ | ✅ | Selects in Revit UI |
| `.Zoom()` | ✅ | ✅ | Zooms/shows in active view |
| `.Isolate()` | ✅ | ✅ | Temporarily isolates in active view |
| `.Hide()` | ✅ | ✅ | Hides single in active view |
| `.Unhide()` | ✅ | ✅ | Unhides single in active view |
| `.Delete()` | ✅ | ✅ | Deletes (with auto-transaction) |

```csharp
Selection[0].Select().Zoom()
GetElements("Walls").Isolate()
```

---

## 🗂️ Collection: Filtering

All methods are **generic** (`where T : Element`) and preserve the input type throughout the chain.

---

### `.WhereParam(name, value)` — String filter
> Filters elements where the named parameter/property equals the value (case-insensitive).
> Works via `GetStr()`, which covers Revit parameters AND native C# properties via Reflection.

### `.WhereParam(name, op, value)` — String predicate filter
> Filters using string operations: `"contains"`, `"starts"`, `"ends"`.

```csharp
GetElements("Doors").WhereParam("Level", "Level 1")
GetElements("Doors").WhereParam("Mark", "starts", "D-10")
GetElements("Rooms").WhereParam("Name", "contains", "Laundry")
```

---

### `.WhereParam(name, value, unit)` — Numeric filter
> Filters elements where the named numeric parameter equals the value (tolerance: 0.001 in the specified unit).

### `.WhereParam(name, op, value, unit)` — Numeric comparison filter
> Filters using comparison operators: `">"`, `"<"`, `">="`, `"<="`.

```csharp
GetElements<Wall>().WhereParam("Width", 200, "mm")        // exactly 200mm
GetElements<Room>().WhereParam("Area", ">", 25.0, "m2")   // larger than 25sqm
GetElements<Wall>().WhereParam("Length", "<", 10.0, "m")  // shorter than 10m
```

---

### `.WhereMatches(pattern)` — Fuzzy name filter

> Filters to elements whose Type Name OR Family Name contains the substring (case-insensitive).

```csharp
GetElements("Doors").WhereMatches("Single-Flush")
GetElements("Windows").WhereMatches("Fixed")
```

---

## 🔼 Collection: Sorting

### `.OrderByParam(name)` — Ascending

> Sorts the collection ascending by any parameter or C# property.
> **Automatically uses numeric sort** for `Double`/`Integer` parameters, string sort for text.

```csharp
GetElements("Rooms").OrderByParam("Area").Table()       // smallest first
GetElements("Doors").OrderByParam("Mark").Table()       // alphabetical A→Z
GetElements("Walls").OrderByParam("Width").Table()      // thinnest first
```

---

### `.OrderByParamDesc(name)` — Descending

> Sorts the collection descending. Same auto-numeric detection.

```csharp
GetElements("Rooms").OrderByParamDesc("Area").Table()   // largest first
GetElements("Walls").OrderByParamDesc("Length").Table() // longest first
```

---

## 📊 Collection: Grouping & Aggregation

### `.GroupByParam(groupBy)` → `Group | Count`

> Groups the collection by a parameter value and returns a summary table.

```csharp
GetElements("Doors").GroupByParam("Level").Table()
// Group        | Count
// Level 1      | 14
// Level 2      | 9

GetElements("Doors").GroupByParam("HandFlipped").Table()
// Group        | Count
// True         | 6
// False        | 17
```

---

### `.GroupByParam(groupBy, sum, unit)` → `Group | Count | Total`

> Groups by one parameter and sums a second numeric parameter per group.

```csharp
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").Table()
// Group   | Count | Total
// Level 1 | 23    | 284.5
// Level 2 | 18    | 201.3

GetElements("Rooms").GroupByParam("Level", "Area", "m2").Table()
// Group   | Count | Total
// Level 1 | 12    | 892.3
```

---

### `.SumParam(name, unit)`

> Returns the sum of a numeric parameter across the collection.

```csharp
double totalLength = GetElements("Walls").SumParam("Length", "m");
double totalArea   = GetElements("Rooms").SumParam("Area", "m2");
Println($"Total wall length: {totalLength:F2} m");
```

---

## ✏️ Collection: Bulk Write

### `.SetParam(name, value)`

> Sets a parameter on **every element** in the collection inside a single transaction.
> Returns the collection (chainable).

```csharp
// Mark all unreviewed doors
GetElements("Doors")
    .WhereParam("Comments", "")
    .SetParam("Comments", "Pending Review")

// Update all Level 1 walls
GetElements<Wall>()
    .WhereParam("Level", "Level 1")
    .SetParam("Mark", "L1-W")
```

> [!NOTE]
> All updates are wrapped in a single `Transact` call — one undo step in Revit.

---

## 📈 Collection: Visualization

These come from `VisualizationExtensions` and work on **any** `IEnumerable<T>`.

| Method | Description |
|---|---|
| `.Table()` | Renders as an interactive data grid in the Summary tab |
| `.BarChart()` / `.BarGraph()` | Bar chart (needs `name` + `value` properties) |
| `.PieChart()` / `.PieGraph()` | Pie chart |
| `.LineChart()` / `.LineGraph()` | Line chart |

```csharp
// Count doors per level as pie chart
GetElements("Doors")
    .GroupByParam("Level")
    .Select(g => new { name = ((dynamic)g).Group, value = ((dynamic)g).Count })
    .PieChart()
```

---

## 🖱️ Collection: Revit UI Actions

All return `IEnumerable<T>` (chainable).

| Method | Description |
|---|---|
| `.Select()` | Selects all elements in the Revit UI |
| `.Zoom()` | Zooms the active view to fit the elements |
| `.Isolate()` | Temporarily isolates in the active view |
| `.Delete()` | Deletes all elements (IEnumerable<Element> only) |
| `.Peek()` | Forensic audit of every element in the collection |

```csharp
// Find and isolate all walls without a Mark
GetElements<Wall>()
    .WhereParam("Mark", "")
    .Isolate()

// Find and delete temporary elements
GetElements("Generic Models")
    .WhereMatches("TEMP")
    .Delete()
```

---

## 🚀 Complete Fluent Chain Examples

### Report: All doors sorted by level, then mark

```csharp
GetElements("Doors")
    .WhereParam("Phase Created", "New Construction")
    .OrderByParam("Level")
    .Table()
```

---

### Audit: Find hand-flipped doors and mark them

```csharp
GetElements("Doors")
    .WhereParam("HandFlipped", "True")
    .SetParam("Comments", "Check Handing")
```

---

### Dashboard: Room area breakdown by level

```csharp
GetElements("Rooms")
    .GroupByParam("Level", "Area", "m2")
    .Table()
```

---

### Analysis: Largest rooms on Level 1

```csharp
GetElements("Rooms")
    .WhereParam("Level", "Level 1")
    .OrderByParamDesc("Area")
    .Table()
```

---

### Typed: Structural walls wider than 300mm

```csharp
GetElements<Wall>()
    .Where(w => w.GetNum("Width", "mm") >= 300)
    .OrderByParamDesc("Width")
    .Table()
```

---

### Batch update: Standardize marks on Level 2 doors

```csharp
int i = 1;
GetElements("Doors")
    .WhereParam("Level", "Level 2")
    .OrderByParam("Mark")
    .SetParam("Mark", $"D2-{i++:000}")
```

---

## 📚 Quick Reference Card

| What I want | Method |
|---|---|
| Filter by param string | `.WhereParam("Level", "Level 1")` |
| Filter by string op | `.WhereParam("Mark", "starts", "A")` |
| Filter by C# property | `.WhereParam("HandFlipped", "True")` |
| Filter by numeric value | `.WhereParam("Width", 200, "mm")` |
| Filter by numeric op | `.WhereParam("Area", ">", 25, "m2")` |
| Filter by name/family | `.WhereMatches("Single-Flush")` |
| Sort ascending (auto numeric) | `.OrderByParam("Area")` |
| Sort descending (auto numeric) | `.OrderByParamDesc("Area")` |
| Group by → Count | `.GroupByParam("Level")` |
| Group by → Count + Sum | `.GroupByParam("Level", "Length", "m")` |
| Total a numeric param | `.SumParam("Area", "m2")` |
| Set same value on all | `.SetParam("Comments", "Done")` |
| Show table | `.Table()` |
| Select in Revit | `.Select()` |
| Zoom to elements | `.Zoom()` |
| Isolate in view | `.Isolate()` |
| Delete all | `.Delete()` |
