# 🚀 Paracore REPL Commands Guide

The Paracore REPL is a powerful, persistent C# scratchpad that gives you direct, real-time access to the Revit API and Paracore's high-level automation tools.

## 🧠 CoreScript API
These properties and methods are globally available in every REPL turn.

| Member | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The active Revit UI Document (for selection). |
| `UIApp` | `UIApplication` | The Revit UI Application instance. |
| `ActiveView` | `View` | The currently active view in Revit. |
| `Selection` | `List<Element>` | List of elements currently selected in Revit. |
| `Println(msg)` | `void` | Prints a message or interpolated string to the console. |
| `Parameters` | `Dict` | Access to any parameters passed to the session. |

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

## 📊 Summary & Visualization
Commands to render rich data in the **Summary** tab.

- **`Table(data)`**: Renders any list of objects or Revit elements as an interactive grid.
- **`BarChart(data)` / `PieChart(data)`**: Renders data with `name` and `value` properties.
- **`LineChart(data)`**: Renders a line graph in the summary tab.
- **`Select(elements)`**: Highlight and zoom to a list of elements in Revit.
- **`Zoom(elements)`**: Zoom the view to fit the specified elements.

---

## ⚙️ Advanced: Transactions & Watchdogs

### Transactions
To modify the model, you must wrap your code in a transaction:
```csharp
Transact("Change Room Names", () => {
    var rooms = GetElements<Room>();
    foreach(var r in rooms) r.Name = r.Name.ToUpper();
});
```

### Background Watchdogs
Register a task that runs every few seconds when Revit is idle:
```csharp
Watchdog(() => {
    var errors = GetElements<Wall>().Where(w => w.Width < 0.1);
    WatchdogReport($"Thin Walls: {errors.Count()}", "error", errors);
}, intervalSeconds: 10);
```

---

## 🚀 Experimentation Ideas
- **Audit All Doors**: `Table(GetElements("Doors"))`
- **Count by Types**: `GetElements("DoorTypes").Count`
- **Visual Check**: `Select(GetElements<Wall>().Where(w => w.Width > 0.3))`
- **Category Map**: `Table(GetMagicNames())`

### 1. Data Analysis: Walls by Type
```csharp
var walls = GetElements<Wall>();
var data = walls.GroupBy(w => w.WallType.Name)
                .Select(g => new { name = g.Key, value = g.Count() });

Println($"Analyzed {walls.Count} walls across {data.Count()} types.");
PieChart(data);
Table(data);
```

### 2. Space Audit: Room Areas
```csharp
var rooms = GetElements<Room>().Where(r => r.Area > 0);
var data = rooms.Select(r => new { name = r.Name, value = Math.Round(r.Area, 2) })
                .OrderByDescending(x => x.value);

Println($"Found {rooms.Count()} placed rooms.");
BarChart(data.Take(10)); // Top 10 largest rooms
Table(rooms);
```

### 3. Quick Modification: Uppercase Sheet Names
```csharp
var sheets = GetElements<ViewSheet>();
Transact("Batch Rename Sheets", () => {
    foreach(var sheet in sheets) {
        sheet.Name = sheet.Name.ToUpper();
    }
});
Println($"Processed {sheets.Count} sheets.");
```

### 4. Selection Power
```csharp
// Find all Generic walls and zoom to them
var genericWalls = GetElements<Wall>().Where(w => w.Name.Contains("Generic"));
Select(genericWalls);
Println($"Zoomed to {genericWalls.Count()} generic walls.");
```
