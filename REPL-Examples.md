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

## 🧐 API Peeking & Quick Inspection
*Deep-dive into element parameters, API properties, and geometry without writing complex queries.*

### 2. Peek All Parameters (Properties Palette Style)
Quickly see every non-empty parameter of the first selected element.
```csharp
ListParams(Selection[0]);
```
*Tip: Also works with ElementIds: `ListParams(new ElementId(123456))`*

### 3. Peek Standard API Properties
See Category, Level, Workset, Location, Owner, and other high-level API attributes in a table.
```csharp
ListProperties(Selection[0]);
```

### 4. Peek Geometry Summary
Get a quick audit of an element's solids, total volume, and surface area.
```csharp
ListGeometry(Selection[0]);
```

### 5. Peek Element Type Parameters
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

## ⚖️ Precision & Comparison
*Handling floating-point noise and unit-aware math.*

### 21. Find Precise Lengths (Fuzzy Equality)
Filter elements by a specific dimension while ignoring Revit's "floating-point noise" (e.g. `1.99999999`).
```csharp
var target = 1500.InputUnit("mm");
var walls = GetElements<Wall>().Where(w => w.GetNum("Length").IsAlmostEqualTo(target));
Println($"Found {walls.Count()} walls that are almost exactly 1500mm long.");
```

### 22. Rounding Internal Units
Snap an internal Revit value (feet) to match the precision of a specific human unit.
```csharp
var wall = Selection[0];
var raw = wall.GetNum("Length");
var rounded = raw.RoundTo("mm"); // Result is internal value snapped to closest mm point
Println($"Raw: {raw} | Rounded to MM: {rounded}");
```

### 23. Identify "Ghost" Geometry
Identify elements with nearly zero volume or area that might cause model errors.
```csharp
var limit = 0.001.InputUnit("mm3"); // Practically zero
var ghostWalls = GetElements<Wall>().Where(w => w.GetNum("Volume").IsLess(limit) && w.GetNum("Volume").IsPositive());
Table(ghostWalls.Select(w => new { w.Id, w.Name, Volume = w.GetNum("Volume") }));
```

### 24. Nested Geometry Explorer (Recursive)
Extract solids from FamilyInstances, including any nested families (e.g., furniture parts).
```csharp
void GetAllSolids(GeometryElement geo, List<Solid> results) {
    if (geo == null) return;
    foreach (var obj in geo) {
        if (obj is Solid s && s.Volume > 0.001) results.Add(s);
        else if (obj is GeometryInstance inst) GetAllSolids(inst.GetInstanceGeometry(), results);
    }
}

var solids = new List<Solid>();
var opt = new Options { DetailLevel = ViewDetailLevel.Fine };
GetAllSolids(Selection[0].get_Geometry(opt), solids);

Table(solids.Select((s, i) => new { 
    Part = $"Part {i+1}", 
    Volume_m3 = s.Volume.OutputUnit("m3"), 
    FaceCount = s.Faces.Size 
}));
```

### 25. CAD / ImportInstance Data Extraction
Explore the difference between **Symbol** (Local) and **Instance** (Project) geometry in CAD links.
```csharp
var cad = GetElements<ImportInstance>().FirstOrDefault();
if (cad == null) return;

var opt = new Options { DetailLevel = ViewDetailLevel.Fine };
var geo = cad.get_Geometry(opt).First() as GeometryInstance;

// Symbol: Raw data as defined in the CAD file (Local)
var localSolids = new List<Solid>();
foreach(var obj in geo.GetSymbolGeometry()) if(obj is Solid s) localSolids.Add(s);

// Instance: Data as it appears in Revit (Project Transformed)
var projectSolids = new List<Solid>();
foreach(var obj in geo.GetInstanceGeometry()) if(obj is Solid s) projectSolids.Add(s);

Println($"Symbol Solid Count: {localSolids.Count}");
Println($"Instance Solid Count: {projectSolids.Count}");
if (projectSolids.Any()) {
    var p0 = projectSolids[0].ComputeCentroid();
    Println($"First Part is located at (Project): {p0.X:F2}, {p0.Y:F2}, {p0.Z:F2}");
}
```

### 26. The Diagnostic Peek
Use `Peek()` to solve the "Why is my filter not working?" mystery by seeing exactly what the engine sees.

```csharp
// Select a wall first
Peek(Selection[0]); 

// Or snoop multiple things
Peek(GetElements<Wall>().Take(5));
```

### 27. Direct Parameter Injection (SetNum)
Move elements or update data using human units without caring about transactions.

```csharp
var walls = GetElements<Wall>();
Transact("Bulk Offset", () => {
    foreach(var w in walls) {
        w.SetNum("Base Offset", 500, "mm");
    }
});
```
*(Note: SetNum automatically identifies BuiltInParameters too!)*

### 28. The Universal Geometry Unpacker
A robust pattern to extract **all** geometry objects (Solids, Lines, PolyLines, etc.) from any element, no matter how deeply nested.
```csharp
void Unpack(GeometryObject obj, List<GeometryObject> results) {
    if (obj is Solid s && s.Volume > 0.001) results.Add(s);
    else if (obj is Curve curve) results.Add(curve);
    else if (obj is PolyLine p) results.Add(p);
    else if (obj is GeometryInstance inst) {
        foreach (var subObj in inst.GetInstanceGeometry()) Unpack(subObj, results);
    }
}

var allParts = new List<GeometryObject>();
var opt = new Options { DetailLevel = ViewDetailLevel.Fine };
var rootGeo = Selection[0].get_Geometry(opt);

foreach (var obj in rootGeo) Unpack(obj, allParts);

Table(allParts.Select(p => new { 
    Type = p.GetType().Name,
    Description = p is Solid s ? $"Volume: {s.Volume.OutputUnit("m3"):F3} m³" : 
                  p is Curve c ? $"Length: {c.Length.OutputUnit("mm"):F1} mm" : 
                  "Other"
}));
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
 
---
 
## 🎯 REPL Mastery: Unit-Aware Logic
*How to write professional-grade Revit automation using the latest helpers.*
 
### 29. The "Golden Filter" Pattern
Don't use `==` for wall lengths. Use `.IsAlmostEqualTo()` with internal units.
```csharp
// WRONG (Fragile):
// var bad = GetElements<Wall>().Where(w => w.GetNum("Length") == 1500.InputUnit("mm")); 
 
// RIGHT (Robust):
var target = 1500.InputUnit("mm");
var walls = GetElements<Wall>().Where(w => w.GetNum("Length").IsAlmostEqualTo(target));
```
 
### 30. Unit Transitioning (Read → Logic → Display)
```csharp
var wall = Selection[0];
 
// 1. Read to internal (for Revit math)
var internalLen = wall.GetNum("Length"); 
 
// 2. Log in human units (for easy debugging)
Println($"Debug: Length is {internalLen.OutputUnit("mm"):F0} mm");
 
// 3. Write back with automatic conversion
Transact("Update", () => wall.SetNum("Base Offset", 200, "mm"));
```
 
### 31. Peek vs Table (The Diagnostic Choice)
- Use `Peek(e)` when you want to **find the right "drawer name"** (BuiltInParameter vs. Display Name).
- Use `Table(e.AllParams())` when you want to **share/export a report** of the current state.
 
---
 
> [!TIP]
> **IntelliSense in VSCode**: If you open your scripts in VSCode via the "Edit" button, you can see all available extension methods and `BuiltInParameter` enums with full documentation!
