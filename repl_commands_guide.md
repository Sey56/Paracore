# 🏁 Paracore REPL Workshop Master Reference

The Paracore REPL Workshop is a high-fidelity C# environment designed for real-time Revit automation. This master reference documents every tool, helper, and shortcut available to you.

## ⚡ Pro Editor Features
The workshop editor provides a "mini-VSCode" experience:
- **Syntax Highlighting**: Real-time C# coloring.
- **Smart Indentation**: Auto-indent on Enter + Brace awareness.
- **Tab Support**: Press Tab to insert 4 spaces.
- **Multi-Line Persistence**: Your code stays in the editor after running for rapid iteration.
- **Execution**: Press **`Ctrl + Enter`** to run.
- **Identifying Labels**: Start your code with `/// My Label` to name your execution turn in the console logs.
- **Session Persistence**: Variables defined in the REPL stay alive between runs within the same session.

---

## 📐 Magic Unit Filtering
You can use units directly in your filter logic to avoid manual math.

```csharp
// Find rooms smaller than 10 square meters
var smallRooms = GetElements<Room>().Where(r => r.Area < 10.ToUnits("m2"));

// Find walls thicker than 300 millimeters
var thickWalls = GetElements<Wall>().Where(w => w.Width > 300.ToUnits("mm"));
```

---

## 💡 Implicit Output (The Shortcut)
You don't always need Println. If your last line of code is an expression that returns a value, the REPL will **automatically print it**.

```csharp
Doc.Title          // Prints project name
Selection.Count    // Prints number of selected elements
5 + 5              // Prints 10
```

---

## 🧠 Core Global Objects
These are globally injected and always available.

| Object | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The Revit UI Document (active window). |
| `UIApp` | `UIApplication` | The top-level Revit UI Application. |
| `ActiveView` | `View` | The currently active view. |
| `Selection` | `List<Element>` | Currently selected elements in Revit. |
| `Parameters` | `Dictionary` | Access to external parameters passed to the script. |

---

## ✨ Magic Discovery & Retrieval
Paracore's "Magic" engine resolves strings into Revit objects and avoids complex collectors.

### Instance & Type Discovery
- `GetElements("Doors")` : All door instances.
- `GetElements("DoorTypes")` : All door family symbols.
- `GetElements<Wall>()` : All walls (via C# type).
- `GetElements<FamilyInstance>("Furniture")` : Targeted class + category filter.

### Identity & Navigation
- `GetElement("My Wall Name")` : Find one element by name or "Magic Identity".
- `GetMagicNames()` : List all 500+ categories and family names you can target.
- `GetCategories()` : List all categories in the project.

---

## 📊 Interactive Visualization
Render rich, interactive data in the **Summary** tab.

- **`Table(data)`** : Renders any list of objects or elements as a searchable grid.
- **`BarChart(data)` / `PieChart(data)`** : Renders objects with `name` and `value` properties.
- **`LineChart(data)`** : Renders a line graph.
- **`Select(elements)`** : Select and zoom to elements in the Revit UI.
- **`Zoom(elements)`** : Zoom the active view to fit elements.
- **`Isolate(elements)`** : Temporarily isolate elements in the view.

---

## 📐 Unit-Aware "Round Trip" Editing
Paracore REPL is not just for viewing; it's a **Dynamic Inspector**. To edit Revit parameters with correct unit conversions directly in the grid, use a **Magic Header Suffix**.

### The Magic Suffix
Append `_unit`, `[unit]`, or `(unit)` to your property name in C#. Paracore will automatically:
1. **Beautify the Header**: Strip the suffix for a clean display (e.g., `Area_m2` → `Area`).
2. **Signal the Unit**: Use the designated unit (e.g., `m2`, `mm`, `ft`) when you edit a cell.
3. **Revit Sync**: Convert your input back to Revit internal units (Feet) before saving.

**Example Command:**
```csharp
Table(GetElements<Room>().Select(r => new { 
    r.Id, 
    r.Name, 
    Area_m2 = r.Area.OutputUnit("m2"),    // the _m2 postfix makes it Editable in Square Meters
    Perimeter_mm = r.Perimeter.OutputUnit("mm") // the _mm postfix makes it Editable in Millimeters
}))
```

---

## 🛠️ Model Modification (Transactions)
To change Revit data, you **must** wrap your code in a `Transact` block.

```csharp
Transact("Pro Labeling", () => {
    var doors = GetElements("Doors");
    foreach (var d in doors) {
        d.LookupParameter("Comments")?.Set("Audit Verified");
    }
});
```

---

## ⏱️ Execution & Timeouts
By default, scripts time out after **10 seconds** to prevent Revit from hanging. For long-running audits, you can increase this:

```csharp
SetExecutionTimeout(60); // Allow 60 seconds
// ... complex logic here ...
```

---

## 🔬 Advanced: Background Watchdogs
Register background validation tasks that run while Revit is idle.

```csharp
Watchdog(() => {
    var thinWalls = GetElements<Wall>().Where(w => w.Width < 0.1);
    if (thinWalls.Any()) {
        WatchdogReport($"Found {thinWalls.Count()} thin walls!", "warning", thinWalls);
    }
}, intervalSeconds: 5);
```

---

## 🏗️ Supported Unit Strings
Use these strings in any `.ToUnits()`, `.FromUnits()`, or "Magic Header" (e.g., `_m2`, `[mm]`).

- **Length**: `mm`, `cm`, `m`, `ft`, `in`
- **Area**: `m2`, `sqm`, `ft2`, `sqft`
- **Volume**: `m3`, `cum`, `ft3`, `cuft`

---

## 📚 Quick C# Cheat Sheet for Revit
Commonly used properties:
- `element.Id` : The ElementId (prints as a number).
- `element.Name` : The name of the element.
- `element.Category` : The Revit category object.
- `element.GetStr("Name")` : **Magic!** Get string parameter by name.
- `element.GetNum("Area", "m2")` : **Magic!** Get numeric value + auto-conversion.
- `element.GetVal("Comments")` : **Magic!** Get formatted value (as seen in UI).
- `element.LookupParameter("Name")` : The standard Revit API way.

---

## 🚀 Examples to Try Now
- **Audit Levels**: `Table(GetElements<Level>())`
- **Room Densities**: `PieChart(GetElements<Room>().GroupBy(r => r.Level.Name).Select(g => new { name = g.Key, value = g.Count() }))`
- **Cleanup**: `Transact("Purge Selection", () => { foreach(var e in Selection) Doc.Delete(e.Id); })`
- **Discovery**: `GetMagicNames().Where(n => n.Contains("Structure"))`
