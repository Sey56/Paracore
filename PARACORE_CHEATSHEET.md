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
| `.SetVal(n, v)` | `void` | **Smart Setter** (Auto-ID/Unit).| `e.SetVal("Mark", "101")` |
| `.SetNum(n, v, u)`| `void` | Explicit Unit Setter. | `e.SetNum("L", 1.5, "m")` |
| `.TypeParams()` | `List` | Access all Type parameters. | `e.TypeParams().Table()` |

---

## 🖇️ Fluent Collections (LINQ Extensions)
Chain these onto `IEnumerable<Element>`.

| Method | Description | Example |
| :--- | :--- | :--- |
| `.WhereParam(n, v)` | Fast string filter. | `.WhereParam("Mark", "A")` |
| `.SumParam(n, u)` | Fast unit-aware sum. | `.SumParam("Area", "m2")` |
| `.Table()` | Renders as a searchable grid. | `GetElements().Table()` |
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
| `.BarChart() / .BarGraph()` | Fluent Bar Chart/Graph. | `data.BarGraph()` |
| `.PieChart() / .PieGraph()` | Fluent Pie Chart/Graph. | `data.PieGraph()` |
| `.LineChart() / .LineGraph()`| Fluent Line Chart/Graph. | `data.LineGraph()` |
| `Table(data)` | Global Table (any data). | `Table(myList)` |

---

## ⚖️ Precision & Units
Handle Revit's floating-point noise and unit math.

| Method | Goal | Example |
| :--- | :--- | :--- |
| `.InputUnit("u")` | Number -> Internal (Feet). | `300.InputUnit("mm")` |
| `.OutputUnit("u")` | Internal -> Human units. | `val.OutputUnit("m2")` |
| `.Round(decimals)` | Rounds a decimal number. | `val.Round(2)` |
| `.RoundTo("mm")` | Snap to unit precision. | `val.RoundTo("mm")` |
| `.FormatUnit("m")` | Formatted string with unit. | `val.FormatUnit("m")` |
| `.IsAlmostEqualTo()` | Fuzzy equality check. | `val.IsAlmostEqualTo(target)` |
| `.IsLessThan(limit)` | Precision comparison. | `val.IsLessThan(target)` |
| `.IsGreaterThan(limit)`| Precision comparison. | `val.IsGreaterThan(target)` |
| `.AlmostZero()` | effectively 0 detection. | `val.AlmostZero()` |

---

## 🛠️ Diagnostics & Watchdogs
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
| `Watchdog(fn, s)` | Register background monitor. | `Watchdog(() => ...)` |
| `SetExecutionTimeout(n)`| Extend script time limits. | `SetExecutionTimeout(60)` |

---

🚀 **Pro Tip**: Use `/// Label` at the top of your script to name your output tab in the console!
