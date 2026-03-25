# 🚀 Paracore REPL: Master Cheat Sheet (V4.2.0)

A quick reference guide for high-speed Revit automation using Paracore's fluent API.

---

## 🌎 Global Context Objects
These are injected directly into every script's scope.

| Object | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The active Revit UI window. |
| `Selection` | `List<Element>` | Your current selection in Revit. |
| `ActiveView` | `View` | The view currently on screen. |
| `Parameters` | `Dictionary` | Parameters passed from the UI/Agent. |
| `UIApp` | `UIApplication` | Access to Revit UI events and ribbon. |

---

## 🔍 Discovery & Retrieval
Methods to "find" things in your model.

| Function | Description | Example |
| :--- | :--- | :--- |
| `GetElements<Element>()` | Gets ALL elements in the model. | `GetElements<Element>()` |
| `GetElements<T>()` | Gets all elements of a class. | `GetElements<Wall>()` |
| `GetElements("Name")` | Gets by Category/Family name. | `GetElements("Doors")` |
| `GetElement("id/Name")` | Gets a single element. | `GetElement("W1")` |
| `GetMagicNames()` | Lists all targetable names. | `GetMagicNames()` |
| `GetCategories()` | Lists all project categories. | `GetCategories()` |
| `Pick()` | Prompts you to select in Revit. | `var e = Pick();` |

---

## 🪄 Element Accessors (Read/Write)
Smart, unit-aware extension methods on every `Element`.

| Method | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `.GetStr(name)` | `string` | Smart Name/String getter. | `e.GetStr("Level")` |
| `.GetNum(name)` | `double` | Raw numeric (Internal). | `e.GetNum("Length")` |
| `.GetVal(name)` | `string` | WYSIWYG (UI Format). | `e.GetVal("Width")` |
| `.GetInt(name)` | `int` | Integer/Boolean getter. | `e.GetInt("Is External")` |
| `.GetFamilyName()`| `string` | True Family Name getter. | `e.GetFamilyName()` |
| `.Matches("pattern")`| `bool` | Fuzzy Type/Family matcher. | `e.Matches("Flush")` |
| `.SetVal(n, v)` | `void` | **Smart Setter** (Auto-ID/Unit).| `e.SetVal("Mark", "101")` |
| `.SetNum(n, v, u)`| `void` | Explicit Unit Setter. | `e.SetNum("L", 1.5, "m")` |
| `.TypeParams()` | `List` | Access all Type parameters. | `e.TypeParams().Table()` |

---

## 🖇️ Fluent Collections (LINQ Extensions)
Chain these onto `IEnumerable<Element>`.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.WhereParam(n, v)` | Fast string filter. | `.WhereParam("Mark", "A")` |
| `.WhereMatches(p)` | Fuzzy name/family filter. | `.WhereMatches("Flush")` |
| `.SumParam(n, u)` | Fast unit-aware sum. | `.SumParam("Area", "m2")` |
| `.Table()` | Smart, exhaustive parameter grid. | `GetElements("Walls").Table()` |
| `.Select()` | Selects elements in Revit UI.| `walls.Select()` |
| `.Zoom()` | Zooms to elements in Revit. | `walls.Zoom()` |
| `.Isolate()` | Isolates in the active view. | `walls.Isolate()` |
| `.Delete()` | Deletes with transaction. | `walls.Delete()` |
| `.Hide() / .Unhide()`| Visibility control in view. | `walls.Hide()` |

---

## 📈 Dashboarding & Analysis
Render rich visuals in the **Summary** tab.

| Method / Global | Description | Example |
| :--- | :--- | :--- |
| `.BarChart() / BarChart()` | Fluent Bar Chart (Extension or Global). | `data.BarChart()` |
| `.PieChart() / PieChart()` | Fluent Pie Chart (Extension or Global). | `PieChart(data)` |
| `.LineChart() / LineChart()`| Fluent Line Chart (Extension or Global). | `data.LineChart()` |
| `.Table() / Table()` | Universal Table (any data). | `elements.Table()` |
| `.Delete() / Delete()` | Safe Delete (Auto-Transaction). | `Delete(trash)` |

---

## ⚖️ Precision & Units
Handle Revit's floating-point noise and unit math.

| Method | Goal | Example |
| :--- | :--- | :--- |
| `.InputUnit("u")` | Number -> Internal (Feet). | `300.InputUnit("mm")` |
| `.OutputUnit("u")` | Internal -> Human units. | `val.OutputUnit("m2")` |
| `.RoundTo("mm")` | Snap to unit precision. | `val.RoundTo("mm")` |
| `.FormatUnit("m")` | Formatted string with unit. | `val.FormatUnit("m")` |
| `.IsAlmostEqualTo()` | Fuzzy equality check. | `val.IsAlmostEqualTo(target)` |
| `.IsLessThan(limit)` | Precision comparison. | `val.IsLessThan(target)` |
| `.IsGreaterThan(limit)`| Precision comparison. | `val.IsGreaterThan(target)` |
| `.AlmostZero()` | effectively 0 detection. | `val.AlmostZero()` |

---

## 🛠️ Diagnostics
Tools for BIM managers and debuggers.

| Function | Description | Example |
| :--- | :--- | :--- |
| `Peek(element)` | Side-by-side API analysis. | `Peek(Selection[0])` |
| `.AllParams()` | Full raw parameter list. | `Table(e.AllParams())` |
| `ListParams(e)` | Sorted property table. | `ListParams(e)` |
| `ListBIPs(e)` | Show BuiltInParameters. | `ListBIPs(e)` |
| `ListProperties(e)` | Key API metadata table. | `ListProperties(e)` |
| `ListGeometry(e)` | Volume/Area/Solid table. | `ListGeometry(e)` |
| `Transact("name", fn)`| Wrap edits in a transaction. | `Transact("Up", () => ...)` |
| `SetExecutionTimeout(n)`| Extend script time limits. | `SetExecutionTimeout(60)` |

## 📊 Structured Output Reference
Understanding when to use `.Table()` vs. Auto-rendering functions.

### Manual Tables (Chain `.Table()`)
*   **`elements.Table()`**: Dynamic discovery of all parameters.
*   **`data.Table()`**: Renders any object list or projection.

### Auto-Rendering (No `.Table()` needed)
*   **`Peek(el)`**: Forensic comparison (API vs UI).
*   **`ListParams(el)`**: Full instance parameter table.
*   **`ListProperties(el)`**: Non-parameter metadata (Level, Workset).
*   **`ListGeometry(el)`**: Solid/Volume/Area breakdown.

### Returns List (No Table)
*   **`GetMagicNames()`**: All targetable hydration names.
*   **`GetCategories()`**: Project categories list.
