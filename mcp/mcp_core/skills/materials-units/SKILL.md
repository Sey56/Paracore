---
name: materials-units
description: Materials, unit conversion, and numeric helpers — Materials, MaterialNames, InputUnit, OutputUnit, RoundTo, IsAlmostEqualTo
---

# Materials & Units

Query materials on elements, convert between human units and Revit internal feet, and use precision-aware numeric comparisons.

## Materials

```csharp
element.Materials().Table()               // all Material objects on the element
element.MaterialNames()                   // IEnumerable<string>: "Concrete - C-25", "Plaster - Cement"
element.GetMaterialNames()               // comma-separated string
```

Material filters work on any element type — they check geometry faces, paint, compound layers, and STRUCTURAL_MATERIAL_PARAM:

```csharp
GetElements("Structural Framing").WhereMaterial("Concrete")
GetElements("Structural Framing").WhereMaterialNot("Steel")
```

## Unit Conversion

### Input (human → Revit internal feet)
```csharp
3.0.InputUnit("m")                    // 9.8425
150.InputUnit("mm")                   // 0.4921
```

### Output (Revit internal feet → human)
```csharp
196.85.OutputUnit("m2")              // 18.29
area.OutputUnit("mm", 0)             // round to nearest mm
```

### String dimension parser
```csharp
"50mm".ToMeters()                    // 0.05
"2ft".ToMeters()                     // 0.6096
```

**NEVER hardcode conversion math.** Don't use `/304.8`, `*0.3048`, or manual mm-to-m conversion. Always pass the unit as a string argument.

## Formatting

```csharp
value.FormatUnit("m2")               // "18.29 m²"
value.FormatValueOnly("m2", 1)       // "18.3"
value.RoundTo("mm")                  // round internal value to nearest mm
```

## Accepted Unit Strings

These are the ONLY tokens the converter accepts. Anything else throws with the list in the
message — deliberately, because an unrecognised unit used to mean "already in feet" and wrote the
wrong number with no warning.

**Length:** `"mm"` `"cm"` `"m"` `"in"` `"ft"` — long forms work too (`"millimeters"`, `"inches"`, …)
**Area:** `"m2"` `"sqm"` `"sq.ft"` `"sqft"` `"ft2"` — also `"m²"`, `"square meters"`
**Volume:** `"m3"` `"cum"` `"cu.ft"` `"cuft"` `"ft3"` — also `"m³"`, `"cubic meters"`

⚠ **There is no `km`, `deg`, `%`, `kg`, `nr` or `no`.** An earlier version of this list claimed all
six; measured 2026-10-29, `InputUnit`, `OutputUnit` and `FormatUnit` reject every one of them. These
helpers convert LENGTH, AREA and VOLUME only. For mass, angle or a count, read the value as Revit
displays it — `GetStr(name)` / `GetVal(name)` — instead of asking for a conversion that does not
exist.

## Precision-Aware Comparisons (fuzzy equality)

```csharp
x.IsAlmostEqualTo(y)                 // tolerance 1e-9
x.AlmostZero()                       // |x| < 1e-9
x.IsLessThan(limit)                  // fuzzy less-than
x.IsGreaterThan(limit)               // fuzzy greater-than
x.IsPositive()                       // > 0 (with tolerance)
x.IsNegative()                       // < 0 (with tolerance)
```

Use these instead of `==` or `!=` when comparing doubles from Revit geometry.
