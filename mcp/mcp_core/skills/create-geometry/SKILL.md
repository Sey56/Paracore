---
name: create-geometry
description: Creating Revit elements — Wall.Create, Floor.Create, FamilyInstance placement, XYZ, CurveLoop, Transact
---

# Create & Geometry

Create new Revit elements using the raw Revit API. Full access to `Autodesk.Revit.DB` — this is a real C# REPL, not a limited DSL. `Transact()` REQUIRED for all creation.

⚠ **This page is the single-element reference.** A whole **building** is a matter of ORDER,
and the order is fixed: create the **levels** first, then each level's **slab**, then the
**walls** standing on it, then the **rooms** those walls enclose — then repeat for the next
level. Building one category across the whole model before moving to the next is what
produces walls with no host, rooms that do not close, and levels that do not line up.

⚠ Do **not** build a building out of a `Form` (a conceptual mass). A `Form` cannot become a
wall, a floor or a room; model with the real element classes this page shows.

⚠ `list_skills` is the authoritative list of what THIS server teaches. If the recipe you want
is not among them, it is not here — do not guess a skill name.

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

⚠⚠ **Every coordinate is INTERNAL FEET unless you convert it.** A literal `5` is not 5 m — it is
**5 feet** (1524 mm), so a footprint written as bare numbers comes out roughly **3× too small**.
Wrap every dimension in `.InputUnit(...)`; this page's own rule, applied to the example.

```csharp
var floorType = GetElements<FloorType>().FirstOrDefault();
var profile = new CurveLoop();
// ⚠ 5.InputUnit("m") is 5 metres. A bare `5` would be 5 FEET.
profile.Append(Line.CreateBound(new XYZ(0, 0, 0), new XYZ(5.InputUnit("m"), 0, 0)));
profile.Append(Line.CreateBound(new XYZ(5.InputUnit("m"), 0, 0), new XYZ(5.InputUnit("m"), 4.InputUnit("m"), 0)));
profile.Append(Line.CreateBound(new XYZ(5.InputUnit("m"), 4.InputUnit("m"), 0), new XYZ(0, 4.InputUnit("m"), 0)));
profile.Append(Line.CreateBound(new XYZ(0, 4.InputUnit("m"), 0), new XYZ(0, 0, 0)));
Transact("Create Floor", () =>
    Floor.Create(Doc, new List<CurveLoop>{profile}, floorType.Id, lvl.Id));
```

⚠ This profile is **explicitly closed** — the last curve returns to the first point — which is
valid for a hand-written `CurveLoop`. When you build the loop from a corner **list** instead, do
**not** repeat the first corner and close it with `% n`: that makes a zero-length final curve.
Check it before Revit rejects the loop with a message that names no corner:

```csharp
for (int i = 0; i < pts.Count; i++)
    if (pts[i].DistanceTo(pts[(i + 1) % pts.Count]) < 1e-6)
        throw new InvalidOperationException($"zero-length segment at corner {i}");
```

## Family Instance Placement (doors, windows, furniture)

⚠⚠ **The string is a PLURAL CATEGORY name, not a family name.** `GetElements<FamilySymbol>("Desk")`
returns **nothing at all** — `Desk` is a *family*, and the filter takes a *category*. The category
is `Furniture`. A lookup that matches nothing yields `null`, and `null` then fails somewhere far
from the cause. This is the same trap `identity-orientation` names: a category name is not a class
name, and it is not a family name either.

```csharp
var sym = GetElements<FamilySymbol>("Furniture").FirstOrDefault();
Println(sym == null ? "no Furniture family is loaded — list the category first"
                    : "placing " + sym.Name);

var pt = new XYZ(2000.InputUnit("mm"), 3000.InputUnit("mm"), 0);
Transact("Place family", () => {
    if (sym == null) return;                 // nothing to place — a null symbol throws
    // ⚠⚠ AN INACTIVE SYMBOL CANNOT BE PLACED. A type that was loaded but never used in this
    //    document is INACTIVE, and NewFamilyInstance throws on it. Activate it here.
    if (!sym.IsActive) sym.Activate();
    Doc.Create.NewFamilyInstance(pt, sym, lvl, StructuralType.NonStructural);
});
```

⚠ `Activate()` is a **document modification**, so it must be inside a transaction — and it must be
the SAME transaction as the placement, or a failure between the two leaves an activated type with
nothing to show for it.

⚠ **Place → measure → correct.** Every loadable family has its own insertion point and its own
"front", so two fixtures from one library can be built around completely different origins. Never
assume the coordinate you asked for is where the family lands: read the instance's bounding box
and move it by the delta you measured.

```csharp
Transact("place", () =>
{
    var inst = Doc.Create.NewFamilyInstance(pt, symbol, host, StructuralType.NonStructural);
    var bb = inst.get_BoundingBox(null);
    // ⚠ There is no `Element.Move` and no `FamilyInstance.Move` — the API call is
    //   ElementTransformUtils.MoveElement(document, id, translation).
    if (bb != null) ElementTransformUtils.MoveElement(Doc, inst.Id, target - bb.Min);
});
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
