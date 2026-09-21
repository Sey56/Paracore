# 🚀 Paracore REPL Reference Guide (v4.9)

The Paracore REPL is a persistent C# scratchpad with direct, real-time access to the Revit API and Paracore's high-level automation helpers. For the complete method catalog with every overload and signature, see **[EXTENSION_METHODS.md](EXTENSION_METHODS.md)**.

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

Every element has smart accessors — see `EXTENSION_METHODS.md` for the full catalog.

```csharp
wall.GetStr("Level")          // "Level 1" (ElementId → name)
wall.GetNum("Length", "m")    // 3.6
wall.GetNum("Width", "mm")    // 200
wall.GetInt("Room Bounding")  // 1 or 0
wall.GetVal("Area")           // "14.52 m²" (WYSIWYG)
wall.GetStr("HandFlipped")    // "True" (C# property fallback)
```

| Quick reference | |
|---|---|
| `GetStr("Level")` | String — resolves ElementIds to names |
| `GetNum("Area", "m2")` | Double — with unit conversion |
| `GetInt("Room Bounding")` | Integer — yes/no → 1/0 |
| `GetVal("Area")` | Formatted string with unit suffix |
| `GetTypeStr`, `GetTypeNum`, `GetTypeInt` | Type-level equivalents |

---

---

## 🔗 Method Reference

For the complete catalog with every overload and parameter pattern, see **[EXTENSION_METHODS.md](EXTENSION_METHODS.md)**. Quick links to key sections:

| Task | Section in EXTENSION_METHODS.md |
|---|---|
| GetStr / GetNum / GetInt / GetVal | [Element: Parameter Accessors](EXTENSION_METHODS.md#1-element-parameter--property-accessors-read) |
| SetVal / SetNum | [Element: Smart Write Methods](EXTENSION_METHODS.md#3-element-smart-write-methods) |
| WhereParam / WhereMatches / WhereMaterial | [Collection: Filtering](EXTENSION_METHODS.md#9-collection-filtering) |
| OrderByParam / GroupByParam / SumParam | [Collection: Sorting](EXTENSION_METHODS.md#10-collection-sorting) + [Grouping](EXTENSION_METHODS.md#11-collection-grouping--aggregation) |
| SetParam (bulk write) | [Collection: Bulk Write](EXTENSION_METHODS.md#12-collection-bulk-write) |
| Table / BarChart / PieChart / LineChart | [Global ScriptApi](EXTENSION_METHODS.md#16-global-scriptapi-methods) |
| Select / Zoom / Isolate / Hide / Delete | [Element UI](EXTENSION_METHODS.md#8-element-revit-ui-actions) + [Collection UI](EXTENSION_METHODS.md#13-collection-revit-ui-actions) |
| RoomFrom / RoomTo / Handing / StandardDoor | [Door/Window](EXTENSION_METHODS.md#5-element-specialized-doorwindow) |
| AuditClashes / ClearClashHelpers | [Coordination](EXTENSION_METHODS.md#16-coordination--clash-detection) |
| InputUnit / OutputUnit / FormatUnit / ToMeters / precision comparisons | [Numeric & Unit Helpers](EXTENSION_METHODS.md#15-numeric--unit-helpers) |
| BuiltInParams / CombinedParams / Peek / ReflectionProperties | [Element: Discovery](EXTENSION_METHODS.md#4-element-identity--discovery) |
| Materials / Eco.GetCarbon / Eco.GetUValue | [Materials & Sustainability](EXTENSION_METHODS.md#6-element-materials--sustainability) |

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
