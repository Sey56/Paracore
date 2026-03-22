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
| `GetElements<Element>()` | `List<Element>` | **Universal Accessor**: Gets EVERY element in the model. |
| `GetElements<T>()` | `List<T>` | Gets all elements of a C# class (e.g. `Wall`, `Room`). |
| `GetElements<FamilyInstance>("Doors")` | `List<FamilyInstance>` | Gets loadable component instances filtered by category. |
| `GetElements<FamilySymbol>("Doors")` | `List<FamilySymbol>` | Gets loadable component types filtered by category. |
| `GetElement("name")` | `Element?` | Finds one element by name or identity. |
| `GetElement<T>("name")` | `T?` | Finds one element of type `T` by name or identity. |
| `GetMagicNames()` | `List<string>` | Lists all targetable category, family, and class names. |
| `GetCategories()` | `List<string>` | Lists all Revit categories in the document. |

> [!TIP]
> **Universal Accessor**: Use `GetElements<Element>()` to target everything in the model at once. Since `Element` is the base class for all Revit objects, this is the most powerful way to perform bulk audits or cross-category filtering.

---

## 🪄 Element Parameter Accessors (Extension Methods)
Paracore extends every Revit `Element` with smart, **StorageType-aware** parameter accessors. These handle BuiltInParameters, ElementId resolution, and unit conversion automatically.

> [!IMPORTANT]
> Revit elements like `Wall`, `Room`, `Floor` etc. do NOT have direct C# properties like `.Width`, `.Length`, or `.Level`. You **must** use these accessors to read most parameter values.

### The Rule of Thumb (Native Properties vs Extension Methods)
In the Revit API, some common attributes are exposed as native C# properties on specific element classes, while the vast majority of data exists as dynamic Parameters.
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
- `IsLessThan()`, `IsGreaterThan()`, `IsPositive()`, `IsNegative()`: Safety-wrapped comparisons.

### Interactive Diagnostics (Peek)

Use the `Peek(element)` command to see exactly how the engine resolves every parameter on an object. This is your "Source of Truth" when a filter is behaving unexpectedly.

```csharp
Peek(Selection[0]); // Lists Name, Storage, GetStr, GetNum, and UI Value side-by-side
```

### Writing Data (SetVal & SetNum)

**`element.SetVal(name, value)`**: The Smart Setter. It handles almost anything you throw at it:
- **`wall.SetVal("Base Offset", "500 mm")`**: High-speed unit parsing.
- **`wall.SetVal("Level", "Level 1")`**: Finds the Level by name.
- **`wall.SetVal("Comments", "Updated")`**: Standard string set.
- **`wall.SetVal("Mark", 101)`**: Standard numeric set.

**`element.SetNum(name, value, unit)`**: Explicit unit-aware numeric setter.
```csharp
Selection[0].SetNum("Base Offset", 100, "mm");
```
| Method | Description | Example |
| :--- | :--- | :--- |
| `.IsLessThan(limit)` | Strictly less than (ignores noise). | `val.IsLessThan(10.InputUnit("m"))` |
| `.IsGreaterThan(limit)` | Strictly greater than (ignores noise). | `val.IsGreaterThan(0)` |
| `.IsLessThanOrEqual(limit)` | Less than or essentially equal. | `val.IsLessThanOrEqual(limit)` |
| `.IsGreaterThanOrEqual(limit)` | Greater than or essentially equal. | `val.IsGreaterThanOrEqual(limit)` |
| `.IsAlmostEqualTo(other)` | Fuzzy equality check (1e-9 tolerance). | `val.IsAlmostEqualTo(other)` |
| `.AlmostZero()` | Returns true if value is essentially 0. | `val.AlmostZero()` |
| `.IsPositive()` | Strictly positive (> tolerance). | `val.IsPositive()` |
| `.IsNegative()` | Strictly negative (< -tolerance). | `val.IsNegative()` |
| `.Round(decimals)` | Rounds to decimal places. | `val.Round(2)` |
| `.RoundTo("unit")` | Snaps internal value to unit precision. | `val.RoundTo("mm")` |

---

## 📊 Interactive Visualization
Commands to render rich data in the **Summary** tab.

### Fluent Visualization & Navigation
Every collection and element can now be visualized or manipulated using chained methods.
 
| Chained Method | Description | Example |
| :--- | :--- | :--- |
| `.Table()` | Renders the collection or element as a table. | `Selection.Table()` |
| `.ChartBar()` | Renders data as a bar chart. | `data.ChartBar()` |
| `.ChartPie()` | Renders data as a pie chart. | `data.ChartPie()` |
| `.Select()` | Selects the element(s) in Revit. | `GetElements<Wall>().Select()` |
| `.Zoom()` | Zooms to the element(s) in Revit. | `Selection.Zoom()` |
| `.Isolate()` | Isolates the element(s) in the view. | `rooms.Isolate()` |
| `.Hide() / .Unhide()` | Toggles visibility in the active view. | `Selection.Hide()` |
| `.Delete()` | Deletes the element(s). | `Selection.Delete()` |
 
### 🪄 Quick Access & Filtering
| Helper | Description | Example |
| :--- | :--- | :--- |
| `id.ToElement()` | Resolves a numeric ID to a Revit Element. | `123456.ToElement(Doc)` |
| `.WhereParam(name, val)` | Fast filtering by string value. | `walls.WhereParam("Mark", "A1")` |
| `.SumParam(name, unit)` | Quickly sum a numeric parameter. | `rooms.SumParam("Area", "m2")` |
 
| Command | Aliases | Description |
| :--- | :--- | :--- |
| `Table(data)` | — | Renders any list, projection, or elements as a searchable grid. **Note:** For Revit elements, numeric values are automatically formatted to your Project Units and Precision. |
| `ListParams(input)` | — | Fast property-palette style list of ALL parameters for one or more elements. |
| `ListBIPs(input)` | — | The "X-Ray" view. Lists the unique BuiltInParameter names for surgical code access. |
| `ListProperties(input)` | — | Table summary of Revit API properties (Category, Level, Location, etc.). |
| `ListGeometry(input)` | — | Summary of solids, total volume, and surface area for an element. |
| `Delete(input)` | — | Safely deletes one or more elements (includes automatic transaction). |
| `BarChart(data)` | `BarGraph(data)` | Renders a bar chart (objects need `name` and `value`). |
| `PieChart(data)` | `PieGraph(data)` | Renders a pie chart (objects need `name` and `value`). |
| `LineChart(data)` | `LineGraph(data)` | Renders a line graph. |
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
To modify the model, you **must** wrap your code in a `Transact` block. If you need to access the active document inside the block, simply use the global `Doc` object.
```csharp
Transact("Standardize Names", () => {
    foreach(var r in GetElements<Room>()) r.Name = r.Name.ToUpper();
});
```

### Execution Timeout
Increase script timeout for long-running operations (default is 10s):
```csharp
SetExecutionTimeout(60); // 60 seconds
```
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
- **Persistence**: Your code stays in the editor after running.

---

## 📊 Structured Output & Auto-Rendering Reference

Use this matrix to understand when to manually call `.Table()` and when the engine provides a structured view automatically.

### 1. Manual Collection Tables (Chain `.Table()`)
Chain these to elements or collections to pipe them into the **Summary** tab.
*   **`elements.Table()`**: **Smart & Dynamic**. Discovers and renders ALL parameters for homogeneous element collections.
*   **`data.Table()`**: Renders any list of objects, anonymous types, or dictionaries.

### 2. Auto-Rendering Diagnostics (No `.Table()` needed)
These methods directly output a table to the Summary tab for fast discovery (Targets Elements/Ids):
*   **`Peek(el)`**: **Forensic Audit**. Shows `Parameter | Storage | GetStr | GetNum | UI Value` side-by-side.
*   **`ListParams(el)`**: Clean, sorted table of every non-empty parameter and its formatted value.
*   **`ListProperties(el)`**: Tables of internal Revit properties (Level, Workset, DesignOption, Location).
*   **`ListGeometry(el)`**: Summary table of Solid counts, Volume, and Surface Area.
*   **`ListBIPs(el)`**: Lists all valid `BuiltInParameter` identifiers for the specific element.

### 3. Metadata Discovery & Lists (Returns `List<string>`)
These return raw string lists. You can iterate over them (`foreach`) or `Println` them.
*   **`GetMagicNames()`**: Master list of all targetable Category, Family, and Class names.
*   **`GetCategories()`**: Complete list of all Categories available in the project.

---
🚀 **Mastery Tip**: If you need to manipulate or filter the data *before* rendering, use the extension equivalent (e.g., `el.AllParams().Table()`) instead of the auto-rendering helper.
