# 🚀 Paracore REPL Reference Guide (V4.5.0)

The Paracore REPL is a persistent C# scratchpad with direct, real-time access to the Revit API and Paracore's high-level automation helpers.

> [!TIP]
> **Session Persistence**: Variables defined in the REPL stay alive between runs within the same session. Break complex tasks into small, iterative steps!

---

## 🧠 Core Global Objects

These objects are globally injected and always available.

| Object | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The Revit UI Document (active window). |
| `UIApp` | `UIApplication` | The top-level Revit UI Application. |
| `ActiveView` | `View` | The currently active view in Revit. |
| `Selection` | `List<Element>` | Elements currently selected in Revit. |
| `Parameters` | `Dictionary<string, object>` | Parameters passed from the UI or Agent context. |
| `Println(msg)` | `void` | Prints a message to the REPL console. Supports `$""` interpolation. |
| `Print(msg)` | `void` | Alias for `Println`. |

---

## 💾 Memory & Session Management

Because the REPL runs continuously, variables you define (`var x = 5;`) stay alive between execution turns.

> [!TIP]
> These commands are intercepted by the engine directly. No semicolons needed.

| Command | Description |
| :--- | :--- |
| `list` or `vars` | Lists all variables currently in REPL memory. |
| `clear vars` or `reset` | Wipes the entire memory state. Fresh start without restarting Revit. |
| `inspect <name>` | Renders a formatted JSON tree of a specific variable. Safe for Revit elements. |

---

## ✨ Discovery & Retrieval

Paracore's "Magic" engine resolves strings into elements, categories, or families.

| Command | Returns | Description |
| :--- | :--- | :--- |
| `GetElements("Doors")` | `List<Element>` | By Category or Family name. |
| `GetElements<Element>()` | `List<Element>` | **Universal Accessor**: every element in model. |
| `GetElements<Wall>()` | `List<Wall>` | All elements of a C# class. |
| `GetElements<FamilyInstance>("Doors")` | `List<FamilyInstance>` | Typed + filtered by category. Preserves type for lambdas. |
| `GetElements<FamilySymbol>("Doors")` | `List<FamilySymbol>` | Type symbols for a category. |
| `GetElement("name")` | `Element?` | Finds one element by name or identity. |
| `GetElement<Room>("name")` | `Room?` | Finds one element of type `T`. |
| `GetMagicNames()` | `List<string>` | All targetable category, family, and class names. |
| `GetCategories()` | `List<string>` | All project categories in the document. |
| `id.ToElement(doc)` | `Element?` | Converts Id (long/int/ElementId) to Element. |

> [!TIP]
> **Two Modes**: `GetElements("Doors")` returns `List<Element>` — use when you only need parameter-based filtering. `GetElements<FamilyInstance>("Doors")` returns `List<FamilyInstance>` — use when you need strongly-typed lambdas.

---

## 🔀 The Two Query Modes

### Mode 1: Generic (String-Based)

```csharp
// Works on List<Element>. WhereParam uses reflection for C# properties.
GetElements("Doors")
    .WhereParam("Level", "Level 1")
    .WhereParam("HandFlipped", "True")  // C# property via reflection — works!
    .OrderByParamDesc("Area")
    .Table()
```

### Mode 2: Typed (Lambda-Based)

```csharp
// Preserves FamilyInstance throughout. Enables direct property access in lambdas.
GetElements<FamilyInstance>("Doors")
    .WhereParam("Level", "Level 1")
    .Where(dr => !dr.HandFlipped)       // direct, strongly-typed lambda
    .OrderByParamDesc("Area")
    .Table()
```

> **Rule**: Start with Mode 1. Use Mode 2 when you need IntelliSense or arithmetic on C# properties inside `.Where()`.

---

## 🪄 Parameter & Property Accessors (Read)

Paracore extends every `Element` with smart, **StorageType-aware** accessors. These automatically handle:
- `BuiltInParameter` name resolution
- `ElementId` → Element Name resolution (Levels, Types, Rooms)
- C# native property fallback via Reflection (`Width`, `FamilyName`, `HandFlipped`, etc.)
- Unit conversion

### `element.GetStr(name)`
**Smart String Getter.** Returns a human-readable string.
- ElementId parameters → returns the **element name** (e.g. `"Level 1"`)
- Numeric params → returns the formatted value string
- Falls back to C# Reflection for native properties (`"HandFlipped"` → `"True"`)
- Returns `""` if not found.

```csharp
wall.GetStr("Level")        // → "Level 1"
door.GetStr("Mark")         // → "D-101"
door.GetStr("HandFlipped")  // → "True"  (via C# Reflection)
```

### `element.GetStr(name, unit)`
Returns the value converted to the specified unit as a plain number string.
```csharp
wall.GetStr("Length", "mm")  // → "3600"
room.GetStr("Area", "m2")    // → "25.46"
```

### `element.GetNum(name)`
**Numeric Getter (Internal Units — feet/sq.ft/cu.ft).** Falls back to C# property via Reflection.
```csharp
wall.GetNum("Length")  // → 11.811 (feet)
```

### `element.GetNum(name, unit)`
**Numeric Getter + Unit Conversion.**

| Unit | Meaning |
|---|---|
| `mm`, `cm`, `m`, `ft`, `in` | Length |
| `m2`, `sqm`, `ft2`, `sqft` | Area |
| `m3`, `cum`, `ft3`, `cuft` | Volume |

```csharp
wall.GetNum("Length", "m")    // → 3.6
room.GetNum("Area", "m2")     // → 25.46
```

### `element.GetVal(name)`
**WYSIWYG Getter.** Returns the formatted string exactly as seen in Revit's Properties palette.
- Returns `"-"` if not found.
```csharp
room.GetVal("Area")   // → "25.46 m²"
wall.GetVal("Level")  // → "Level 1"
```

### `element.GetInt(name)`
**Integer Getter.** Works for yes/no (boolean) parameters too.
```csharp
wall.GetInt("Is External")  // → 1 (true) or 0 (false)
```

---

## 📤 Type-Level Accessors

Same as above, but target the element's **ElementType** (the type definition, not the instance).

```csharp
wall.GetTypeStr("Function")     // → "Exterior"
door.GetTypeNum("Width", "mm")  // → 900.0
wall.GetTypeVal("Width", "mm")  // → "300.0 mm"
wall.GetElementType()           // → returns the WallType Element
```

---

## ✏️ Smart Write Methods

All write methods share the same `IsModifiable` transaction logic:

| Method | Single | Collection | Description |
|:---|:---|:---|:---|
| `SetVal` / `SetNum` | ✅ | via `SetParam` | Smart parameter setters |
| `Delete` | ✅ | ✅ | BIM-Safe Delete (skips Pinned/Curtain) |
| `Hide` / `Unhide` | ✅ | ✅ | Hide/Unhide in active view |
| `Isolate` | ✅ | ✅ | Temporarily isolate in view |

- **No active transaction?** → An auto-transaction is created.
- **Active transaction?** (inside a `Transact()` block) → Runs directly, no sub-transaction.
- **Collection methods** (`.Delete()`, `.SetParam()`, `.Hide()`, `.Unhide()`, `.Isolate()`) batch everything into **one** transaction.

### `element.SetVal(name, value)`
**The Smart Setter.** Handles all common scenarios automatically.

| Input | Behavior |
|---|---|
| `"500 mm"` | Calls `SetValueString` — parses value + unit |
| `"Level 1"` | Resolves by name to `ElementId` |
| `"D-101"` | Standard string set |
| `3.5` (double) | Direct numeric set (internal units) |
| `4` (int) | Integer set |

```csharp
wall.SetVal("Comments", "Reviewed")
wall.SetVal("Base Offset", "500 mm")  // unit-aware
wall.SetVal("Level", "Level 2")       // resolves to ElementId
```

> [!NOTE]
> `SetVal` (and all write/UI methods) auto-wraps in a transaction if none is active. Inside a `Transact()` block, methods detect the active transaction and run directly.

### `element.SetNum(name, value, unit)`
**Explicit Unit-Aware Numeric Setter.**
```csharp
wall.SetNum("Sill Height", 0.9, "m")
Selection[0].SetNum("Base Offset", 100, "mm")
```

---

## 🗂️ Collection Extensions: Filtering

All collection methods are **fully generic** — they preserve the specific element type (`Wall`, `FamilyInstance`, etc.) throughout the chain.

### `.WhereParam(name, value)` — String Filter
Uses `GetStr()` internally → covers Revit parameters **and** C# native properties via Reflection.
```csharp
GetElements("Doors").WhereParam("Level", "Level 1")
GetElements("Doors").WhereParam("HandFlipped", "True")  // Reflection
GetElements("Walls").WhereParam("Mark", "W-01")
```

### `.WhereParam(name, value, unit)` — Numeric Filter
Tolerance-based numeric filter (0.001 in the given unit).
```csharp
GetElements<Wall>().WhereParam("Width", 200, "mm")
GetElements<Room>().WhereParam("Area", 25.0, "m2")
```

### `.WhereMatches(pattern)` — Fuzzy Name Filter
Checks both Type Name and Family Name (case-insensitive).
```csharp
GetElements("Doors").WhereMatches("Single-Flush")
GetElements("Windows").WhereMatches("Fixed")
```

---

## 🔼 Collection Extensions: Sorting

**Smart auto-detection**: numeric parameters (Double/Integer storage) use numeric sort; text parameters use string sort. You never need to specify which.

### `.OrderByParam(name)` — Ascending
```csharp
GetElements("Rooms").OrderByParam("Area").Table()    // smallest first
GetElements("Doors").OrderByParam("Mark").Table()    // A → Z
```

### `.OrderByParamDesc(name)` — Descending
```csharp
GetElements("Rooms").OrderByParamDesc("Area").Table()   // largest first
GetElements("Walls").OrderByParamDesc("Length").Table() // longest first
```

---

## 📊 Collection Extensions: Grouping & Aggregation

### `.GroupByParam(name)` → `Group | Count`
```csharp
GetElements("Doors").GroupByParam("Level").Table()
// Group    | Count
// Level 1  | 14
// Level 2  | 9
```

### `.GroupByParam(groupByParam, sumParam, unit)` → `Group | Count | Total`

Groups by the first parameter, SUMS the second numeric parameter per group in the given unit.

```csharp
// Sum of room Area per Level in m²
GetElements("Rooms").GroupByParam("Level", "Area", "m2").Table()

// Sum of wall Length per Level in meters
GetElements("Walls").GroupByParam("Level", "Length", "m").Table()
// Group    | Count | Total
// Level 1  | 23    | 284.5
// Level 2  | 18    | 201.3
```

### `.SumParam(name, unit)` → `double`
```csharp
double total = GetElements("Rooms").SumParam("Area", "m2");
Println($"Total area: {total:F2} m²");
```

---

## ✏️ Collection Extensions: Bulk Write & Delete

### `.SetParam(name, value)`
Sets a parameter on **every element** in the collection inside a **single transaction**.
Returns the collection (chainable).
```csharp
GetElements<Wall>().WhereParam("Mark", "").SetParam("Mark", "UNTAGGED")
GetElements("Doors").WhereParam("Level", "Level 1").SetParam("Comments", "Level 1 Review")
```

### `.Delete()` — BIM-Safe Bulk Delete
Deletes an entire collection in a **single transaction**. Automatically skips Pinned elements, Curtain Wall Panels, and hosted Curtain Doors to prevent Revit exceptions.
```csharp
GetElements("Generic Models").WhereMatches("TEMP").Delete()
GetElements("Doors").WhereParam("Level", "Level 4").Delete()
```

> [!NOTE]
> Collection methods (`.SetParam()`, `.Delete()`, `.Hide()`, `.Unhide()`, `.Isolate()`) batch all changes into **one transaction** — no `Transact()` needed for fluent chains. Inside an outer `Transact()`, they detect the active transaction and run directly.

---

## 📈 Collection Extensions: Visualization

Works on **any** `IEnumerable<T>`, not just elements.

| Method | Description |
| :--- | :--- |
| `.Table()` | Interactive data grid in Summary tab |
| `.BarChart()` / `.BarGraph()` | Bar chart (data needs `name` + `value` props) |
| `.PieChart()` / `.PieGraph()` | Pie chart |
| `.LineChart()` / `.LineGraph()` | Line chart |

```csharp
// Any projection works directly
GetElements("Walls")
    .GroupByParam("Base Constraint", "Length", "m")
    .Table()
```

---

## 🖱️ Collection Extensions: Revit UI

All return `IEnumerable<T>` (fully chainable).

| Method | Single | Collection | Description |
| :--- | :--- | :--- | :--- |
| `.Select()` | ✅ | ✅ | Select all in Revit UI |
| `.Zoom()` | ✅ | ✅ | Zoom to elements |
| `.Isolate()` | ✅ | ✅ | Temporarily isolate in view |
| `.Delete()` | ✅ | ✅ | BIM-Safe Delete (auto-transaction) |
| `.Peek()` | ✅ | ✅ | Forensic param audit |
| `.Hide()` | ✅ | ✅ | Hide in active view |
| `.Unhide()` | ✅ | ✅ | Unhide in active view |

```csharp
// Find walls without a mark and isolate them
GetElements<Wall>().WhereParam("Mark", "").Isolate()
```

---

## 🚪 Door/Window Orientation Helpers

Revit's `ToRoom`/`FromRoom` swap when a door is flipped. These are stable regardless of flip state.

```csharp
door.RoomAccess()         // "Corridor"  — always the non-swing side
door.RoomDestination()    // "Office 101" — always the swing-into side
door.Handing()            // "RH" — LH or RH
door.HingeSide()          // "Right" — from Access Room perspective
door.IsHandFlipped()      // true/false
door.IsFacingFlipped()    // true/false
```

---

## 🛡️ Coordination & Clash Audit

High-performance geometric interference detection and reporting. These methods leverage the optimized spatial query engine for "DirectShape First" coordination.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.AuditClashes(target)` | Detects intersections with target category | `.AuditClashes("Pipes")` |
| `.AuditClashes(target, tol)`| Audit with double tolerance | `.AuditClashes("Walls", 5.0)` |
| `.Table()` | **Pro Output**: Table + 3D Helpers | `.Table()` |

```csharp
// 🛡️ ARCH/STRUCT COORDINATION AUDIT 🛡️
// Detects clashes and automatically creates 3D intersection volumes/pillars
GetElements("Walls")
    .AuditClashes("StructuralColumns")
    .Table();
```

---

## 🔎 Diagnostics & Inspection

| Method | Description |
| :--- | :--- |
| `element.Peek()` | Forensic audit: Parameter/Storage/GetStr/GetNum/UI Value side-by-side |
| `element.InstanceParams()` | All instance params: Name/Storage/Value |
| `element.TypeParams()` | All type params |
| `element.CombinedParams()` | Instance + Type with Scope column |
| `element.BuiltInParams()` | All BIP identifiers: Name/BIP/Value |
| `element.NativeProperties()` | Level/Workset/DesignOption/Location etc. |
| `element.ParamsDict()` | `Dictionary<string,string>` of all params |
| `element.GeometrySummary()` | Solid/Curve/PolyLine breakdown |
| `element.ReflectionProperties()` | All native C# properties on the type |
| `element.ReflectionMethods()` | All public C# methods on the type (with params) |

```csharp
Selection[0].Peek()
Selection[0].ReflectionMethods().Table()
Selection[0].BuiltInParams().Table()  // Find BIP names for language-independent code
```

---

## ⚖️ Precision & Unit Conversions

The REPL is unit-aware. Always convert — never hardcode `* 304.8`.

```csharp
// Input: user value → internal feet
var targetLength = 2000.0.InputUnit("mm");
GetElements<Wall>().Where(w => w.GetNum("Length") > targetLength)

// Output: internal → human units
var lengthMm = wall.GetNum("Length").OutputUnit("mm");

// Formatted string
Println(wall.GetNum("Length").FormatUnit("mm"));  // → "3600.0 mm"
```

| Method | Description |
| :--- | :--- |
| `.InputUnit("mm")` | User value → internal feet |
| `.OutputUnit("m2")` | Internal → target unit double |
| `.FormatUnit("mm")` | Formatted string with suffix |
| `.FormatValueOnly("mm", 2)` | Numeric string without unit suffix |
| `"dimensionString".ToMeters()` | Parse dimension (e.g. `"500mm"` → `0.5`) |
| `.RoundTo("mm")` | Snap to unit precision |
| `.IsAlmostEqualTo(v)` | Fuzzy equality (1e-9 tolerance) |
| `.AlmostZero()` | Effectively zero? |
| `.IsLessThan(v)` | Precision less-than |
| `.IsGreaterThan(v)` | Precision greater-than |
| `.IsGreaterThanOrEqual(v)` | Precision greater-than-or-equal |
| `.IsLessThanOrEqual(v)` | Precision less-than-or-equal |
| `.IsPositive()` | Strictly positive |
| `.IsNegative()` | Strictly negative |

> [!CAUTION]
> **Never use `==` for doubles.** Use `.IsAlmostEqualTo()` to avoid floating-point noise from Revit geometry.

---

## 🛠️ Model Modification

### Transaction Behavior — Consistent Across All Write Methods

ALL write and UI methods (`SetVal`, `SetNum`, `Delete`, `Hide`, `Unhide`, `Isolate`, `SetParam`) share the same `IsModifiable` transaction logic:

| Scenario | Behavior |
|:---|:---|
| **Single element** (no outer transaction) | Auto-transact — one mini-transaction |
| **Collection method** (no outer transaction) | Auto-transact — ONE transaction for all elements |
| **Inside `Transact()` block** | Runs directly — no sub-transaction |

### Fluent-Chain Modifications (No Transact Needed)

```csharp
// Bulk write — one transaction for all matching walls
GetElements<Wall>().WhereParam("Mark", "").SetParam("Mark", "UNTAGGED")

// Bulk delete — one transaction, BIM-safe
GetElements("Generic Models").WhereMatches("TEMP").Delete()

// Hide/Isolate — one transaction
GetElements("Walls").WhereParam("Mark", "").Isolate()
```

### Manual `foreach` Loops (Transact REQUIRED)

When you need custom logic per element, wrap in `Transact()`. Each method detects the active transaction and runs directly:

```csharp
Transact("Standardize Marks", () => {
    int i = 1;
    foreach (var r in GetElements<Room>())
        r.SetVal("Mark", $"R-{i++:000}");
});

// Conditional deletes inside a loop — Transact keeps undo stack clean
Transact("Remove overlapping columns", () => {
    foreach (var col in toDelete)
        col.Delete();  // detects active transaction, runs directly
});
```

> [!IMPORTANT]
> Without a `Transact()` wrapper, each iteration of a `foreach` loop creates its own mini-transaction — cluttering the Undo stack and hurting performance.

### Execution Timeout
Default is 10 seconds. Extend for long operations:
```csharp
SetExecutionTimeout(120);  // 2 minutes
```

---

## 💡 Implicit Output

The last expression in a REPL run is automatically printed:
```csharp
Doc.Title           // Prints project name
Selection.Count     // Prints selection count
5 + 5               // Prints 10
```

---

## 🧭 Decision Matrix

| I want to... | Use this |
| :--- | :--- |
| Get Level, Type, or Workset name | `.GetStr("Level")` |
| Filter by parameter value | `.WhereParam("Mark", "A1")` |
| Filter by partial string | `.WhereParam("Mark", "starts", "A")` |
| Filter by numeric range | `.WhereParam("Area", ">", 25, "m2")` |
| Filter by C# property (HandFlipped, etc.) | `.WhereParam("HandFlipped", "True")` |
| Filter by family/type name substring | `.WhereMatches("Single-Flush")` |
| Filter with math or IntelliSense | `GetElements<Wall>().Where(w => w.Width > 0.5)` |
| Sort largest-first | `.OrderByParamDesc("Area")` |
| Count per group | `.GroupByParam("Level")` |
| Count + sum per group | `.GroupByParam("Level", "Area", "m2")` |
| Set same value on many | `.SetParam("Comments", "Done")` |
| Delete elements safely | `.Delete()` (single or collection) |
| Hide/Unhide elements | `.Hide()` / `.Unhide()` (single or collection) |
| Isolate quickly | `.Isolate()` on any collection |
| Conditional deletes in a loop | `Transact("name", () => { foreach(...) { el.Delete(); } })` |
| Get raw feet for calculation | `.GetNum("Length")` |
| Get mm for calculation | `.GetNum("Length", "mm")` |
| Export data to Pandas/Python | `.ToNotebook("Analytics")` |
| Find a BIP name | `Selection[0].BuiltInParams().Table()` |
| Debug a filter | `Selection[0].Peek()` |
| Find intersections (Clashes) | `.AuditClashes("Pipes").Table()` |
| Audit using tolerance        | `.AuditClashes("Pipes", 5.0).Table()` |
| Compare two lengths | `.IsAlmostEqualTo(target)` |

### 🚫 Do NOT

- Use `==` for doubles — use `.IsAlmostEqualTo()`.
- Use `element.LookupParameter(...)` — use `GetStr`/`GetNum` instead.
- Hardcode unit math (`* 304.8`) — use `.InputUnit("mm")`.
- Call `.ToList()` before `.Table()` — the engine materializes automatically.

---

## ⚡ Editor Shortcuts

| Key | Action |
|---|---|
| `Ctrl + Enter` | Execute script |
| `Tab` | Insert 4 spaces |
| `Enter` | Auto-indent |

---

## 🚀 Common REPL Recipes

```csharp
// All rooms largest first
GetElements("Rooms").OrderByParamDesc("Area").Table()

// Door count per level
GetElements("Doors").GroupByParam("Level").Table()

// Total wall length per level (m)
GetElements("Walls").GroupByParam("Level", "Length", "m").Table()

// Find hand-flipped doors
GetElements("Doors").WhereParam("HandFlipped", "True").Table()

// Mark all un-tagged walls
GetElements<Wall>().WhereParam("Mark", "").SetParam("Mark", "UNTAGGED")

// Delete temporary elements
GetElements("Generic Models").WhereMatches("TEMP").Delete()

// Delete all doors on a specific level (BIM-safe — skips Curtain Wall doors)
GetElements("Doors").WhereParam("Level", "Level 4").Delete()

// Conditional deletes in a loop (Transact keeps undo stack clean)
Transact("Remove overlapping columns", () => {
    foreach (var col in toDelete)
        col.Delete();
});

// Isolate walls without a mark
GetElements<Wall>().WhereParam("Mark", "").Isolate()

// Structural walls ≥ 300 mm wide
GetElements<Wall>()
    .WhereParam("Width", ">=", 300, "mm")
    .OrderByParamDesc("Width")
    .Table()

// Door schedule with handing
GetElements<FamilyInstance>("Doors")
    .Select(d => new {
        Mark     = d.GetStr("Mark"),
        Type     = d.Name,
        Level    = d.GetStr("Level"),
        Width_mm = d.GetTypeNum("Width", "mm"),
        From     = d.RoomAccess(),
        To       = d.RoomDestination(),
        Handing  = d.Handing()
    })
    .OrderByParam("Mark")
    .Table()
    
// Export Rooms for Pandas Analysis
GetElements<Room>()
    .Select(r => new {
        Number = r.GetStr("Number"),
        Name = r.Name,
        Level = r.GetStr("Level"),
        Area_m2 = r.Area.OutputUnit("m2", 2)
    })
    .ToNotebook("Room_Analysis")

// 🛡️ One-Click Coordination Sweep 🛡️
GetElements("Walls")
    .AuditClashes("StructuralColumns")
    .Table()
```
```
