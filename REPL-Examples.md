# 🧪 Paracore REPL — Copy & Paste Snippet Library

Production-ready snippets you can paste directly into the **Workshop** tab. Every snippet solves a real Revit workflow problem.

---

## 🔍 Model Auditing & Quality Control

### 1. Full Project Element Census
Get an instant count of every category in the model — the first thing a BIM Manager runs on a new file.
```csharp
var census = GetElements()
    .Where(e => e.Category != null)
    .GroupBy(e => e.Category.Name)
    .Select(g => new { name = g.Key, value = g.Count() })
    .OrderByDescending(x => x.value);
Table(census);
BarChart(census.Take(20));
```

### 2. Find All Elements with Empty "Mark" Parameter
Missing Marks are a top-10 BIM coordination issue. Find them all, grouped by category.
```csharp
var unmarked = GetElements()
    .Where(e => e.Category != null && string.IsNullOrWhiteSpace(e.GetStr("Mark")))
    .GroupBy(e => e.Category.Name)
    .Select(g => new { Category = g.Key, Count = g.Count(), Elements = g.ToList() })
    .OrderByDescending(x => x.Count);
Table(unmarked.Select(x => new { x.Category, x.Count }));
Println($">>> Total unmarked elements: {unmarked.Sum(x => x.Count)}");
```

### 3. Detect Duplicate Room Numbers
Duplicate room numbers cause scheduling chaos. This finds them instantly.
```csharp
var dupes = GetElements<Room>().Where(r => r.Area > 0)
    .GroupBy(r => r.Number)
    .Where(g => g.Count() > 1)
    .SelectMany(g => g.Select(r => new {
        r.Id,
        r.Number,
        r.Name,
        Level = r.GetStr("Level"),
        Area_m2 = r.GetNum("Area", "m2")
    }));
if (dupes.Any()) {
    Println($"⚠ Found {dupes.Count()} rooms with duplicate numbers!");
    Table(dupes);
} else {
    Println("✓ No duplicate room numbers found.");
}
```

### 4. Find "Lost" Elements Far From Origin
Bad CAD imports often scatter elements thousands of meters from the origin. This finds them.
```csharp
var limit = 500.InputUnit("m");
var lost = GetElements().Where(e => {
    var pt = (e.Location as LocationPoint)?.Point;
    if (pt == null) {
        var crv = (e.Location as LocationCurve)?.Curve;
        pt = crv?.GetEndPoint(0);
    }
    return pt != null && (Math.Abs(pt.X) > limit || Math.Abs(pt.Y) > limit);
});
Println($"⚠ Found {lost.Count()} elements more than 500m from origin.");
Table(lost.Select(e => new { e.Id, e.Name, Category = e.Category?.Name }));
```

### 5. Ghost Element Detector (Zero Volume/Area)
Invisible zero-volume elements bloat the model, slow performance, and cause export errors.
```csharp
var ghosts = new[] { "Walls", "Floors", "Roofs", "Ceilings" }
    .SelectMany(cat => GetElements(cat))
    .Where(e => e.GetNum("Volume").AlmostZero() || e.GetNum("Area").AlmostZero())
    .Select(e => new { e.Id, e.Name, Category = e.Category?.Name,
        Volume = e.GetNum("Volume").FormatUnit("m3"),
        Area = e.GetNum("Area").FormatUnit("m2") });
Println($"⚠ Found {ghosts.Count()} ghost elements with zero volume or area.");
Table(ghosts);
```

---

## 📐 Architectural Workflows

### 6. Room Finish Schedule (Full Inventory)
Generate a complete room finish schedule — the kind you'd export to Excel for consultants.
```csharp
Table(GetElements<Room>().Where(r => r.Area > 0)
    .OrderBy(r => r.GetStr("Level")).ThenBy(r => r.Number)
    .Select(r => new {
        r.Id,
        r.Number,
        r.Name,
        Level = r.GetStr("Level"),
        Area_m2 = r.GetNum("Area", "m2"),
        Floor_Finish = r.GetStr("Floor Finish"),
        Wall_Finish = r.GetStr("Wall Finish"),
        Ceiling_Finish = r.GetStr("Ceiling Finish"),
        Base_Finish = r.GetStr("Base Finish")
    }));
```

### 7. Area Summary by Level (GFA Calculator)
Calculate the Gross Floor Area per level — a fundamental metric for architects and planners.
```csharp
var gfa = GetElements<Room>().Where(r => r.Area > 0)
    .GroupBy(r => r.GetStr("Level"))
    .Select(g => new {
        name = g.Key,
        value = Math.Round(g.Sum(r => r.GetNum("Area", "m2")), 2)
    })
    .OrderBy(x => x.name);
Table(gfa);
BarChart(gfa);
Println($">>> Total GFA: {gfa.Sum(x => x.value):F2} m²");
```

### 8. Door-to-Room Relationship Report
Which door belongs to which room? Essential for fire safety, security, and hardware schedules.
```csharp
Table(GetElements<FamilyInstance>("Doors").Select(d => {
    var fromRoom = d.FromRoom;
    var toRoom = d.ToRoom;
    return new {
        d.Id,
        Door = d.Name,
        Level = d.GetStr("Level"),
        From_Room = fromRoom != null ? $"{fromRoom.Number} - {fromRoom.Name}" : "—",
        To_Room = toRoom != null ? $"{toRoom.Number} - {toRoom.Name}" : "—",
        Width_mm = d.GetNum("Width", "mm"),
        Height_mm = d.GetNum("Height", "mm")
    };
}));
```

### 9. Unplaced Room & Unenclosed Room Finder
Unplaced rooms inflate schedules. Unenclosed rooms cause area miscalculations.
```csharp
var allRooms = GetElements<Room>();
var unplaced = allRooms.Where(r => r.Location == null);
var unenclosed = allRooms.Where(r => r.Location != null && r.Area <= 0);
var healthy = allRooms.Where(r => r.Area > 0);
Println($"✓ Healthy Rooms: {healthy.Count()}");
Println($"⚠ Unplaced Rooms: {unplaced.Count()}");
Println($"⚠ Unenclosed Rooms (Not Bounded): {unenclosed.Count()}");
if (unplaced.Any()) Table(unplaced.Select(r => new { r.Id, r.Number, r.Name, Status = "Unplaced" }));
if (unenclosed.Any()) Table(unenclosed.Select(r => new { r.Id, r.Number, r.Name,
    Level = r.GetStr("Level"), Status = "Not Enclosed" }));
```

---

## 🏗️ Structural & MEP Workflows

### 10. Wall Type Inventory (Quantities & Lengths)
How much of each wall type is in the project? Critical for cost estimation and material takeoff.
```csharp
var inventory = GetElements<Wall>()
    .GroupBy(w => w.Name)
    .Select(g => new {
        Wall_Type = g.Key,
        Count = g.Count(),
        Total_Length_m = Math.Round(g.Sum(w => w.GetNum("Length", "m")), 2),
        Total_Area_m2 = Math.Round(g.Sum(w => w.GetNum("Area", "m2")), 2)
    })
    .OrderByDescending(x => x.Total_Area_m2);
Table(inventory);
Println($">>> Total wall area in project: {inventory.Sum(x => x.Total_Area_m2):F2} m²");
```

### 11. Structural Column Schedule by Level
A quick structural audit: how many columns per level, and what types?
```csharp
var columns = GetElements("Structural Columns")
    .GroupBy(c => new { Level = c.GetStr("Base Level"), Type = c.Name })
    .Select(g => new {
        g.Key.Level,
        g.Key.Type,
        Count = g.Count()
    })
    .OrderBy(x => x.Level).ThenBy(x => x.Type);
Table(columns);
```

### 12. Floor Area & Volume Takeoff
Generate a material takeoff for all floors — useful for concrete quantity estimation.
```csharp
var floors = GetElements<Floor>()
    .Select(f => new {
        f.Id,
        Type = f.Name,
        Level = f.GetStr("Level"),
        Area_m2 = f.GetNum("Area", "m2"),
        Volume_m3 = f.GetNum("Volume", "m3"),
        Thickness_mm = f.GetNum("Thickness", "mm")
    })
    .OrderBy(x => x.Level);
Table(floors);
Println($">>> Total Floor Area: {floors.Sum(f => f.Area_m2):F2} m²");
Println($">>> Total Concrete Volume: {floors.Sum(f => f.Volume_m3):F3} m³");
```

---

## 🛠️ Batch Automation (Transactions)

### 13. Standardize Door "Mark" from Room Number
Auto-populate each door's Mark parameter based on its host room number — a common BIM requirement.
```csharp
Transact("Auto-Mark Doors", () => {
    var count = 0;
    foreach (var door in GetElements<FamilyInstance>("Doors")) {
        var room = door.FromRoom ?? door.ToRoom ?? door.Room;
        if (room != null) {
            var mark = $"D-{room.Number}-{++count % 100:D2}";
            door.LookupParameter("Mark")?.Set(mark);
        }
    }
    Println($"✓ Auto-marked {count} doors.");
});
```

### 14. Bulk Move Selection Up/Down
Move selected elements precisely in Z — the most common "Revit won't let me snap this" workaround.
```csharp
Transact("Move Up 300mm", () => {
    var offset = new XYZ(0, 0, 300.InputUnit("mm"));
    foreach (var e in Selection) ElementTransformUtils.MoveElement(Doc, e.Id, offset);
});
Println($"✓ Moved {Selection.Count} elements up by 300mm.");
```

### 15. Purge All "Comments" in Selection
Clear the Comments parameter on everything selected — useful before handing off to consultants.
```csharp
Transact("Purge Comments", () => {
    var count = 0;
    foreach (var e in Selection) {
        var p = e.LookupParameter("Comments");
        if (p != null && p.HasValue) { p.Set(""); count++; }
    }
    Println($"✓ Cleared Comments on {count} elements.");
});
```

### 16. Stamp All Sheets with Project Number
Write the project number into every sheet's description for consistent printing headers.
```csharp
var projectNumber = Doc.ProjectInformation.Number;
Transact($"Stamp Sheets: {projectNumber}", () => {
    var count = 0;
    foreach (var sheet in GetElements<ViewSheet>()) {
        var desc = sheet.GetStr("Sheet Issue Date");
        sheet.LookupParameter("Comments")?.Set($"Project: {projectNumber}");
        count++;
    }
    Println($"✓ Stamped {count} sheets with project number '{projectNumber}'.");
});
```

---

## 📊 Visualization & Dashboarding

### 17. Category Distribution (Pie Chart)
See what your model is made of at a glance — useful for file size audits.
```csharp
var distribution = GetElements()
    .Where(e => e.Category != null)
    .GroupBy(e => e.Category.Name)
    .Select(g => new { name = g.Key, value = g.Count() })
    .OrderByDescending(x => x.value)
    .Take(15);
PieChart(distribution);
```

### 18. Wall Lengths by Level (Stacked Report)
Compare wall quantities across levels — instantly shows where the heavy design work is.
```csharp
var report = GetElements<Wall>()
    .GroupBy(w => w.GetStr("Base Constraint"))
    .Select(g => new {
        name = g.Key,
        value = Math.Round(g.Sum(w => w.GetNum("Length", "m")), 1)
    })
    .OrderBy(x => x.name);
BarChart(report);
Table(report);
```

---

## ⚡ Power User One-Liners

### 19. Fluent Chains — Find, Review, Select
The fastest way to work: chain discovery → visualization → selection in one line.
```csharp
// Review all walls on "Level 1" and select them in Revit
GetElements<Wall>().Where(w => w.GetStr("Base Constraint") == "Level 1").Table().Select();

// Find rooms with area > 50 m² and zoom to them
GetElements<Room>().Where(r => r.GetNum("Area", "m2") > 50).Table().Zoom();

// Find and isolate all generic models with "TEMP" in Comments
GetElements("Generic Models").Where(e => e.GetStr("Comments").Contains("TEMP")).Isolate();

// Total length of all pipes in meters
Println($"Total pipe length: {GetElements("Pipes").SumParam("Length", "m").Round(2)} m");
```

### 20. Live Watchdog — Real-Time Selection Dashboard
Deploy a background monitor that continuously reports on your current selection as you work.
```csharp
Watchdog(() => {
    if (Selection.Count == 0) return;
    var categories = Selection.Where(e => e.Category != null)
        .GroupBy(e => e.Category.Name)
        .Select(g => $"{g.Key}: {g.Count()}");
    var totalArea = Selection.Sum(e => e.GetNum("Area", "m2"));
    var summary = string.Join(" | ", categories);
    var areaStr = totalArea > 0 ? $" | Area: {totalArea:F2} m²" : "";
    WatchdogReport($"{Selection.Count} selected → {summary}{areaStr}", "info");
}, intervalSeconds: 2);
```

---

> [!TIP]
> **All snippets use Paracore's unit-aware API.** Values like `GetNum("Length", "mm")` handle Revit's internal unit conversion automatically. No manual `* 304.8` math required.

> [!TIP]
> **IntelliSense in VSCode**: Open your scripts via the "Edit" button to see all available extension methods, `BuiltInParameter` enums, and Revit API classes with full documentation.
