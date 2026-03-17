# 🧪 Paracore REPL Example Library

Copy and paste these directly into the **Workshop** tab to automate your Revit workflows in real-time.

---

## 💡 Core Concepts
*Understanding how to "talk" to Revit elements.*

### The "Cabinet & Drawer" Analogy
Think of a Revit Element as a filing cabinet:
*   **The Parameter Name** (e.g., `"Length"`) is the **Label** on the outside of the drawer.
*   **The Method** (e.g., `GetNum`) is the **Action** of opening that drawer.
*   **The Return Value** (e.g., `1500.0`) is the **Content** of the paper inside.

---

## 🔍 Element Discovery & Predicate Filtering
*Discover elements by class, category, and advanced LINQ conditions.*

### 1. Loadable Components (Family Instances & Symbols)
To get all instances or types of a specific loadable family category, pass the category name to `GetElements<>`:
```csharp
// Get all Door instances in the project
var doorInstances = GetElements<FamilyInstance>("Doors");
Println($"There are {doorInstances.Count} doors placed in the model.");

// Get all Door Types (Symbols) loaded in the project
var doorSymbols = GetElements<FamilySymbol>("Doors");
Println($"There are {doorSymbols.Count} door types loaded.");
```

---

## 🧐 API Snooping & Quick Inspection
*Deep-dive into element parameters, API properties, and geometry without writing complex queries.*

### 2. Snoop All Parameters (Properties Palette Style)
Quickly see every non-empty parameter of the first selected element.
```csharp
ListParams(Selection[0]);
```
*Tip: Also works with ElementIds: `ListParams(new ElementId(123456))`*

### 3. Snoop Standard API Properties
See Category, Level, Workset, Location, Owner, and other high-level API attributes in a table.
```csharp
ListProperties(Selection[0]);
```

### 4. Snoop Geometry Summary
Get a quick audit of an element's solids, total volume, and surface area.
```csharp
ListGeometry(Selection[0]);
```

### 5. Snoop Element Type Parameters
Navigate to the ElementType and list its parameters in one go.
```csharp
Table(Selection[0].TypeParams());
```

---

## 🚀 Advanced Real-World Recipes
*More complex scripts for BIM Management, Auditing, and Data Sync.*

### 6. Select "All Instances" of Same Type
Select one or more elements, and run this to find every other instance of that type in the model.
```csharp
var typeIds = Selection.Select(e => e.GetTypeId()).Distinct();
var similarElements = GetElements().Where(e => typeIds.Contains(e.GetTypeId()));
Select(similarElements);
Println($"Selected {similarElements.Count()} elements sharing the same types.");
```

### 7. Find "Lost" Elements (Far from Origin)
Identify elements placed more than 1000m from the Project Base Point (often caused by bad CAD imports).
```csharp
var limit = 1000.InputUnit("m");
var lostElements = GetElements().Where(e => {
    var pt = (e.Location as LocationPoint)?.Point;
    return pt != null && (Math.Abs(pt.X) > limit || Math.Abs(pt.Y) > limit);
});
Table(lostElements.Select(e => new { e.Id, e.Name, Category = e.Category?.Name }));
```

### 8. Efficiency Audit: Perimeter-to-Area Ratio
High ratios usually indicate complex, non-rectangular rooms which are more expensive to build/finish.
```csharp
var audit = GetElements<Room>().Where(r => r.Area > 0)
    .Select(r => new { 
        r.Id, 
        r.Name, 
        Ratio = r.Perimeter / r.Area, // (Internal Units)
        Area_m2 = r.GetNum("Area", "m2") 
    })
    .OrderByDescending(x => x.Ratio);
Table(audit);
```

### 9. Sync Data from Host (Room → Doors)
Copy the "Room Name" parameter to the "Comments" of every door hosted by that room.
```csharp
Transact("Sync Room to Door Comments", () => {
    var count = 0;
    foreach (var door in GetElements<FamilyInstance>("Doors")) {
        // Try to get the room the door is 'In'
        var room = door.Room ?? door.FromRoom ?? door.ToRoom;
        if (room != null) {
            door.LookupParameter("Comments")?.Set($"In Room: {room.Name}");
            count++;
        }
    }
    Println($"Updated {count} doors with room information.");
});
```

### 10. Bulk Isolate by Parameter Value
Quickly isolate all elements in the active view that have "Audit" in their Comments.
```csharp
var targetElements = GetElements().Where(e => e.GetStr("Comments").Contains("Audit"));
if (targetElements.Any()) {
    Isolate(targetElements);
    Zoom(targetElements);
} else {
    Println("No matching elements found.");
}
```

---

## 📊 Data Visualization & Dashboarding
*Render interactive charts in the **Summary** tab.*

### 11. Walls by Level (Bar Chart)
```csharp
var data = GetElements<Wall>()
    .GroupBy(w => w.GetStr("Base Constraint"))
    .Select(g => new { name = g.Key, value = g.Count() });
BarChart(data);
```

### 12. Room Function Distribution (Pie Chart)
```csharp
var rooms = GetElements<Room>().Where(r => r.GetNum("Area") > 0);
var stats = rooms.GroupBy(r => r.Name)
    .Select(g => new { name = g.Key, value = g.Sum(r => r.GetNum("Area", "m2")) });
PieChart(stats);
```

---

## 🔍 Auditing & Quality Control

### 13. Find Unplaced "Ghost" Rooms
```csharp
var unplaced = GetElements<Room>().Where(r => r.Location == null);
Println($"Found {unplaced.Count()} unplaced rooms.");
Table(unplaced);
```

### 14. Selection Area Audit
Calculate the total area of your current selection.
```csharp
var totalM2 = Selection.Sum(e => e.GetNum("Area", "m2"));
Println($">>> Total Selection Area: {totalM2:F2} m²");
```

---

## 🪄 Unit-Aware "Round-Trip" Editing Tables
*Use **Magic Header Suffixes** to create editable tables with automatic unit conversion.*

### 15. Editable Room Inventory
Edit names, numbers, and finishes directly in the grid.
```csharp
Table(GetElements<Room>().Select(r => new {
    r.Id,
    r.Name,
    r.Number,
    Level = r.GetStr("Level"),
    Base_Finish = r.GetStr("Base Finish"),
    Area_m2 = r.GetNum("Area", "m2")
}));
```

### 16. Wall Instance Parameter Manager
Mass-edit comments or review thicknesses.
```csharp
Table(GetElements<Wall>().Select(w => new {
    w.Id,
    w.Name,
    Width_mm = w.GetNum("Width", "mm"),
    Length_mm = w.GetNum("Length", "mm"),
    Comments = w.GetStr("Comments")
}));
```

---

## 🛠️ Batch Operations (Transactions)

### 17. Uppercase Sheet Names
```csharp
Transact("Standardize Sheets", () => {
    foreach(var s in GetElements<ViewSheet>()) s.Name = s.Name.ToUpper();
});
```

### 18. Nudge Selection (Unit-Aware)
Move selected elements precisely using unit strings.
```csharp
Transact("Nudge Up", () => {
    var offset = new XYZ(0, 0, 500.InputUnit("mm"));
    foreach(var e in Selection) ElementTransformUtils.MoveElement(Doc, e.Id, offset);
});
```

---

## 🔬 Background BIM Watchdogs

### 19. Live Area Monitor
Watch the total area of your selection update in real-time.
```csharp
Watchdog(() => {
    if (Selection.Count > 0) {
        var total = Selection.Sum(e => e.GetNum("Area", "m2"));
        if (total > 0) WatchdogReport($"Live Area: {total:F2} m²", "info");
    }
}, intervalSeconds: 2);
```

### 20. Short Wall Warning
Get an alert if any wall is shorter than 1 meter.
```csharp
Watchdog(() => {
    var shortWalls = GetElements<Wall>().Where(w => w.GetNum("Length", "mm") < 1000);
    if (shortWalls.Any()) {
        WatchdogReport($"Warning: {shortWalls.Count()} walls are too short!", "error", shortWalls);
    }
}, intervalSeconds: 10);
```

---

## 💡 Quick Tips
- **Implicit Printing**: Type any expression on the last line (e.g. `Doc.Title`) to see its value.
- **Persistence**: Variables stay alive between runs. Use `list` to see them.
- **No Direct Properties**: `Wall` has no `.Length`. Use `GetNum("Length")`.
- **Magic Suffixes**: `Area_m2`, `Width[mm]` in Table projections enable unit-aware editing.
- **Smart IDs**: `GetStr("Level")` returns `"Level 1"` instead of an ElementId number.
