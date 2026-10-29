---
name: parameter-access
description: Reading element parameters and properties — GetStr, GetNum, GetVal, GetInt, type-level accessors
---

# Parameter Access

Read parameter values from Revit elements. All methods auto-resolve: Instance → Type → Type Parameter. Just use them — no need to know the parameter scope.

## GetStr — parameter value as string

```csharp
wall.GetStr("Comments")            // "North wall"
wall.GetStr("Fire Rating")         // "2 hr"
wall.GetStr("Room Bounding")       // "0" (yes/no checkbox)
floor.GetStr("Level")              // "Level 1" (ElementId resolved to name)
```

Handles String, ElementId (resolves to name), Double/Integer (formatted), and falls back to C# properties via Reflection.

## GetNum — parameter value as double

```csharp
wall.GetNum("Area")                           // internal units (sq ft)
wall.GetNum("Area", "m2")                     // 14.52
wall.GetNum("Unconnected Height")             // internal units (ft)
wall.GetNum("Unconnected Height", "m")        // 2.80
wall.GetNum("Width", "mm")                    // 200
```

Falls back to C# properties via Reflection if the parameter isn't found.

## GetInt — parameter value as integer

```csharp
wall.GetInt("Room Bounding")         // 1 or 0 (yes/no checkbox)
beam.GetInt("Number of Studs")       // 3
```

## GetVal — formatted value string (as seen in Revit Properties)

```csharp
wall.GetVal("Area")                  // "14.52 m²"
wall.GetVal("Volume", "m3")          // "2.450 m³"
```

## Type-Level Accessors

All instance-level getters have type-level equivalents for when you specifically need Type-only lookup:

```csharp
column.GetTypeStr("Material")        // "Concrete - C-25"
column.GetTypeNum("b", "mm")         // 250
column.GetTypeNum("h", "mm")         // 300
column.GetTypeInt("Usage")           // 0
column.GetTypeVal("Cost")            // "25.00"
```

`GetElementType()` returns the `ElementType` for any instance.

## Native Properties (dot access, not GetStr)

Only these are real properties on `Element` itself — use dot notation, not `.GetStr()`:
```
el.Id          → ElementId
el.Name        → string (type name on instances)
el.Location    → Location (Point or Curve)
```

⚠⚠ **`el.Area`, `el.Volume` and `el.Symbol` are NOT members of `Element`.** Writing them on an
`Element` variable fails to compile with `CS1061` — verified by compilation, not by memory
(`spikes/probe_native_props.py`). They belong to narrower types:

| you want | write | type it lives on |
|---|---|---|
| family symbol of an instance | `fi.Symbol` | `FamilyInstance` → returns **`FamilySymbol`**, not `ElementId` |
| room / space area, volume | `room.Area`, `room.Volume` | `Room` / `Space` (double, internal units = ft²/ft³) |
| area or volume of **anything else** | `el.GetNum("Area")`, `el.GetVal("Area", "m2")` | every element — it is a **parameter** |

A wall has `Area` and `Volume` as *parameters*, not properties, so `wall.GetNum("Area")` is
the only route. Reaching for `el.Area` costs a compile round-trip and, when the agent then
tries to "fix" it, usually a `dynamic` — which the tool blocks.

For coordinates — ⚠ `Point` and `Curve` live on the DERIVED location classes, never on `Location`:
```csharp
Element el = null;
var pt = ((LocationPoint)el.Location).Point;    // XYZ — coordinates in feet
var cv = ((LocationCurve)el.Location).Curve;    // Curve — for line-based elements
```

## Unit strings

`"m" "cm" "mm" "ft" "in"` | `"m2" "sqm" "ft2" "sqft"` | `"m3" "cum" "ft3" "cuft"`

**BANNED:** `UnitType.UT_Area`, `OutputUnit.SquareMeters`, `"Square Meters"`, `"Cubic Meters"` — use short strings only.
