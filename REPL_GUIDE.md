# 🚀 Paracore REPL Reference Guide

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
| `Selection` | `List<Element>` | List of elements currently selected in Revit. |
| `Parameters` | `Dictionary<string, object>` | Dictionary of parameters passed from the UI or agent context. |
| `Println(msg)` | `void` | Prints a message (supports `$""` interpolation) to the console. |
| `Print(msg)` | `void` | Alias for `Println`. |

---

## 💾 Memory & Session Management
Because the REPL runs continuously, variables you define (`var x = 5;`) stay alive between execution turns. Paracore provides built-in commands to manage this active memory state.

> [!TIP]
> These commands are intercepted by the engine directly. You do not need semicolons for them.

| Command | Description | Example |
| :--- | :--- | :--- |
| `list` or `vars` | Enumerates all variables currently stored in the active REPL memory. Shadows are automatically filtered to show only the latest value. | `list` |
| `clear vars` or `reset` | Wipes the entire memory state. Use this to start a totally fresh session without having to restart Revit. | `clear vars` |
| `inspect <name>` | Returns a formatted JSON tree of a specific variable, safely serializing Revit elements to prevent circular reference crashes. | `inspect myWall` |

---

## ✨ Magic Discovery & Filtering
Paracore's "Magic" engine resolves strings into Revit elements, categories, or families.

| Command | Return Type | Description |
| :--- | :--- | :--- |
| `GetElements("Doors")` | `List<Element>` | Gets instances of a Category or Family. |
| `GetElements("DoorTypes")` | `List<Element>` | Gets types/symbols (append `Types` suffix). |
| `GetElements<T>()` | `List<T>` | Gets all elements of a C# class (e.g. `Wall`, `Room`). |
| `GetElements<FamilyInstance>("Doors")` | `List<FamilyInstance>` | Gets loadable component instances filtered by category. |
| `GetElements<FamilySymbol>("Doors")` | `List<FamilySymbol>` | Gets loadable component types filtered by category. |
| `GetElement("name")` | `Element?` | Finds one element by name or identity. |
| `GetElement<T>("name")` | `T?` | Finds one element of type `T` by name or identity. |
| `GetMagicNames()` | `List<string>` | Lists all targetable category, family, and class names. |
| `GetCategories()` | `List<string>` | Lists all Revit categories in the document. |

---

## 🪄 Element Parameter Accessors (Extension Methods)
Paracore extends every Revit `Element` with smart, **StorageType-aware** parameter accessors. These handle BuiltInParameters, ElementId resolution, and unit conversion automatically.

> [!IMPORTANT]
> Revit elements like `Wall`, `Room`, `Floor` etc. do NOT have direct C# properties like `.Width`, `.Length`, or `.Level`. You **must** use these accessors to read most parameter values.

### The Rule of Thumb (Native Properties vs Extension Methods)
Because Revit API is quirky, some common attributes are hardcoded as **native C# properties** on specific element classes, while the vast majority exist purely as dynamic `Parameters`.
1. **If IntelliSense suggests it natively**: Properties like `.Name`, `.Area`, `.Volume`, and `.Location` are often hardcoded natively on classes like `Room` or `Wall`. You can use them directly!
    - Example: `room.Area` or `wall.Volume`
2. **If it's a standard Revit property without IntelliSense**: Things like `Level`, `Base Constraint`, `Mark`, or `Comments` live exclusively in the `Parameters` dictionary. You **must** use Paracore's extension methods to read them.
    - Example: `room.GetStr("Level")` or `wall.GetNum("Length")`

### `element.GetStr("paramName")`
**Smart String Getter.** Returns a human-readable string.
- If the parameter is an `ElementId` (like Level, Type), returns the **Element Name** (e.g. `"Level 1"`).
- Falls back to a formatted value string for numbers.
- Returns `""` if the parameter is not found.

### `element.GetVal("paramName")`
**WYSIWYG Getter.** Returns the formatted string exactly as seen in the Revit Properties palette (e.g. `"200.0 mm"`, `"1.25 m³"`).
- Falls back to `GetStr` if Revit doesn't provide a formatted string.
- Returns `"-"` if the parameter is not found.

### `element.GetNum("paramName")`
**Numeric Getter (Internal Units).** Returns the raw `double` value in Revit internal units (feet, sq feet, etc.).
- Returns `0.0` if the parameter is not found.

### `element.GetNum("paramName", "unit")`
**Numeric Getter + Unit Conversion.** Returns the value converted to the specified unit.
- Example: `wall.GetNum("Length", "mm")` → length in millimeters.
- Example: `room.GetNum("Area", "m2")` → area in square meters.

### `element.GetInt("paramName")`
**Integer Getter.** Returns the integer value of the parameter.
- Returns `0` if the parameter is not found.

### `element.AllParams()`
**The Parameter Peek.** Returns a list of objects containing `Name`, `Storage (Type)`, and `Value` for every non-empty parameter on the element.
- Best used with `Table()`: `Table(myWall.AllParams())`
- Shortcut: `ListParams(myWall)`

### `element.TypeParams()`
**The Type Peek.** Same as `AllParams` but for the element's `ElementType`.
- Shortcut: `ListParams(myWall.GetTypeId())`

### `element.AllProperties()`
**The API Peek.** Returns a table of standard Revit API properties not found in the parameters dictionary (Category, Level, Workset, Design Option, Location Point/Curve, Owner, etc.).
- Best used with `Table()`: `Table(myWall.AllProperties())`
- Shortcut: `ListProperties(myWall)`

### `element.AllGeometry()`
**The Geometry Peek.** Returns a summary table of solid count, total volume, and total surface area.
- Best used with `Table()`: `Table(myWall.AllGeometry())`
- Shortcut: `ListGeometry(myWall)`

---

## 📐 Geometry Instances & Coordinate Spaces
When working with **CAD Imports** or **Nested Families**, Revit provides geometry through a `GeometryInstance`. You must choose which "space" you want to work in.

| Method | Space | Description |
| :--- | :--- | :--- |
| `.GetInstanceGeometry()` | **Project** | Returns coordinates relative to your Revit project. **Result is a COPY.** |
| `.GetSymbolGeometry()` | **Local** | Returns raw coordinates from the origin of the Family/CAD file. **Result is a REFERENCE.** |

> [!TIP]
> Use `.GetSymbolGeometry()` if you need to create Revit elements (like dimensions or face-based parts) that reference the original geometry. Use `.GetInstanceGeometry()` for calculations like volume or center-points.

### The "Cabinet & Drawer" Analogy
To understand these methods, think of a Revit Element as a filing cabinet:
*   **The Parameter Name** (e.g., `"Length"`) is the **Label** on the outside of the drawer.
*   **The Method** (e.g., `GetNum`) is the **Action** of opening that drawer.
*   **The Return Value** (e.g., `1500.0`) is the **Content** of the paper inside.

### Parameter Name Resolution
All accessors support **three** ways to target a "drawer":
1.  **Standard Name:** `wall.GetNum("Length")` (Simple, but language-dependent).
2.  **BIP String:** `wall.GetNum("CURVE_ELEM_LENGTH")` (Language-independent).
3.  **BIP Enum:** `wall.GetNum(BuiltInParameter.CURVE_ELEM_LENGTH)` (Pro: Full IntelliSense in VSCode).

---

## 📐 Unit Conversions

The REPL is unit-aware. Use `.InputUnit("unit")` to convert *to* Revit internal units (for filtering/logic) and `.OutputUnit("unit")` to convert *from* internal units (for display).

```csharp
// Filtering (Target 2.0 meters)
var walls = GetElements<Wall>().Where(w => w.GetNum("Length") > 2.0.InputUnit("m"));

// Display (Convert internal feet to mm)
var length = wall.GetNum("Length").OutputUnit("mm");
```
> [!NOTE]
> All backward-compatibility aliases (like `ToUnits`) have been removed in favor of this consolidated API.

### Formatting Helper
| Method | Description | Example |
| :--- | :--- | :--- |
| `.FormatUnit("unit")` | Returns formatted string with unit suffix | `val.FormatUnit("mm")` → `"1500.0 mm"` |

### Supported Unit Strings
- **Length**: `mm`, `cm`, `m`, `ft`, `in`
- **Area**: `m2`, `sqm`, `ft2`, `sqft`
- **Volume**: `m3`, `cum`, `ft3`, `cuft`

---

## ⚖️ Precision-Aware Comparisons

Always use fuzzy comparison methods when working with Revit geometry to avoid floating-point inaccuracies.

- `IsAlmostEqualTo(other, tolerance)`: Standard fuzzy equality.
- `AlmostZero()`: Check if a value is effectively zero.
- `IsLess()`, `IsGreater()`, `IsPositive()`, `IsNegative()`: Safety-wrapped comparisons.

### Interactive Diagnostics (Peek)

Use the `Peek(element)` command to see exactly how the engine resolves every parameter on an object. This is your "Source of Truth" when a filter is behaving unexpectedly.

```csharp
Peek(Selection[0]); // Lists Name, Storage, GetStr, GetNum, and UI Value side-by-side
```

### Writing Data (SetNum)

Use `SetNum(name, value, unit)` to write numeric data back to elements. It handles the unit conversion and transaction logic automatically.

```csharp
Selection[0].SetNum("Base Offset", 100, "mm");
```
| Method | Description | Example |
| :--- | :--- | :--- |
| `.IsLess(limit)` | Strictly less than (ignores noise). | `val.IsLess(10.InputUnit("m"))` |
| `.IsGreater(limit)` | Strictly greater than (ignores noise). | `val.IsGreater(0)` |
| `.IsLessOrEqual(limit)` | Less than or essentially equal. | `val.IsLessOrEqual(limit)` |
| `.IsGreaterOrEqual(limit)` | Greater than or essentially equal. | `val.IsGreaterOrEqual(limit)` |
| `.IsAlmostEqualTo(other)` | Fuzzy equality check (1e-9 tolerance). | `val.IsAlmostEqualTo(other)` |
| `.AlmostZero()` | Returns true if value is essentially 0. | `val.AlmostZero()` |
| `.IsPositive()` | Strictly positive (> tolerance). | `val.IsPositive()` |
| `.IsNegative()` | Strictly negative (< -tolerance). | `val.IsNegative()` |
| `.RoundTo("unit")` | Snaps internal value to unit precision. | `val.RoundTo("mm")` |

---

## 📊 Interactive Visualization
Commands to render rich data in the **Summary** tab.

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `Table(data)` | — | Renders any list, projection, or elements as a searchable grid. **Note:** For Revit elements, numeric values are automatically formatted to your Project Units and Precision. |
| `ListParams(input)` | — | Fast property-palette style list of ALL parameters for one or more elements. |
| `ListBIPs(input)` | — | The "X-Ray" view. Lists the unique BuiltInParameter names for surgical code access. |
| `ListProperties(input)` | — | Table summary of Revit API properties (Category, Level, Location, etc.). |
| `ListGeometry(input)` | — | Summary of solids, total volume, and surface area for an element. |
| `Delete(input)` | — | Safely deletes one or more elements (includes automatic transaction). |
| `BarChart(data)` | `ChartBar(data)` | Renders a bar chart (objects need `name` and `value`). |
| `PieChart(data)` | `ChartPie(data)` | Renders a pie chart (objects need `name` and `value`). |
| `LineChart(data)` | `ChartLine(data)`, `LineGraph(data)` | Renders a line graph. |
| `Select(elements)` | — | Selects and zooms to elements in Revit. |
| `Zoom(elements)` | — | Zooms the active view to fit elements. |
| `Isolate(elements)` | — | Temporarily isolates elements in the active view. |
| `Show(type, data)` | — | Low-level: renders data with a custom type string. |

### Lazy Projections
You can pass `.Select()` projections directly to `Table()`, `BarChart()`, `PieChart()`, and `LineChart()` — no `.ToList()` required. The engine automatically materializes lazy enumerables:
```csharp
// This works directly — no .ToList() needed
Table(GetElements<Wall>().Select(w => new { w.Id, w.Name, Length_mm = w.GetNum("Length", "mm") }));
```

### Magic Header Suffixes (Unit-Aware Table Editing)
When you create a `Table`, append a unit to the property name to enable unit-aware editing:
- **Supported formats**: `_unit`, `[unit]`, `(unit)` (e.g., `Area_m2`, `Width[mm]`)
- Paracore will **beautify the header** (strip the suffix) and **handle unit conversion** when editing.

> [!IMPORTANT]
> **Table column headers come from C# property names.** The exact name you use in the anonymous object projection becomes the JSON key and therefore the column header. This means `Length_mm` shows as `Length` (suffix stripped), but you must use the exact property form — see the Examples guide for details.

---

## 🛠️ Model Modification

### Transactions
To modify the model, you **must** wrap your code in a `Transact` block:
```csharp
Transact("Standardize Names", () => {
    foreach(var r in GetElements<Room>()) r.Name = r.Name.ToUpper();
});
```
The `Transact` block also supports a `Document` parameter:
```csharp
Transact("My Edit", (doc) => {
    // 'doc' is available here
});
```

### Background Watchdogs
Register a task that runs periodically when Revit is idle:
```csharp
Watchdog(() => {
    var shortWalls = GetElements<Wall>().Where(w => w.GetNum("Length", "mm") < 1000);
    if(shortWalls.Any()) WatchdogReport($"Found {shortWalls.Count()} short walls!", "warning", shortWalls);
}, intervalSeconds: 10);
```

`WatchdogReport(summary, status, data)` sends a status report:
- `status`: `"success"`, `"warning"`, or `"error"`
- `data`: optional list of elements or objects

### Execution Timeout
Increase script timeout for long-running operations (default is 10s):
```csharp
SetExecutionTimeout(60); // 60 seconds
```

---

## 💡 Implicit Output (The Shortcut)
If your last line of code returns a value, the REPL automatically prints it:
```csharp
Doc.Title          // Prints the project name
Selection.Count    // Prints the number of selected elements
5 + 5              // Prints 10
```

---

## 🧭 REPL Decision Matrix: What to Use When?

| I want to... | Use this... | Why? |
| :--- | :--- | :--- |
| **Read a Level, Type, or Workset** | `.GetStr("Level")` | Handles ElementId-to-Name resolution automatically. |
| **Get raw feet/sqft for calculation** | `.GetNum("Area")` | Direct access to internal double value (no units). |
| **Get mm/meters for calculation** | `.GetNum("Length", "mm")` | Built-in conversion + precision handling. |
| **Find a parameter's internal name** | `ListBIPs(Selection[0])` | Shows the `BuiltInParameter` string for stable, language-independent code. |
| **Debug a filter that "should" work** | `Peek(Selection[0])` | Shows you exactly how the engine resolves that parameter vs. the Revit UI. |
| **Write a numeric value** | `.SetNum("Offset", 100, "mm")` | Handles conversion, "double" formatting, and validation in one go. |
| **Compare two Revit lengths** | `.IsAlmostEqualTo(target)` | Crucial for ignoring the `0.000000003` noise in Revit geometry. |

### 🚫 What NOT to do:
- **DON'T** use `==` for doubles. Use `.IsAlmostEqualTo()`.
- **DON'T** use `Selection[0].LookupParameter(...)`. It's verbose and slow. Use `GetNum/GetStr` instead.
- **DON'T** hardcode unit math (like `* 304.8`). Use `.InputUnit("mm")` or `.OutputUnit("mm")`.

---

## ⚡ Editor Features
- **Syntax Highlighting**: Real-time C# coloring.
- **Smart Indentation**: Auto-indent on Enter + brace awareness.
- **Tab Support**: Press Tab to insert 4 spaces.
- **Execution**: Press **`Ctrl + Enter`** to run.
- **Labels**: Start your code with `/// My Label` to name your execution turn in the console logs.
- **Persistence**: Your code stays in the editor after running.
