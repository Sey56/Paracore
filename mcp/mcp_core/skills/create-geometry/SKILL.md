---
name: create-geometry
description: Creating Revit elements — Wall.Create, Floor.Create, FamilyInstance placement, XYZ, CurveLoop, Transact
---

# Create & Geometry

Create new Revit elements using the raw Revit API. Full access to `Autodesk.Revit.DB` — this is a real C# REPL, not a limited DSL. `Transact()` REQUIRED for all creation.

⚠ **This page is the single-element reference.** For a whole **building** — levels, plan views,
slabs, walls, openings, rooms, per level — the build order, the traps and the verification
recipes live in the modelling skill: `project-modeling` (**`paracore-model`**) or
`family-authoring` (**`paracore-family`**). This page shows the core creation calls; those show
the building. ⚠ Do **not** build a building out of a `Form`: a `Form` cannot become a room.
Family (`.rfa`) authoring and conceptual massing belong to the **`paracore-family`** MCP.

## Core Types (pre-imported, no using needed)

```
XYZ                        → 3D point
Line.CreateBound(p1, p2)   → straight line segment
Arc.Create(...)             → arc
CurveLoop                   → closed loop of curves for floors/openings
ElementId                   → Revit element ID
```

## Wall Creation

```csharp
var lvl = GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1");
var typ = GetElements<WallType>().FirstOrDefault(t => t.Name == "Generic - 200mm");
XYZ p1 = new XYZ(0, 0, 0);
XYZ p2 = new XYZ(5000.InputUnit("mm"), 0, 0);
Transact("Create Wall", () => {
    Wall w = Wall.Create(Doc, Line.CreateBound(p1, p2), lvl.Id, false);
    w.WallType = typ;
});
```

## Floor Creation

```csharp
var floorType = GetElements<FloorType>().FirstOrDefault();
var profile = new CurveLoop();
profile.Append(Line.CreateBound(new XYZ(0,0,0), new XYZ(5,0,0)));
profile.Append(Line.CreateBound(new XYZ(5,0,0), new XYZ(5,4,0)));
profile.Append(Line.CreateBound(new XYZ(5,4,0), new XYZ(0,4,0)));
profile.Append(Line.CreateBound(new XYZ(0,4,0), new XYZ(0,0,0)));
Transact("Create Floor", () =>
    Floor.Create(Doc, new List<CurveLoop>{profile}, floorType.Id, lvl.Id));
```

## Family Instance Placement (doors, windows, furniture)

```csharp
var symbol = GetElements<FamilySymbol>("Desk").FirstOrDefault();
var point = new XYZ(2000.InputUnit("mm"), 3000.InputUnit("mm"), 0);
Transact("Place Family", () =>
    Doc.Create.NewFamilyInstance(point, symbol, lvl, StructuralType.NonStructural));
```

## Column Placement

```csharp
var colType = GetElements<FamilySymbol>("Concrete-Rectangular-Column").FirstOrDefault();
Transact("Place Column", () => {
    var col = Doc.Create.NewFamilyInstance(point, colType, lvl, StructuralType.Column);
    col.SetVal("Base Level", "Level 1");
    col.SetVal("Top Level", "Level 2");
});
```

## Unit Input — converting human units to internal feet

```csharp
5000.InputUnit("mm")     // 16.404 (feet)
150.InputUnit("mm")      // 0.492
3.0.InputUnit("m")       // 9.843
```

**NEVER** hardcode conversion math (`/304.8`, `*0.3048`). Always use `.InputUnit()`.

## Available Namespaces (all pre-imported)

```
Autodesk.Revit.DB, Autodesk.Revit.DB.Architecture
Autodesk.Revit.DB.Structure, Autodesk.Revit.DB.Mechanical
Autodesk.Revit.DB.Plumbing, Autodesk.Revit.DB.Electrical
Autodesk.Revit.UI
```

Use short names only: `XYZ`, `Line`, `Wall`, `Floor`, `StructuralType`, etc. No `Autodesk.Revit.DB.` prefix needed.
