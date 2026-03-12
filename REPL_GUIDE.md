# 🚀 Paracore REPL Workshop Master Guide

The Paracore REPL is a powerful, persistent C# scratchpad that gives you direct, real-time access to the Revit API and Paracore's high-level automation tools. 

> [!TIP]
> **Session Persistence**: Variables defined in the REPL stay alive between runs within the same session. Break your complex tasks into small, iterative steps!

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
| `Parameters` | `Dict` | Access to any parameters passed to the session. |
| `Println(msg)` | `void` | Prints a message or interpolated string to the console. |

---

## ✨ Magic Discovery & Filtering
Paracore's "Magic" engine automatically resolves strings into Revit elements, categories, or families.

| Command | Return Type | Description |
| :--- | :--- | :--- |
| `GetElements("Name")` | `List<Element>` | Gets instances of a Category (e.g. "Doors") or Family. |
| `GetElements("NameTypes")` | `List<Element>` | Gets types/symbols of a category (e.g. "FurnitureTypes"). |
| `GetElements<T>()` | `List<T>` | Gets all elements of a specific C# class (e.g. `Wall`). |
| `GetElements<T>("Cat")` | `List<T>` | Gets elements of class `T` filtered by category name. |
| `GetMagicNames()` | `List<string>` | Lists all 500+ targetable category and family names. |
| `GetCategories()` | `List<string>` | Lists all Revit categories in the document. |
| `GetElement(identity)` | `Element?` | Finds one element by name or "Magic Identity". |

---

## 📐 Unit Conversions (Two Styles)
You can use units directly in your logic to avoid manual math. Paracore supports two syntax styles for maximum flexibility.

### 1. Command Style (Procedural)
- `Input(value, "unit")` : `Input(300, "mm")` -> Converts 300mm **TO** Revit internal units.
- `Output(value, "unit", decimals)` : `Output(room.Area, "m2")` -> Converts internal area **TO** meters for display.

### 2. Fluent Style (Extension Methods)
- `.Input("unit")` : `300.Input("mm")`
- `.Output("unit", decimals)` : `room.Area.Output("m2")`

**Supported Units:**
- **Length**: `mm`, `cm`, `m`, `ft`, `in`
- **Area**: `m2`, `sqm`, `ft2`, `sqft`
- **Volume**: `m3`, `cum`, `ft3`, `cuft`

---

## 🪄 Magic Parameter Accessors (Extension Methods)
Paracore adds "Magic" methods to every Revit `Element` to simplify data retrieval. They are **StorageType Aware**—meaning they handle IDs and Units automatically.

- **`element.GetStr("Name")`**: Smart string getter. 
    - If the parameter is an `ElementId` (like Level or Type), it returns the **Element Name**.
    - Falls back to formatted value string for numbers.
- **`element.GetVal("Name")`**: "What You See Is What You Get".
    - Returns the formatted string exactly as seen in the Revit Properties palette.
- **`element.GetNum("Name")`**: Returns raw numeric value (Double) in internal units.
- **`element.GetNum("Name", "unit")`**: Returns numeric value converted to target units.
- **`element.GetInt("Name")`**: Returns the integer value.
- **`element.GetId("Name")`**: Returns the raw `ElementId`.

---

## 📊 Interactive Visualization
Commands to render rich data in the **Summary** tab.

| Command | Description |
| :--- | :--- |
| `Table(data)` | Renders any list of objects or elements as a searchable grid. |
| `BarChart(data)` | Renders a bar chart (objects must have `name` and `value`). |
| `PieChart(data)` | Renders a pie chart (objects must have `name` and `value`). |
| `LineChart(data)` | Renders a line graph. |
| `Select(elements)` | Select and zoom to elements in the Revit UI. |
| `Zoom(elements)` | Zoom the active view to fit elements. |
| `Isolate(elements)` | Temporarily isolate elements in the active view. |

> [!NOTE]
> **Magic Suffixes in Tables**: To enable unit-aware editing in tables, append the unit to the property name (e.g., `Area_m2`, `Width[mm]`).

---

## 🛠️ Model Modification & Background Tasks

### Transactions
To modify the model, you **must** wrap your code in a `Transact` block:
```csharp
Transact("Standardize Names", () => {
    foreach(var r in GetElements<Room>()) r.Name = r.Name.ToUpper();
});
```

### Background Watchdogs
Register a task that runs every few seconds when Revit is idle:
```csharp
Watchdog(() => {
    var thinWalls = GetElements<Wall>().Where(w => w.Width < ToUnit(100, "mm"));
    if(thinWalls.Any()) WatchdogReport($"Found {thinWalls.Count()} thin walls", "warning", thinWalls);
}, intervalSeconds: 10);
```

### Timeouts
Increase script timeout for long-running operations (default is 10s):
```csharp
SetExecutionTimeout(60); // 60 seconds
```

---

## 💡 Implicit Output (The Shortcut)
If your last line of code returns a value, the REPL automatically prints it.
```csharp
Doc.Title          // Prints project name
Selection.Count    // Prints selection count
```
