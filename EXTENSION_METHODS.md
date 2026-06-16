# 🧩 Paracore Extension Methods Reference

A comprehensive guide to every extension method available on Revit elements and collections in Paracore scripts. All methods are defined in `ElementExtensions.cs`, `UnitExtensions.cs`, `CoordinationExtensions.cs`, and `NotebookExtensions.cs` and are globally available in the REPL and in all scripts.

> [!NOTE]
> All extension methods work identically in the **REPL** (single-line and multi-line) and in **Gallery scripts** (full C# project structure). They were designed as shortcuts to simplify the verbose Revit API, but they are standard C# extension methods available everywhere the engine runs.

> [!TIP]
> All collection extension methods are **fully generic** — they preserve the specific element type (`Wall`, `FamilyInstance`, etc.) throughout the entire fluent chain. You never lose type information.

> [!IMPORTANT]
> **Script Rules:** Top-level statements only — no `namespace`, `class Program`, or `Main()`. All namespaces pre-imported — never write `using` or fully-qualified names (`Autodesk.Revit.DB.XYZ`). No `FilteredElementCollector` — use `GetElements<T>()` or `GetElements("Category")` instead. No `IExternalApplication`/`IExternalCommand`.

## 📦 Element Retrieval (System Families vs Loadable Families)

SYSTEM FAMILIES (C# classes: Wall, Floor, Room, Ceiling, etc.):
```
GetElements<Wall>()      → typed Wall instances
GetElements<WallType>()  → typed wall type definitions
GetElements("Walls")     → untyped Element list
```

LOADABLE FAMILIES (Doors, Windows, Furniture, Columns, etc.):
```
GetElements<FamilyInstance>("Doors")  → typed FamilyInstance, door category
GetElements<FamilySymbol>("Doors")    → typed type symbols (door family types)
GetElements("Doors")                 → untyped Element list
```

Single-element lookup: `GetElement("name-or-id")` | Discovery: `GetMagicNames()`, `GetCategories()`

---
## 📖 Table of Contents

1. [Element Retrieval](#-element-retrieval-system-families-vs-loadable-families)
2. [Two Query Modes](#-two-query-modes)
3. [Element: Parameter & Property Accessors (Read)](#-element-parameter--property-accessors-read)
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
16. [Element: Materials & Sustainability](#-element-materials--sustainability)
17. [Collection: Coordination & Geometric Auditing](#-collection-coordination--geometric-auditing)
18. [Numeric & Unit Comparison Helpers](#-numeric--unit-comparison-helpers)
19. [Complete Fluent Chain Examples](#-complete-fluent-chain-examples)
20. [Quick Reference Card](#-quick-reference-card)

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
- Type parameter fallback (Automatically checks the element's Type if the instance parameter is missing)
- Unit conversion (where applicable)

---

### `element.GetStr(name)`

> **Smart String Getter.** Returns a human-readable string value.

- If parameter is an `ElementId` (Level, Type, Room), returns the **element name** (e.g., `"Level 1"`).
- Falls back to Revit's formatted value string for numbers.
- Falls back to C# property via Reflection (e.g., `"HandFlipped"` → `"True"`).
- Falls back to Type parameter if not found on the instance (e.g., standard door `"Width"`).
- Returns `""` if not found.

```csharp
wall.GetStr("Level")       // → "Level 1"
door.GetStr("Mark")        // → "D-101"
door.GetStr("HandFlipped") // → "True" (via reflection)
```

---

### `element.GetStr(name, unit, decimals)`

> **Unit-Converted String Getter.** Returns the value converted to the given unit as a plain number string (no suffix). Supports an optional `decimals` parameter (default: 2).

```csharp
wall.GetStr("Length", "mm")      // → "3600"
room.GetStr("Area", "m2", 4)     // → "25.4578" (specified decimals)
```

---

### `element.GetNum(name)`

> **Raw Numeric Getter.** Returns the raw `double` value in Revit internal units (feet / sq.ft / cu.ft).

- Returns `0.0` if not found.
- Falls back to C# property via Reflection for native doubles (`Width`, `Volume`, etc.).
- Falls back to Type parameter if not found on the instance.

```csharp
wall.GetNum("Length")    // → 11.811 (feet)
room.GetNum("Area")      // → 18.4 (sq.ft)
```

---

### `element.GetNum(name, unit, decimals)`

> **Unit-Converted Numeric Getter.** Returns the value converted to the specified unit. Supports an optional `decimals` parameter (default: 2).

| Unit String | Meaning |
|---|---|
| `mm`, `cm`, `m`, `ft`, `in` | Length |
| `m2`, `sqm`, `ft2`, `sqft` | Area |
| `m3`, `cum`, `ft3`, `cuft` | Volume |

```csharp
wall.GetNum("Length", "m")       // → 3.6
room.GetNum("Area", "m2", 4)     // → 25.4578 (specified decimals)
floor.GetNum("Volume", "m3")     // → 0.72
```

---

### `element.GetVal(name)`

> **WYSIWYG Getter.** Returns the formatted string exactly as seen in Revit's Properties palette.

- Returns values like `"3600.0 mm"`, `"1.25 m³"`, `"Level 1"`.
- Falls back to `GetStr` if Revit doesn't provide a formatted string.
- Automatically falls back to Type parameters if an instance parameter is not found.
- Returns `"-"` if not found.

```csharp
room.GetVal("Area")   // → "25.46 m²"
wall.GetVal("Level")  // → "Level 1"
```

---

### `element.GetVal(name, unit, decimals)`

> **Unit-Formatted WYSIWYG Getter.** Returns a value string with the specified unit suffix. Supports an optional `decimals` parameter (default: 2).

```csharp
wall.GetVal("Length", "mm")      // → "3600.0 mm"
room.GetVal("Area", "m2", 3)     // → "25.458 m²"
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
| `element.GetTypeStr(name, unit, decimals)` | Type-level `GetStr` with unit & optional decimals |
| `element.GetTypeNum(name)` | Type-level `GetNum` |
| `element.GetTypeNum(name, unit, decimals)` | Type-level `GetNum` with unit & optional decimals |
| `element.GetTypeInt(name)` | Type-level `GetInt` |
| `element.GetTypeVal(name)` | Type-level `GetVal` |
| `element.GetTypeVal(name, unit, decimals)` | Type-level `GetVal` with unit & optional decimals |

```csharp
wall.GetTypeStr("Wrapping at Inserts")  // → "Do not wrap"
door.GetTypeNum("Width", "mm")          // → 900.0 (type width)
```

---

## ✏️ Element: Smart Write Methods

### Consistent Transaction Behavior (`IsModifiable` Check)

**All write and UI-action methods** share the same transaction intelligence. Before applying a change, the engine checks `e.Document.IsModifiable`:

| Method | Single | Collection | Behavior |
|---|---|---|---|
| `SetVal` | ✅ | via `SetParam` | Write parameter values |
| `SetNum` | ✅ | via `SetParam` | Write numeric values with unit conversion |
| `Delete` | ✅ | ✅ | BIM-Smart Delete |
| `Hide` | ✅ | ✅ | Hide in active view |
| `Unhide` | ✅ | ✅ | Unhide in active view |
| `Isolate` | ✅ | ✅ | Temporarily isolate in view |

* **If `false` (No Active Transaction):** A new, isolated transaction is created automatically. Ideal for REPL one-liners and fluent chains.
* **If `true` (Active Transaction Exists):** The engine bypasses creating a transaction and applies the change instantly. This is what happens when you wrap operations in a `Transact()` block.

> [!IMPORTANT]
> **Mass Edits in `foreach` loops:** When modifying multiple elements in a manual `foreach` loop, **always** wrap the loop in a `Transact()` block. Without it, each iteration creates its own mini-transaction — cluttering the Undo stack and hurting performance. With a `Transact()` wrapper, each method detects the active transaction and runs directly.
>
> **Collection-level methods** (`.Delete()`, `.SetParam()`, `.Hide()`, etc.) already batch all changes into a single transaction automatically — no `Transact()` wrapper needed for fluent chains.

---

### `element.SetVal(name, value, unit)`

> **The Smart Setter.** Automatically determines how to write the value based on parameter type. Uses Reflection to locate Native C# properties if no parameter matches. Can optionally take a `unit` parameter to convert numeric values/strings from the specified unit before setting.

**Overloads:**
*   `public static void SetVal(this Element e, string name, object value)`
*   `public static void SetVal(this Element e, string name, object value, string unit)`

| Input type | Behavior |
|---|---|
| `string "500 mm"` | Calls `SetValueString` — parses value + unit |
| `string "Level 1"` | Resolves name to `ElementId` automatically |
| `string "Updated"` | Standard string set |
| `double 3.5` | Direct numeric set (internal units) |
| `bool true` | Native C# Property set via Reflection (e.g. "Pinned") |
| `double 200, string "mm"` | Converts from the unit to internal units, then sets |

```csharp
wall.SetVal("Comments", "Reviewed")          // string
wall.SetVal("Base Offset", "500 mm")         // value string — unit parsed
wall.SetVal("Base Offset", -150, "cm")       // converts -150cm to internal feet
wall.SetVal("Level", "Level 2")              // ElementId resolved by name
wall.SetVal("Pinned", true)                  // Native C# property
```

---

### `element.SetNum(name, value, unit)`

> **The Math Setter.** Specifically designed to take raw mathematical doubles and convert them FROM the specified unit INTO Revit's internal decimal feet before setting.

**Overloads:**
*   `public static void SetNum(this Element e, string name, double value)` *(Assumes value is already internal Decimal Feet)*
*   `public static void SetNum(this Element e, string name, double value, string unit)` *(Converts from specified unit)*

```csharp
double calculatedHeight = 3.0; // Assume we calculated this in Meters

// CORRECT: Converts 3.0 from Meters into Internal Feet, then sets it.
wall.SetNum("Unconnected Height", calculatedHeight, "m"); 

// DANGEROUS: Revit will assume 3.0 means 3 Feet!
wall.SetVal("Unconnected Height", calculatedHeight); 
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

### `element.ReflectionMethods()`

> Returns a list of all public C# methods available on the element's runtime type (via Reflection), excluding standard System.Object methods. Details the method name, return type, parameters, and declaring type.

```csharp
GetElements<FamilyInstance>("Doors").First().ReflectionMethods().Table()
// Columns: Method | ReturnType | Parameters | DeclaringType
```

---

## 🚪 Element: Specialized Door/Window Orientation

Revit's native `ToRoom`/`FromRoom` properties swap when a door is flipped. These helpers are stable regardless of flip state.

> [!WARNING]
> **Swing-Based Detection:** `RoomTo()` and `RoomFrom()` determine room relationships based on the **physical swing arc geometry** — the room the arc swings into is the "To" room. This is the most reliable geometric approach, but it may not always match the **architectural intent**. For example, in egress situations where code requires the door to swing toward the exit, the swing direction is opposite to the logical "entry" direction. In such cases, consider adding a shared parameter to explicitly tag the intended direction.

---

### `fi.RoomAccess()` / `fi.RoomFrom()`

> Returns the room on the **non-swing side** — the side the door swings away from. Stable regardless of flips.

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

> Returns the handing code as seen from `RoomFrom()` — the non-swing side.
> Since `RoomFrom()` is always the side the door swings **away from**, the observer always sees a Push door. `Handing()` will always return `LH` or `RH`.

| Code | Meaning |
|---|---|
| `LH` | Left Hand — hinges on the left as seen from `RoomFrom()` |
| `RH` | Right Hand — hinges on the right as seen from `RoomFrom()` |

```csharp
door.Handing()    // → "LH" or "RH"
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

### `fi.IsStandardDoor()`

> Returns `true` if the door is hosted in a standard wall (Basic/Stacked), `false` if it’s a Curtain Wall panel.

```csharp
door.IsStandardDoor()  // → true for standard doors
// false for curtain wall glass doors
```

---

### `.StandardDoor()` — Collection Filter

> Filters a `FamilyInstance` collection to exclude Curtain Wall hosted panels. Curtain wall doors don’t carry standard properties like Level, Width, Height, Room, or swing geometry.

```csharp
GetElements<FamilyInstance>("Doors")
    .StandardDoor()
    .Table();
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
| `.Hide()` | ✅ | ✅ | Hides from active view |
| `.Unhide()` | ✅ | ✅ | Unhides in active view |
| `.Delete()` | ✅ | ✅ | BIM-Smart Delete (auto-transaction) |

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
> Filters using string operations: `"contains"`, `"starts"`, `"ends"`, `"!="` / `"not"`, `"notcontains"`, `"notstarts"`, `"notends"`.

```csharp
GetElements("Doors").WhereParam("Level", "Level 1")
GetElements("Doors").WhereParam("Mark", "starts", "D-10")
GetElements("Rooms").WhereParam("Name", "contains", "Laundry")
GetElements("Walls").WhereParam("Type Name", "!=", "Generic - 200mm")
```

---

### `.WhereParam(name, value, unit)` — Numeric filter
> Filters elements where the named numeric parameter equals the value (tolerance: 0.001 in the specified unit).

### `.WhereParam(name, op, value, unit)` — Numeric comparison filter
> Filters using comparison operators: `">"`, `"<"`, `">="`, `"<="`, `"!="` / `"not"`.

```csharp
GetElements<Wall>().WhereParam("Width", 200, "mm")        // exactly 200mm
GetElements<Room>().WhereParam("Area", ">", 25.0, "m2")   // larger than 25sqm
GetElements<Wall>().WhereParam("Length", "<", 10.0, "m")  // shorter than 10m
GetElements<Wall>().WhereParam("Width", "!=", 200, "mm")  // not 200mm wide
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

### `.GroupByParam(groupByParam, sumParam, unit)` → `Group | Count | Total`

> **groupByParam**: parameter to group by (e.g. "Level"). Elements with the same value become one group.
> **sumParam**: numeric parameter to SUM per group (e.g. "Area", "Length"). Groups by the first, sums the second.
> **unit**: unit to display the summed total in (e.g. "m2", "m"). Optional.

```csharp
// Group rooms by Level, sum their Area in m² per level
GetElements("Rooms").GroupByParam("Level", "Area", "m2").Table()
// Group   | Count | Total
// Level 1 | 12    | 892.3

// Group walls by Base Constraint, sum their Length in meters
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").Table()
// Group   | Count | Total
// Level 1 | 23    | 284.5
// Level 2 | 18    | 201.3
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

### `.SetParam(name, value, unit)`

> Sets a parameter on **every element** in the collection inside a single transaction. Can optionally take a `unit` parameter to convert numeric values from the specified unit before setting.
> Returns the collection (chainable).

```csharp
// Mark all unreviewed doors
GetElements("Doors")
    .WhereParam("Comments", "")
    .SetParam("Comments", "Pending Review")

// Set top constraint and offset with unit conversion in a single chain
GetElements<Wall>()
    .WhereParam("Base Constraint", "Level 01")
    .SetParam("Top Constraint", "Level 02")
    .SetParam("Top Offset", -150, "cm")
```

> [!NOTE]
> All updates are wrapped in a single transaction — one undo step in Revit. When called inside an outer `Transact()`, `.SetParam` detects the active transaction and runs directly without creating a new one.

---

## 🗃️ Collection: Data Science & Analytics

### `.ToNotebook(string notebookName)`

> The ultimate bridge to Pandas and AI analysis.
> Takes any collection (elements or anonymous objects), serializes it to a highly compressed JSON file, and **automatically generates and opens a Jupyter Notebook** in VS Code to analyze the data.

```csharp
// Export complex scheduling data straight to a new Jupyter Notebook
GetElements<Room>()
    .Select(r => new {
        Number = r.GetStr("Number"),
        Name = r.Name,
        Level = r.GetStr("Level"),
        Area = r.Area.OutputUnit("m2", 2)
    })
    .ToNotebook("Room_Analysis");
```

**How it works (Scratch & Save):**
1. Generates `data.json` and `<notebookName>.ipynb` in a temporary scratch folder.
2. The notebook is pre-populated with Python code specifically mapped to load your `data.json` straight into a `pandas.DataFrame`.
3. Auto-launches VS Code. Click "Save As" in VS Code to keep the analysis permanently.

---

## 📈 Collection: Visualization

These come from `VisualizationExtensions` and work on **any** `IEnumerable<T>`.

| Method | Description |
|---|---|
| `.Table()` | Renders as an interactive data grid. Automatically extracts **both** Instance and Type parameters into columns. |
| `.BarChart()` / `.BarGraph()` | Bar chart (needs `name` + `value` properties) |
| `.PieChart()` / `.PieGraph()` | Pie chart |
| `.LineChart()` / `.LineGraph()` | Line chart |
| `.Show()` | **Pro Output**: Smart data grid + automated 3D geometric focus |

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
| `.Hide()` | Hides all elements in the active view |
| `.Unhide()` | Unhides all elements in the active view |
| `.Delete()` | **BIM-Smart Delete** (Safe for Pinned/Curtain elements) |
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

## 🌿 Element: Materials & Sustainability

Specialized methods for BIM 6.0 auditing and material discovery.

### `element.Materials()`

> Returns a list of all `Material` objects assigned to the element. Works on both Instances and Types.

### `element.MaterialNames()`

> Returns a list of strings containing material names.

### `element.GetMaterialNames()`

> Returns a comma-separated string of material names (ideal for `Table()` output).

```csharp
Selection[0].GetMaterialNames() // → "Glass, Aluminum, Concrete"
```

---

### `Eco.GetCarbon(element)`

> **BIM 6.0 Carbon Engine.** Calculates embodied carbon (kgCO2e) using a resilient multi-tier audit:
> 1. Layer-by-layer material audit (Compound Structure).
> 2. Curtain system traversal (Panels + Mullions).
> 3. Volume-based fallback with industry-standard intensity defaults.

### `Eco.GetUValue(element)`

> **BIM 6.0 Thermal Engine.** Calculates thermal transmittance (W/m²K):
> - Solves multi-layer resistance for host objects.
> - Performs area-weighted averaging for Curtain Walls.
> - Falls back to Type-level thermal assets if instance data is missing.

```csharp
var carbon = Eco.GetCarbon(wall);
var uValue = Eco.GetUValue(wall);
```

---

### `Eco.GetWeather()`

> **Live Project Weather.** Fetches current meteorological data for the project's exact Latitude/Longitude using the Open-Meteo API.

```csharp
var weather = Eco.GetWeather();
Println($"Current Temp: {weather.Temperature}°C");
Println($"Wind Speed: {weather.WindSpeed} km/h");
```

---

## 🛡️ Collection: Coordination & Geometric Auditing

High-performance interference detection and unit-aware coordination reporting. These methods leverage the optimized spatial query engine for "DirectShape First" coordination.

### `.AuditClashes(targetCategory)`
> **Surgical Interference Check.** Detects every intersection between elements in the source collection and the target category.

### `.AuditClashes(target, tolerance)`
> **Advanced Coordination Audit.**

| Parameter | Type | Description |
|---|---|---|
| `target` | `string` | The interference category (e.g. "StructuralColumns") |
| `tolerance` | `double` | Geometric tolerance (e.g. `5.0`) |

### `.AuditClashes(target, tolerance)` — Unit-Aware String Tolerance
> Accepts a unit-aware string tolerance like `"5mm"`, `"0.5in"`, `"2cm"`. Internally parses and converts to Revit internal units.

```csharp
// Numeric tolerance (internal units)
GetElements("Walls")
    .AuditClashes("StructuralColumns", tolerance: 2.0)
    .Table();

// Unit-aware string tolerance
GetElements("Walls")
    .AuditClashes("Pipes", "5mm")
    .Table();
```

---

### `.Table()`
> **Professional Output.** The definitive method for coordination scripts.
> 1. Renders an interactive **Coordination Grid** in the Summary tab.
> 2. Automatically links rows to **3D intersection helpers** — click a row to focus Revit on the exact clash point.

```csharp
GetElements("Walls").AuditClashes("Pipes").Table();
```

---

### `doc.ClearClashHelpers()`
> **Cleanup Utility.** Clears all visual clash helper geometry (DirectShapes named `"CORE_CLASH"`) from the document. Useful when you want to reset the view manually.

```csharp
Doc.ClearClashHelpers();
```

---


---

## 🔢 Numeric & Unit Comparison Helpers

Available on `double`. These methods handle floating-point noise and Revit's internal unit precision automatically.

### Precision Comparisons (Fuzzy Equality)

| Method | Description |
|---|---|
| `.IsAlmostEqualTo(val)` | True if within 1e-9 tolerance |
| `.AlmostZero()` | True if essentially zero |
| `.IsPositive()` | Strictly positive (> 1e-9) |
| `.IsNegative()` | Strictly negative (< -1e-9) |
| `.IsGreaterThan(val)` | Strictly greater than (outside tolerance) |
| `.IsLessThan(val)` | Strictly less than (outside tolerance) |

```csharp
if (wall.GetNum("Length").AlmostZero()) { /* ... */ }
if (room.Area.IsGreaterThan(25.0.InputUnit("m2"))) { /* ... */ }
```

---

### `value.RoundTo(unit, decimals)`

> **Unit-Snapping Rounding.** Rounds the internal Revit value so that it matches a clean decimal in the target unit.

```csharp
// Snaps a raw length (e.g. 6.56167...) to the internal feet for exactly 2000mm
double snapped = wall.GetNum("Length").RoundTo("mm", 0);
```

---

### `value.FormatValueOnly(unit, decimals)`

> Returns only the numeric value converted to the target unit as a string, **without** the unit suffix.

```csharp
wall.GetNum("Length").FormatValueOnly("mm")  // → "3600"
room.GetNum("Area").FormatValueOnly("m2")   // → "25.46"
```

---

### `"dimensionString".ToMeters()`

> **Dimension Parser.** Parses a dimension string with a unit suffix and returns the value in meters. Supports `mm`, `cm`, `m`, `ft`, `in`, etc. Defaults to meters if no unit suffix is found.

```csharp
"500mm".ToMeters()     // → 0.5
"2ft".ToMeters()       // → 0.6096
"0.1m".ToMeters()      // → 0.1
"10".ToMeters()        // → 10.0 (defaults to meters)
```

---

### Precision-Aware Comparison Extensions (Complete)

| Method | Description |
|---|---|
| `.IsAlmostEqualTo(val)` | True if within 1e-9 tolerance |
| `.AlmostZero()` | True if essentially zero |
| `.IsPositive()` | Strictly positive (> 1e-9) |
| `.IsNegative()` | Strictly negative (< -1e-9) |
| `.IsGreaterThan(val)` | Strictly greater than (outside tolerance) |
| `.IsLessThan(val)` | Strictly less than (outside tolerance) |
| `.IsGreaterThanOrEqual(val)` | Greater than or approximately equal to |
| `.IsLessThanOrEqual(val)` | Less than or approximately equal to |

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
    .SetParam("Mark", e => $"D2-{i++:000}")
```

---

### Bulk Delete: BIM-Smart & Safe
The `.Delete()` extension method is **BIM-Aware** and follows the same `IsModifiable` transaction pattern as all other write methods. It automatically skips Pinned elements, Curtain Wall Panels, and hosted Curtain Doors to prevent Revit exceptions and model corruption.

**Collection-level** (single transaction for the whole group):
```csharp
// Deletes ALL doors safely. No manual filtering needed for Curtain Walls!
GetElements("Doors").Delete();
```

**Inside a `Transact()` wrapper** (skips auto-transaction, uses the outer one):
```csharp
Transact("Delete overlapping columns", () => {
    foreach (var col in toDelete)
        col.Delete();  // detects active transaction, runs directly
});
```

---

## 📚 Quick Reference Card

| What I want | Method |
|---|---|
| Get typed wall instances | `GetElements<Wall>()` |
| Get typed wall types | `GetElements<WallType>()` |
| Get typed door instances | `GetElements<FamilyInstance>("Doors")` |
| Get typed door types | `GetElements<FamilySymbol>("Doors")` |
| Get untyped by category | `GetElements("Walls")` |
| Get single element | `GetElement("name-or-id")` |
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
| Hide in view | `.Hide()` |
| Unhide in view | `.Unhide()` |
| Delete all (BIM-Safe) | `.Delete()` |

---

## 🔧 Global Script Functions

These are **static methods** from `ScriptApi` that are globally available in every script and REPL session, **not** extension methods.

| Function | Description |
|---|---|
| `Transact(name, action)` | Wrap model edits in a single undo-step transaction |
| `Transact(name, Action<Document>)` | Transaction with `Document` parameter |
| `Watchdog(callback, interval)` | Register a background sentinel validation *(Sentinel Scripts Only - Not for REPL)* |
| `Watchdog(Action, interval)` | Simplified watchdog *(Sentinel Scripts Only - Not for REPL)* |
| `WatchdogReport(summary, status, data?)` | Send status report from a sentinel *(Sentinel Scripts Only - Not for REPL)* |
| `SetExecutionTimeout(seconds)` | Extend script timeout beyond default 10s |
| `GetElements(BuiltInCategory)` | Query by `BuiltInCategory` enum |
| `Show(type, data)` | Low-level structured output |
| `Table(data)` | Global table render |
| `BarChart(data)` / `BarGraph(data)` | Global bar chart |
| `PieChart(data)` / `PieGraph(data)` | Global pie chart |
| `LineChart(data)` / `LineGraph(data)` | Global line chart |
| `Select(elements)` | Select + zoom in Revit UI |
| `Isolate(elements)` | Temporarily isolate in active view |
| `Zoom(elements)` | Zoom active view to fit elements |

```csharp
// Extend timeout for heavy scripts
SetExecutionTimeout(120);

// Query by BuiltInCategory (useful with hydrated enum parameters)
var doors = GetElements(BuiltInCategory.OST_Doors);
```
