# 🧪 Paracore REPL Example Library

Copy and paste these directly into the **Workshop** tab to automate your Revit workflows in real-time.

---

## 📊 Data Visualization & Dashboarding
*Render interactive charts in the **Summary** tab.*

### 1. Walls by Level (Bar Chart)
```csharp
var data = GetElements<Wall>()
    .GroupBy(w => w.GetStr("Base Constraint"))
    .Select(g => new { name = g.Key, value = g.Count() });
BarChart(data);
```

### 2. Room Function Distribution (Pie Chart)
```csharp
var rooms = GetElements<Room>().Where(r => r.GetNum("Area") > 0);
var stats = rooms.GroupBy(r => r.Name)
    .Select(g => new { name = g.Key, value = g.Sum(r => r.GetNum("Area", "m2")) });
PieChart(stats);
```

### 3. Wall Length Profile (Line Chart)
```csharp
var lengths = GetElements<Wall>()
    .Select(w => new { name = w.Name, value = w.GetNum("Length", "mm") })
    .OrderBy(x => x.value);
LineChart(lengths);
```

---

## 🔍 Auditing & Quality Control

### 4. Find Unplaced "Ghost" Rooms
```csharp
var unplaced = GetElements<Room>().Where(r => r.Location == null);
Println($"Found {unplaced.Count()} unplaced rooms.");
Table(unplaced);
```

### 5. Selection Area Audit
Calculate the total area of your current selection.
```csharp
var totalM2 = Selection.Sum(e => e.GetNum("Area", "m2"));
Println($">>> Total Selection Area: {totalM2:F2} m²");
```

### 6. Find Short Walls
Lazy `.Select()` projections pass directly to `Table()` — no `.ToList()` needed:
```csharp
var shortWalls = GetElements<Wall>().Where(w => w.GetNum("Length", "mm") < 2000);
Println($"Found {shortWalls.Count()} walls shorter than 2m.");
Table(shortWalls.Select(w => new {
    w.Id,
    w.Name,
    Length_mm = w.GetNum("Length", "mm"),
    Level = w.GetStr("Base Constraint")
}));
```

### 7. Search for Magic Names
Discover all available category & family names that contain a keyword.
```csharp
var results = GetMagicNames().Where(n => n.Contains("Structure"));
Table(results);
```

---

## 🪄 Unit-Aware "Round-Trip" Editing Tables
*Use **Magic Header Suffixes** to create editable tables with automatic unit conversion.*

### 8. Editable Room Inventory
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

### 9. Wall Instance Parameter Manager
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

### 10. Uppercase Sheet Names
```csharp
Transact("Standardize Sheets", () => {
    foreach(var s in GetElements<ViewSheet>()) s.Name = s.Name.ToUpper();
});
```

### 11. Nudge Selection (Unit-Aware)
Move selected elements precisely using unit strings.
```csharp
Transact("Nudge Up", () => {
    var offset = new XYZ(0, 0, 500.InputUnit("mm"));
    foreach(var e in Selection) ElementTransformUtils.MoveElement(Doc, e.Id, offset);
});
```

### 12. Rename Rooms by Level
Prefix all room names with their level name.
```csharp
Transact("Smart Room Renaming", () => {
    foreach(var r in GetElements<Room>()) {
        r.Name = $"{r.GetStr("Level")} - {r.Name}";
    }
});
```

### 13. Set Comments on All Doors
```csharp
Transact("Tag Doors", () => {
    foreach (var d in GetElements("Doors")) {
        d.LookupParameter("Comments")?.Set("Audit Verified");
    }
});
```

---

## 🔬 Background BIM Watchdogs

### 14. Live Area Monitor
Watch the total area of your selection update in real-time.
```csharp
Watchdog(() => {
    if (Selection.Count > 0) {
        var total = Selection.Sum(e => e.GetNum("Area", "m2"));
        if (total > 0) WatchdogReport($"Live Area: {total:F2} m²", "info");
    }
}, intervalSeconds: 2);
```

### 15. Short Wall Warning
Get an alert if any wall is shorter than 1 meter.
```csharp
Watchdog(() => {
    var shortWalls = GetElements<Wall>().Where(w => w.GetNum("Length") < 1000.InputUnit("mm"));
    if (shortWalls.Any()) {
        WatchdogReport($"Warning: {shortWalls.Count()} walls are too short!", "error", shortWalls);
    }
}, intervalSeconds: 10);
```

---

## 🪄 Parameter Accessor Patterns
*The right way to access parameters — these methods handle IDs, units, and fallbacks automatically.*

### 16. Smart Level & Type Auditing
In the raw Revit API, the "Level" parameter returns an ElementId. `GetStr` automatically resolves this to the Level Name.
```csharp
Table(GetElements<Room>().Select(rm => new {
    rm.Id,
    rm.Name,
    Level = rm.GetStr("Level"),       // Returns "Level 1" (not an ID)
    Type = rm.GetStr("Type"),         // Returns the Type Name
    Area_m2 = rm.GetNum("Area", "m2")
}));
```

### 17. The WYSIWYG Table
Use `GetVal` to get the exact formatted string you see in the Revit Properties palette, including unit symbols.
```csharp
Table(GetElements<Wall>().Select(w => new {
    w.Id,
    w.Name,
    Width = w.GetVal("Width"),     // Returns "200.0 mm" (as in Properties palette)
    Volume = w.GetVal("Volume"),   // Returns "1.25 m³"
    Length = w.GetVal("Length")     // Returns "5000 mm"
}));
```

### 18. Numeric vs. String Accessors Compared
```csharp
var wall = GetElements<Wall>().First();

// GetNum → raw double (internal units: feet)
Println($"Length (internal): {wall.GetNum("Length")}");

// GetNum with unit → converted double
Println($"Length (mm): {wall.GetNum("Length", "mm")}");

// GetStr → smart formatted string
Println($"Base Constraint: {wall.GetStr("Base Constraint")}");

// GetVal → WYSIWYG (as in Revit UI)
Println($"Length (formatted): {wall.GetVal("Length")}");

// GetInt → integer parameter
Println($"Structural: {wall.GetInt("Structural")}");
```

---

## ⚙️ Unit Conversion Patterns

### 19. Filtering with Unit Conversion
```csharp
// Find rooms smaller than 10 m²
var smallRooms = GetElements<Room>().Where(r => r.GetNum("Area") < 10.InputUnit("m2"));

// Find walls shorter than 2 meters
var shortWalls = GetElements<Wall>().Where(w => w.GetNum("Length") < 2000.InputUnit("mm"));
```

### 20. Output Formatting
```csharp
var wall = GetElements<Wall>().First();

// Convert internal value to display units
var lengthMm = wall.GetNum("Length").OutputUnit("mm");
Println($"Wall length: {lengthMm} mm");

// Or use the shorthand (GetNum with unit does the same thing)
Println($"Wall length: {wall.GetNum("Length", "mm")} mm");

// FormatUnit returns a string with units
var formatted = wall.GetNum("Length").FormatUnit("mm");
Println($"Wall length: {formatted}");  // "5000.0 mm"
```

---

## 💡 Quick Tips
- **Session Memory**: Variables stay alive between runs. Use `list` to see them, `inspect <name>` to view their JSON properties, and `clear vars` to wipe the slate clean.
- **Implicit Printing**: Type any expression on the last line (e.g. `Doc.Title`) to see its value.
- **Persistence**: Define a variable in one run, use it in the next run within the same session.
- **No Direct Properties**: `Wall` has no `.Length`, `.Width`, `.Area`. Use `GetNum("Length")` etc.
- **Lazy Projections**: `.Select()` results pass directly to `Table()`, `BarChart()`, etc. — no `.ToList()` needed.
- **Labels**: `/// My Label` at the top of your code names the execution turn in the console.
- **Magic Suffixes**: `Area_m2`, `Width[mm]` in Table projections enable unit-aware editing.
- **Smart IDs**: `GetStr("Level")` returns `"Level 1"` instead of an ElementId number.
