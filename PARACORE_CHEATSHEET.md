# 🚀 Paracore REPL: Master Cheat Sheet (V4.4.0)

> All extension methods work identically in the **REPL** (single-line and multi-line) and in **Gallery scripts** (full C# project structure). They were designed as shortcuts to simplify the verbose Revit API, but they are standard C# extension methods available everywhere.

A quick reference for high-speed Revit automation using Paracore's fluent API.

---

## 🌎 Global Context Objects

| Object | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The active Revit UI window. |
| `UIApp` | `UIApplication` | Access to Revit UI events and ribbon. |
| `ActiveView` | `View` | The view currently on screen. |
| `Selection` | `List<Element>` | Your current selection in Revit. |
| `Parameters` | `Dictionary` | Parameters passed from the UI/Agent. |

---

## 🔍 Discovery & Retrieval

| Function | Returns | Example |
| :--- | :--- | :--- |
| `GetElements("Doors")` | `List<Element>` | By Category or Family name |
| `GetElements<Wall>()` | `List<Wall>` | By C# class (strictly typed) |
| `GetElements<FamilyInstance>("Doors")` | `List<FamilyInstance>` | Typed + filtered by category |
| `GetElements<Element>()` | `List<Element>` | ALL elements in model |
| `GetElements(BuiltInCategory)` | `List<Element>` | By BuiltInCategory enum |
| `GetElement("W-01")` | `Element?` | Single by name/mark |
| `GetElement<Room>("Office")` | `Room?` | Single, typed |
| `GetMagicNames()` | `List<string>` | All targetable names |
| `GetCategories()` | `List<string>` | All project categories |
| `Pick()` | `Element` | Interactive pick in Revit |

---

## 🪄 Parameter & Property Accessors (Read)

Smart, unit-aware extension methods on every `Element`.

| Method | Returns | Description | Example |
| :--- | :--- | :--- | :--- |
| `.GetStr(name)` | `string` | Human-readable. Resolves ElementIds to names. | `e.GetStr("Level")` |
| `.GetStr(name, unit)` | `string` | Number as plain string in target unit. | `e.GetStr("Length","mm")` |
| `.GetNum(name)` | `double` | Raw internal units (feet). | `e.GetNum("Length")` |
| `.GetNum(name, unit)` | `double` | Converted to target unit. | `e.GetNum("Area","m2")` |
| `.GetVal(name)` | `string` | WYSIWYG formatted (as Revit shows it). | `e.GetVal("Area")` |
| `.GetVal(name, unit)` | `string` | WYSIWYG in target unit. | `e.GetVal("Width","mm")` |
| `.GetInt(name)` | `int` | Integer or boolean (0/1). | `e.GetInt("Is External")` |
| `.FamilyName()` | `string` | True Family Name (system + loadable). | `e.FamilyName()` |
| `.Matches("pat")` | `bool` | Fuzzy Type + Family name search. | `e.Matches("Single-Flush")` |

---

## 📤 Parameter Accessors (Type-Level)

Same as above but target the element's **ElementType**.

| Method | Example |
| :--- | :--- |
| `.GetTypeStr(name)` | `e.GetTypeStr("Function")` |
| `.GetTypeNum(name)` | `e.GetTypeNum("Width")` |
| `.GetTypeVal(name)` | `e.GetTypeVal("Width", "mm")` |
| `.GetTypeInt(name)` | `e.GetTypeInt("Cost")` |
| `.GetElementType()` | `e.GetElementType()` |

---

## ✏️ Element Setters (Write)

| Method | Description | Example |
| :--- | :--- | :--- |
| `.SetVal(name, val)` | **Smart**: string, ElementId, numeric. Auto-transacts. | `e.SetVal("Mark","D-01")` |
| `.SetVal(name,"500 mm")` | Parses unit string. | `e.SetVal("Base Offset","500 mm")` |
| `.SetVal(name,"Level 1")` | Resolves name to ElementId. | `e.SetVal("Level","Level 1")` |
| `.SetNum(name, val, unit)` | Explicit unit-aware numeric set. | `e.SetNum("Sill Height",0.9,"m")` |

---

## 🚪 Door/Window Orientation (Stable)

Stable orientation helpers that don't swap when doors are flipped.

| Method | Returns | Description |
| :--- | :--- | :--- |
| `.RoomAccess()` / `.RoomFrom()` | `string` | Access (non-swing) side room |
| `.RoomDestination()` / `.RoomTo()` | `string` | Swing-into room |
| `.Handing()` | `"LH"/"RH"` | Industry standard handing |
| `.HingeSide()` | `"Left"/"Right"` | From Access Room perspective |
| `.IsHandFlipped()` | `bool` | `FamilyInstance.HandFlipped` |
| `.IsFacingFlipped()` | `bool` | `FamilyInstance.FacingFlipped` |
| `.FindSwingArc()` | `Arc?` | Largest arc in door geometry |
| `.IsStandardDoor()` | `bool` | `true` if not curtain wall panel |
| `.StandardDoor()` | `IEnumerable` | Filters out curtain wall doors |

---

## 🗂️ Collection: Filtering

All methods are **type-preserving** — `List<FamilyInstance>` stays `List<FamilyInstance>`.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.WhereParam(name, val)` | Filter by parameter string | `.WhereParam("Level","L1")` |
| `.WhereParam(name, op, val)` | String predicate filter | `.WhereParam("Mark","starts","D")` |
| `.WhereParam(name, val, unit)` | Filter by numeric value | `.WhereParam("Width",200,"mm")` |
| `.WhereParam(name, op, val, unit)`| Numeric comparison filter | `.WhereParam("Area",">",25,"m2")` |
| `.WhereMatches(pattern)` | Fuzzy name search | `.WhereMatches("Single")` |

---

## 🔼 Collection: Sorting

Auto-detects numeric vs string parameters. No manual casting needed.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.OrderByParam(name)` | Ascending (numeric or string) | `.OrderByParam("Area")` |
| `.OrderByParamDesc(name)` | Descending (numeric or string) | `.OrderByParamDesc("Area")` |

---

## 📊 Collection: Grouping & Aggregation

| Method | Returns | Example |
| :--- | :--- | :--- |
| `.GroupByParam(groupBy)` | `Group \| Count` | `.GroupByParam("Level").Table()` |
| `.GroupByParam(groupBy, sum, unit)` | `Group \| Count \| Total` | `.GroupByParam("Base Constraint","Length","m")` |
| `.SumParam(name, unit)` | `double` | `.SumParam("Area","m2")` |

---

## ✏️ Collection: Bulk Write

| Method | Description | Example |
| :--- | :--- | :--- |
| `.SetParam(name, val)` | Set same value on all (1 transaction) | `.SetParam("Comments","Done")` |

---

## 📈 Collection: Visualization

| Method | Description |
| :--- | :--- |
| `.Table()` | Interactive data grid in Summary tab |
| `.BarChart()` / `.BarGraph()` | Bar chart (needs `name`+`value`) |
| `.PieChart()` / `.PieGraph()` | Pie chart |
| `.LineChart()` / `.LineGraph()` | Line chart |
| `.Show()` | **Pro Output**: Smart data grid + 3D Helpers focus |

---

## 🛡️ Coordination & Clash Audit

High-performance geometric interference detection and reporting.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.AuditClashes(target)` | Detects intersections with target category | `.AuditClashes("Pipes")` |
| `.AuditClashes(target, tol)`| Audit with double tolerance | `.AuditClashes("Walls", 5.0)` |
| `.Table()` | Displays Coordination Table + Visualization | `.Table()` |

---

## 🖱️ Collection: Revit UI

| Method | Single | Collection | Description |
| :--- | :--- | :--- | :--- |
| `.Select()` | ✅ | ✅ | Select in Revit UI |
| `.Zoom()` | ✅ | ✅ | Zoom to elements |
| `.Isolate()` | ✅ | ✅ | Temporarily isolate in view |
| `.Delete()` | ✅ | ✅ | Delete (auto-transaction) |
| `.Peek()` | ✅ | ✅ | forensic param audit |
| `.Hide()` | ✅ | ✅ | Hide in view |
| `.Unhide()` | ✅ | ✅ | Unhide in view |

---

## 🔎 Diagnostics

| Method | Description |
| :--- | :--- |
| `.Peek()` | Side-by-side: Storage/GetStr/GetNum/UI Value |
| `.InstanceParams()` | All instance params as Name/Storage/Value |
| `.TypeParams()` | All type params |
| `.CombinedParams()` | Instance + Type with Scope column |
| `.BuiltInParams()` | All BIP identifiers + values |
| `.NativeProperties()` | Level/Workset/DesignOption/Location etc. |
| `.ParamsDict()` | `Dictionary<string,string>` of all params |
| `.GeometrySummary()` | Solid/Curve/PolyLine summary |
| `.ReflectionProperties()` | All native C# properties on the type |
| `.ReflectionMethods()` | All public C# methods on the type (with params) |

---

## ⚖️ Precision & Units

| Method | Description | Example |
| :--- | :--- | :--- |
| `.InputUnit("mm")` | User value → internal feet | `300.0.InputUnit("mm")` |
| `.OutputUnit("m2")` | Internal → target unit double | `val.OutputUnit("m2")` |
| `.FormatUnit("mm")` | Formatted string with suffix | `val.FormatUnit("mm")` → `"1500 mm"` |
| `.FormatValueOnly("mm")` | Number string without suffix | `val.FormatValueOnly("mm")` → `"1500"` |
| `.RoundTo("mm")` | Snap to unit precision | `val.RoundTo("mm")` |
| `.ToMeters()` | Parse dim string → meters | `"500mm".ToMeters()` → `0.5` |
| `.IsAlmostEqualTo(v)` | Fuzzy equals (1e-9 tol) | `a.IsAlmostEqualTo(b)` |
| `.AlmostZero()` | Effectively zero? | `val.AlmostZero()` |
| `.IsLessThan(v)` | Precision less-than | `val.IsLessThan(limit)` |
| `.IsGreaterThan(v)` | Precision greater-than | `val.IsGreaterThan(0)` |
| `.IsLessThanOrEqual(v)` | Precision ≤ comparison | `val.IsLessThanOrEqual(limit)` |
| `.IsGreaterThanOrEqual(v)` | Precision ≥ comparison | `val.IsGreaterThanOrEqual(0)` |
| `.IsPositive()` | Strictly positive (>1e-9) | `val.IsPositive()` |
| `.IsNegative()` | Strictly negative (<-1e-9) | `val.IsNegative()` |

---

## 🔀 Two Query Modes at a Glance

```csharp
// ── MODE 1: Generic (works on List<Element>) ────────────────────
GetElements("Doors")
    .WhereParam("Level", "Level 1")         // Revit param
    .WhereParam("HandFlipped", "True")      // C# property (reflection)
    .OrderByParamDesc("Area")
    .Table()

// ── MODE 2: Typed (preserves FamilyInstance etc.) ───────────────
GetElements<FamilyInstance>("Doors")
    .WhereParam("Level", "Level 1")
    .Where(dr => !dr.HandFlipped)           // direct lambda — IntelliSense!
    .OrderByParamDesc("Area")
    .Table()
```

> **Rule of thumb:** Start with Mode 1. Upgrade to Mode 2 only when you need direct property access in a lambda.

---

## 💡 Common One-Liners

```csharp
// All rooms sorted by area (largest first)
GetElements("Rooms").OrderByParamDesc("Area").Table()

// Door count per level
GetElements("Doors").GroupByParam("Level").Table()

// Total wall length per level (meters)
GetElements("Walls").GroupByParam("Level","Length","m").Table()

// Flag unreviewed doors
GetElements("Doors").WhereParam("Comments","").SetParam("Comments","Pending")

// Isolate walls without a Mark
GetElements<Wall>().WhereParam("Mark","").Isolate()

// Structural walls ≥ 300mm
GetElements<Wall>().Where(w => w.GetNum("Width","mm") >= 300).Table()
```

---

## 🔧 Script Lifecycle Globals

| Method | Description | Example |
| :--- | :--- | :--- |
| `Transact(name, action)` | Wrap edits in a single undo-step | `Transact("Up", () => { ... })` |
| `Watchdog(callback, interval)` | Register background validation | `Watchdog(doc => { ... }, 10)` |
| `WatchdogReport(summary, status)` | Send status from a sentinel | `WatchdogReport("OK", "success")` |
| `SetExecutionTimeout(seconds)` | Extend script timeout (default 10s) | `SetExecutionTimeout(60)` |
| `Show(type, data)` | Low-level structured output | `Show("table", myList)` |
