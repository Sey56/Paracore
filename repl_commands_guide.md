# 🏁 Paracore REPL Quick Reference Card

A concise reference of every function, method, and shortcut available in the Paracore REPL.

---

## ⚡ Editor Shortcuts
| Action | Shortcut |
| :--- | :--- |
| Run code | `Ctrl + Enter` |
| Name execution turn | `/// My Label` at top of code |
| Insert tab | `Tab` (4 spaces) |

---

## 🧠 Global Objects

| Object | Type | Description |
| :--- | :--- | :--- |
| `Doc` | `Document` | Active Revit document |
| `UIDoc` | `UIDocument` | Active UI document |
| `UIApp` | `UIApplication` | Revit UI application |
| `ActiveView` | `View` | Currently active view |
| `Selection` | `List<Element>` | Currently selected elements |
| `Parameters` | `Dictionary<string, object>` | Script parameters from UI/agent |

---

## 🖨️ Output

| Function | Description |
| :--- | :--- |
| `Println(msg)` | Print message to console (supports `$""` interpolation) |
| `Print(msg)` | Alias for `Println` |
| *(last expression)* | Implicit output — last line's return value auto-prints |

---

## 🧠 Session Management (Memory)

| Command | Description |
| :--- | :--- |
| `list` or `vars` | Lists all active variables currently stored in the REPL memory |
| `clear vars` or `reset`| Wipes the session memory state (start fresh without restarting) |
| `inspect <varName>` | Prints a beautifully formatted JSON tree of a variable's properties |

---

## ✨ Element Discovery

```csharp
GetElements("Doors")              // Instances by category/family name
GetElements("DoorTypes")          // Types (append "Types" suffix)
GetElements<Wall>()               // Instances by C# class
GetElements<FamilyInstance>("Furniture")  // Class + category filter
GetElement("My Wall")             // Single element by name/identity
GetElement<Wall>("My Wall")       // Single typed element by name
GetMagicNames()                   // All targetable names
GetCategories()                   // All document categories
```

---

## 🪄 Parameter Accessors (Extension Methods on `Element`)

> [!IMPORTANT]
> Revit elements do NOT have direct `.Width`, `.Length`, `.Area` properties.
> Always use these accessors.

| Method | Returns | Use Case |
| :--- | :--- | :--- |
| `e.GetStr("Name")` | `string` | Smart string — resolves ElementId to Name |
| `e.GetVal("Name")` | `string` | WYSIWYG — exactly as in Properties palette |
| `e.GetNum("Name")` | `double` | Raw numeric in internal units (feet) |
| `e.GetNum("Name", "mm")` | `double` | Numeric in specified units |
| `e.GetInt("Name")` | `int` | Integer parameter value |

**Examples:**
```csharp
wall.GetNum("Length", "mm")        // → 5000.0
wall.GetStr("Base Constraint")     // → "Level 1" (not an ElementId)
wall.GetVal("Width")               // → "200.0 mm" (formatted)
room.GetNum("Area", "m2")          // → 25.5
```

---

## 📐 Unit Conversion

### Extension Methods (Primary API)
```csharp
2000.InputUnit("mm")               // mm → internal units (for filtering)
wall.GetNum("Length").OutputUnit("mm")        // internal → mm (for display)
wall.GetNum("Length").OutputUnit("mm", 4)     // with decimal precision
wall.GetNum("Length").FormatUnit("mm")        // → "5000.0 mm" (string)
```

### Backward Compatibility Aliases
| Alias | Canonical |
| :--- | :--- |
| `.ToUnits("u")` | `.InputUnit("u")` |
| `.FromUnits("u")` | `.OutputUnit("u")` |
| `.ToInternal("u")` | `.InputUnit("u")` |
| `.ToExternal("u")` | `.OutputUnit("u")` |

### Supported Units
| Type | Units |
| :--- | :--- |
| Length | `mm`, `cm`, `m`, `ft`, `in` |
| Area | `m2`, `sqm`, `ft2`, `sqft` |
| Volume | `m3`, `cum`, `ft3`, `cuft` |

---

## 📊 Visualization (Summary Tab)

All visualization functions accept **lazy projections** — pass `.Select()` directly, no `.ToList()` required.

| Function | Aliases | Data Shape |
| :--- | :--- | :--- |
| `Table(data)` | — | Any `IEnumerable`, projection, or elements |
| `BarChart(data)` | `ChartBar(data)` | `{ name, value }` |
| `PieChart(data)` | `ChartPie(data)` | `{ name, value }` |
| `LineChart(data)` | `ChartLine(data)`, `LineGraph(data)` | `{ name, value }` |
| `Select(elements)` | — | Selects + zooms in Revit |
| `Zoom(elements)` | — | Zooms view to fit elements |
| `Isolate(elements)` | — | Temporarily isolates in view |
| `Show(type, data)` | — | Low-level custom output |

### Magic Header Suffixes (Editable Tables)
Append `_unit`, `[unit]`, or `(unit)` to property names for unit-aware editing:
```csharp
Table(GetElements<Room>().Select(r => new {
    r.Id,
    r.Name,
    Area_m2 = r.GetNum("Area", "m2"),       // Header: "Area", editable in m²
    Perimeter_mm = r.GetNum("Perimeter", "mm") // Header: "Perimeter", editable in mm
}));
```

---

## 🛠️ Model Modification

### Transactions
```csharp
Transact("Edit Name", () => {
    // modify elements here
});

Transact("Edit Name", (doc) => {
    // 'doc' is the Document
});
```

### Watchdogs (Background Tasks)
```csharp
Watchdog(() => {
    // runs periodically while Revit is idle
    WatchdogReport("All good", "success");       // status: success/warning/error
    WatchdogReport("Problem!", "error", elements); // optional data
}, intervalSeconds: 5);
```

### Timeout
```csharp
SetExecutionTimeout(60); // default is 10 seconds
```

---

## 🧪 Common Patterns

### Filtering with Unit Comparison
```csharp
// Internal value vs. converted threshold
var short = GetElements<Wall>().Where(w => w.GetNum("Length") < 2000.InputUnit("mm"));

// Or compare in display units (both sides converted)
var short2 = GetElements<Wall>().Where(w => w.GetNum("Length", "mm") < 2000);
```

### Table with Projected Data
Lazy `.Select()` projections pass directly — the engine materializes them automatically:
```csharp
Table(GetElements<Wall>().Select(w => new {
    w.Id,
    w.Name,
    Width_mm = w.GetNum("Width", "mm"),
    Length_mm = w.GetNum("Length", "mm"),
    Level = w.GetStr("Base Constraint"),
    Comments = w.GetStr("Comments")
}));
```

### Chart from Grouped Data
```csharp
BarChart(GetElements<Wall>()
    .GroupBy(w => w.GetStr("Base Constraint"))
    .Select(g => new { name = g.Key, value = g.Count() }));
```

### Quick Audit
```csharp
GetElements<Level>()     // implicit output: prints all levels
```
