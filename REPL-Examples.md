# 🧪 Paracore REPL Example Library

This file contains a collection of curated C# snippets designed for the Paracore REPL. You can copy and paste these directly into the **Workshop** tab to automate your Revit workflows in real-time.

---

## 📊 Data Visualization & Dashboarding
*Instantly render interactive charts in the **Summary** tab.*

### 1. Elements by Level (Bar Chart)
Visualize the distribution of walls across project levels.
```csharp
var data = GetElements<Wall>()
    .GroupBy(w => w.GetVal("Base Constraint") ?? "No Level")
    .Select(g => new { name = g.Key, value = g.Count() });
BarChart(data);
```

### 2. Room Function Distribution (Pie Chart)
See which room types occupy the most project area.
```csharp
var rooms = GetElements<Room>().Where(r => r.Area > 0);
var areaStats = rooms.GroupBy(r => r.Name)
    .Select(g => new { name = g.Key, value = g.Sum(r => r.Area.FromUnits("m2")) });
PieChart(areaStats);
```

### 3. Wall Width Profile (Line Chart)
Analyze variation in wall thicknesses across the project.
```csharp
var widths = GetElements<Wall>()
    .Select(w => new { name = w.Name, value = w.Width.FromUnits("mm") })
    .OrderBy(x => x.value);
LineChart(widths);
```

---

## 🔍 Auditing & Quality Control
*Identify project errors and ghost elements.*

### 4. Find Unplaced "Ghost" Rooms
List all rooms that exist in the schedule but haven't been placed in the model.
```csharp
var unplaced = GetElements<Room>().Where(r => r.Location == null);
Println($"Found {unplaced.Count()} unplaced rooms.");
Table(unplaced);
```

### 5. Selection Audit (Magic Tooltips)
Quickly calculate the total area or length of what you have currently selected in Revit.
```csharp
var totalM2 = Selection.OfType<Wall>().Sum(w => w.Area.FromUnits("m2"));
Println($">>> Total Selection Area: {totalM2:F2} m2");
```

### 6. Search for Nested Families
Find all instances of a specific family type across the entire project.
```csharp
var results = GetMagicNames().Where(n => n.Contains("Structure"));
Table(results);
```

---

## 🪄 Magic "Round-Trip" Editing
*Use **Magic Suffixes** to create editable tables with automatic unit conversion.*

### 7. Editable Room Inventory
Edit names, numbers, and finishes directly in the grid.
```csharp
Table(GetElements<Room>().Select(r => new {
    r.Id,
    r.Name,
    r.Number,
    Level = r.Level.Name,
    Base_Finish = r.GetStr("Base Finish"), // Custom parameter
    Area_m2 = r.Area.FromUnits("m2")       // Editable in Square Meters!
}));
```

### 8. Wall Instance Parameter Manager
Mass-edit comments or structural roles.
```csharp
Table(GetElements<Wall>().Select(w => new {
    w.Id,
    w.Name,
    Width_mm = w.Width.FromUnits("mm"),
    Comments = w.GetStr("Comments")
}));
```

---

## 🛠️ Batch Operations (Transactions)
*Modify hundreds of elements safely using the `Transact` block.*

### 9. Uppercase Sheet Names
Ensure project-wide naming standards for all sheets.
```csharp
Transact("Standardize Sheets", () => {
    foreach(var s in GetElements<ViewSheet>()) s.Name = s.Name.ToUpper();
});
```

### 10. Nudge Selection (Unit-Aware)
Move selected elements precisely using unit strings.
```csharp
Transact("Nudge Up", () => {
    var offset = new XYZ(0, 0, 500.ToUnits("mm"));
    foreach(var e in Selection) ElementTransformUtils.MoveElement(Doc, e.Id, offset);
});
```

### 11. Rename Room by Level
Prefix all room names with their level number.
```csharp
Transact("Smart Room Renaming", () => {
    foreach(var r in GetElements<Room>()) {
        r.Name = $"{r.Level.Name} - {r.Name}";
    }
});
```

---

## 🔬 Background BIM Watchdogs
*Register tasks that run silently while you work.*

### 12. Total Area Monitor
Watch the total area of your current selection update live in the status feed.
```csharp
Watchdog(() => {
    if (Selection.Count > 0) {
        var total = Selection.OfType<Wall>().Sum(w => w.Area.FromUnits("m2"));
        if (total > 0) WatchdogReport($"Live Area Calc: {total:F2} m2", "info");
    }
}, intervalSeconds: 2);
```

### 13. Thin Wall Warning
Get an alert if you or anyone else creates a wall thinner than 100mm.
```csharp
Watchdog(() => {
    var thin = GetElements<Wall>().Where(w => w.Width < 100.ToUnits("mm"));
    if (thin.Any()) {
        WatchdogReport($"Warning: {thin.Count()} walls are too thin!", "error", thin);
    }
}, intervalSeconds: 10);
```

---

## 💡 Quick Tips
- **Implicit Printing**: Type any variable name on the last line (e.g. `Doc.Title`) to see its value automatically.
- **Persistence**: Define a variable in one run (e.g. `var myWalls = GetElements<Wall>();`), and use it in the next run.
- **Magic Unit Filtering**: Use `.ToUnits("mm")` or `.FromUnits("m2")` to skip manual conversion math.
- **Identification**: Start your script with `/// My Audit` to label the turn in the console log.
