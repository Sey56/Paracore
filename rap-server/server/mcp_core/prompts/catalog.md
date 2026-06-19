# Complete Method Catalog

## Parameters & Units

```
el.GetStr(name) / GetStr(name, unit, dec)
el.GetNum(name, unit, dec)
el.GetVal(name)
el.GetInt(name)
```

These auto-resolve: Instance → Type → Type Parameter. Just use them — no need to
know the scope. Only use GetTypeStr/GetTypeNum if you specifically need Type-only lookup.

**Unit conversion:** `value.OutputUnit("m2", 2)` converts internal feet to target unit.

**Unit strings:** `"m" "cm" "mm" "ft" "in"` | `"m2" "sqm" "ft2" "sqft"` | `"m3" "cum" "ft3" "cuft"`

**BANNED:** OutputUnit.SquareMeters, "Square Meters", "Cubic Meters", UnitType.UT_Area

**BANNED:** Manual unit conversion. NEVER convert cm→ft or mm→m yourself.
ALWAYS pass the unit as the last argument: `.SetNum("Offset", -150, "cm")`
The engine handles conversion. Wrong: `.SetNum("Offset", -1.5)`  // what unit is this?

## Type-Level & Write

```
el.GetTypeStr/Num/Val/Int(name, unit, dec)  — force Type-only (skip Instance). Rarely needed.
el.GetElementType()
el.SetVal(name, val)  el.SetVal(name, val, unit)  el.SetNum(name, val, unit)
el.Delete() [BIM-safe]  el.Hide()  el.Unhide()  el.Isolate()
```

## Identity & Orientation

```
el.FamilyName()  el.Matches(pattern)  id.ToElement(Doc)
fi.RoomAccess/From/Destination/To()  fi.Handing()→LH/RH  fi.HingeSide()→Left/Right
fi.IsHandFlipped()  fi.IsFacingFlipped()  fi.IsStandardDoor()
```

## Native Properties (dot access, not GetStr)

These are C# properties on Element — use dot notation, not .GetStr():
```
el.Id          → ElementId      el.Name        → string (type name on instances)
el.Symbol      → ElementId      el.Location    → Location (Point or Curve)
el.Area        → double (feet)  el.Volume      → double (feet³)

// Location — for point-based elements (columns, doors, furniture):
el.Location.Point     → XYZ point
el.Location.Point.X   → double (X coordinate in feet)
el.Location.Point.Y   → double (Y coordinate in feet)
el.Location.Point.Z   → double (Z coordinate in feet)

// For curve-based elements (walls, beams, ducts):
el.Location.Curve      → Curve
```

## Discovery & Debug

```
el.CombinedParams().Table()   — PRIMARY: Native+Instance+Type params (Scope|Name|Storage|Value). ZERO ARGS.
  Native properties → use dot accessor: rm.Area.OutputUnit("m2") — no GetStr/GetNum needed.
  Instance/Type params → use GetStr("Name") or GetNum("Name", "unit").
el.Peek()  el.BuiltInParams()  el.InstanceParams()  el.TypeParams()
el.NativeProperties()  el.ParamsDict()  el.GeometrySummary().Table()
el.ReflectionProperties()  el.ReflectionMethods()
```

## Creating Elements — Raw Revit API + Transact()

Full access to Autodesk.Revit.DB everywhere.
XYZ, Line.CreateBound, Arc.Create, CurveLoop, Wall.Create, FamilyInstance.Create, etc. all work.
Transact() REQUIRED for manual foreach and raw API writes — gives one clean undo entry.

```csharp
// Wall
var lvl = GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1");
var typ = GetElements<WallType>().FirstOrDefault(t => t.Name == "Generic - 200mm");
XYZ p1 = new XYZ(0, 0, 0), p2 = new XYZ(5000.InputUnit("mm"), 0, 0);
Transact("Create Wall", () => {
    Wall w = Wall.Create(Doc, Line.CreateBound(p1, p2), lvl.Id, false);
    w.WallType = typ;
});

// Floor
var floorType = GetElements<FloorType>().FirstOrDefault();
var profile = new CurveLoop();
profile.Append(Line.CreateBound(new XYZ(0,0,0), new XYZ(5,0,0)));
profile.Append(Line.CreateBound(new XYZ(5,0,0), new XYZ(5,4,0)));
profile.Append(Line.CreateBound(new XYZ(5,4,0), new XYZ(0,4,0)));
profile.Append(Line.CreateBound(new XYZ(0,4,0), new XYZ(0,0,0)));
Transact("Create Floor", () =>
    Floor.Create(Doc, new List<CurveLoop>{profile}, floorType.Id, lvl.Id));

// Family instance (door, window, furniture)
var symbol = GetElements<FamilySymbol>("Desk").FirstOrDefault();
var point = new XYZ(2000.InputUnit("mm"), 3000.InputUnit("mm"), 0);
Transact("Place Family", () =>
    Doc.Create.NewFamilyInstance(point, symbol, lvl, StructuralType.NonStructural));

// Column
var colType = GetElements<FamilySymbol>("Concrete-Rectangular-Column").FirstOrDefault();
Transact("Place Column", () => {
    var col = Doc.Create.NewFamilyInstance(point, colType, lvl, StructuralType.Column);
    col.SetVal("Base Level", "Level 1");
    col.SetVal("Top Level", "Level 2");
});
```

## Collection: Filter & Sort

```
.WhereParam("Name", "value")
.WhereParam("Name", "starts", "D-10")
.WhereParam("Name", "!=", "X")
.WhereParam("Name", 200, "mm")
.WhereParam("Name", ">", 25, "m2")
.WhereMatches("pattern")
.StandardDoor()
.OrderByParam("Name")
.OrderByParamDesc("Name")
```

## Collection: Group, Write, UI

```
.GroupByParam(groupBy) → Group|Count table (counts elements per group)
.GroupByParam(groupBy, sumParam, unit) → Group|Count|Total (sums sumParam per group)
  e.g. GetElements("Rooms").GroupByParam("Level", "Area", "m2")
  Groups rooms by Level, sums Area in m² → Group, Count, Total columns

  ⚠️  GroupByParam works ONLY with STRING parameter names. It calls .GetStr()
  internally. For native properties (Location, Area, Volume) or computed values
  (coordinates), use LINQ .GroupBy(lambda) instead — it falls under "Allowed LINQ".
  
  ⚠️  GroupByParam returns GROUPED DATA, not elements. You CANNOT chain
  .Where(), .Select(), .Count(), or .Peek() after it. Only chain .Table(),
  .BarGraph(), .PieGraph(), or .LineGraph() directly.

.SumParam("Name", "m2")
.SetParam("Comments","Done") [bulk, 1 txn]
.Delete() [BIM-safe bulk]
.Hide()  .Unhide()  .Isolate()
```

## Visualization

```
.Table()  .BarGraph()  .PieGraph()  .LineGraph()  .Show()
```

### .Table() — When It's Safe

`.Table()` renders data as an interactive grid. But what comes BEFORE it determines
whether the output is useful or a disaster.

**SAFE — always works (fixed columns):**
```
.CombinedParams().Table()           → 4 cols: Scope | Name | Storage | Value
.GroupByParam("X").Table()          → 2 cols: Group | Count
.GroupByParam("X", "Sum", "u").Table() → 3 cols: Group | Count | Total
.Select(e => new { ... }).Table()   → You chose the columns, so it's safe
```

**FORBIDDEN — dumps every parameter as a column header (50-200 columns):**
```
GetElements("Walls").Table()            → 78+ columns × 593 rows = disaster
GetElements("Doors").Table()            → same — every parameter is a column
.WhereParam(...).Table()                → same — filtered but still all columns
.SetParam(...).Table()                  → same — after write, still all columns
```

**Rule:** If the thing before `.Table()` is NOT CombinedParams, GroupByParam, or
Select with explicit columns, the result will have 50-200 columns and be unusable.
ALWAYS use `.Select()` to pick specific columns before `.Table()`.

**COLUMN NAMES = EXACT PARAMETER NAMES.** The table viewer uses column headers
to match Revit parameters for single-cell editing and mass-edit. If the header
doesn't match the parameter name exactly, editing breaks.

**Spaces → Underscores:** C# can't have spaces in identifiers. Replace spaces
with underscores. The table renderer converts underscores BACK to spaces in the
displayed header, so the header matches the parameter name exactly.

- CORRECT: `Base_Constraint = w.GetStr("Base Constraint")`  → displays as "Base Constraint"
- CORRECT: `Top_Offset = w.GetNum("Top Offset", "cm")`      → displays as "Top Offset"
- CORRECT: `Area = r.GetNum("Area", "m2")`                 → displays as "Area"
- CORRECT: `Volume = el.GetNum("Volume", "m3")`             → displays as "Volume"

- WRONG:   `Top_Offset_cm = w.GetNum("Top Offset", "cm")`   → "Top Offset cm" ≠ "Top Offset"
- WRONG:   `Area_m2 = r.GetNum("Area", "m2")`               → "Area m2" ≠ "Area"
- WRONG:   `BaseLevel = w.GetStr("Base Constraint")`        → "BaseLevel" ≠ "Base Constraint"

**CHARTS** after GroupByParam: chain directly, no `.Select()`:
`GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph()`

## Materials & Numeric Helpers

```
el.Materials()  el.MaterialNames()
value.InputUnit("mm")  .OutputUnit("m2")  .RoundTo("mm",0)
.IsAlmostEqualTo(v)  .AlmostZero()  .IsGreaterThan(v)  .IsLessThan(v)
.IsPositive()  .IsNegative()
```

## Raw Revit API

You have FULL access to the entire Revit API — this is a real C# REPL, not a limited DSL.
Available namespaces: Autodesk.Revit.DB, Autodesk.Revit.UI, Autodesk.Revit.DB.Architecture, etc.

Use raw Revit API for:
- Element creation (Wall.Create, Floor.Create, FamilyInstance placement)
- Advanced geometry (Line.CreateBound, XYZ, CurveLoop, Arc.Create)
- Any operation the Paracore extensions cannot express

PARAMETER ACCESS is the ONE area where you should ALWAYS prefer Paracore extensions
(.GetStr, .GetNum, .SetVal, .SetNum) over raw API (LookupParameter, get_Parameter) —
the extensions handle name resolution, unit conversion, and ElementId→name automatically.

## Banned Patterns

**Parameter access:** Use `.GetStr()`, `.GetNum()`, `.GetVal()` instead of LookupParameter,
get_Parameter, .AsString(), .AsDouble(), BuiltInParameter.

**Units:** Use unit strings: `.SetNum("Offset", -150, "cm")`, `.GetNum("Area", "m2")`
BANNED: UnitType.SquareMeters, UnitType.UT_Area, OutputUnit.SquareMeters, "Square Meters", "Cubic Meters"

**Filtering/Sorting:** Use `.WhereParam()` instead of `.Where(e => e.Property)`,
`.OrderByParam()` instead of `.OrderBy()`, `.GroupByParam()` instead of `.GroupBy(e => ...).Select(g => ...)`,
`.SumParam()` instead of `.Sum(e => e.GetNum(...))`.

**Display:** Use `.Table()` for data, `Println()` for status messages only.
NEVER foreach+Println loops, NEVER string.Join for element Ids.

**Note:** FilteredElementCollector, XYZ, Line.CreateBound, Wall.Create, ElementId, etc.
are FULLY AVAILABLE everywhere. Use them for creation, geometry, and advanced queries.
