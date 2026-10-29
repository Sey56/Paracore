---
name: aggregate-group
description: Grouping, counting, and summing — GroupByParam, SumParam, aggregated totals
---

# Aggregate & Group

Group elements by parameter, sum values, and produce aggregated tables or totals.

## GroupByParam — count per group

```csharp
GetElements("Structural Framing").GroupByParam("Type").Table()
// Group          | Count
// Grade Beam     | 81
// IntermediateBeams | 145
```

Returns grouped data objects with `Group` and `Count` columns. Chain `.Table()`, `.BarGraph()`, `.PieGraph()`, `.LineGraph()`, or `.Where("Col", "op", val)`.

## GroupByParam with sum

```csharp
GetElements("Structural Columns").GroupByParam("Type", "Volume", "m3").Table()
// Group            | Count | Total (m3)
// Basement Column  | 21    | 3.250
```

Returns `Group`, `Count`, and `Total` columns. The third argument is the value parameter to sum; the fourth is the unit.

**IMPORTANT:** GroupByParam works ONLY with STRING parameter names. It calls `.GetStr()` internally. For native properties (Location, Area, Volume) or computed values (coordinates), use LINQ `.GroupBy(lambda)` instead — that falls under "Allowed LINQ."

## SumParam — grand total across ALL elements

```csharp
GetElements("Structural Framing").SumParam("Volume", "m3")  // 59.67 (single number)
```

Returns a SINGLE DOUBLE — not a table. Does NOT group. For per-group sums, use the 3-argument `GroupByParam(groupBy, sumParam, unit)` instead.

Unit is optional — inferred from parameter name (Volume→m3, Area→m2, Length→m). **The total is NOT rounded:** `SumParam("Area", "m2")` returns the exact sum, e.g. `95.241702`. Pass a `decimals` argument when you want rounding.

⚠ **A GROUPED sum does round — to 3 decimals.** `GroupByParam("Type Name", "Area", "m2")` rounds each group's `Total` (`Math.Round(…, 3)` in the engine), while `SumParam` does not. For BOQ work that means the group totals can disagree with the exact total by up to 0.0005 per group: measured on TestModel, the groups add up to **95.241** against a `SumParam` total of **95.2417**. Carry the `SumParam` figure when you need one number, and say which you used.

## What you CANNOT do after GroupByParam

GroupByParam returns **grouped data**, not Revit elements. You CANNOT chain:
- `.WhereParam()` — use `.Where("Col", "op", val)` instead (column names as strings)
- `.Select()` — chain `.Table()` directly
- `.SumParam()` — already summed if you used the 3-arg overload
- `.Peek()` — not an element

You CAN chain: `.Table()`, `.BarGraph()`, `.PieGraph()`, `.LineGraph()`, `.Where("Col", "op", val)`

## Common patterns

| Goal | Method |
|---|---|
| Count per group | `.GroupByParam("Level").Table()` |
| Sum per group | `.GroupByParam("Level", "Area", "m2").Table()` |
| Grand total | `.SumParam("Area", "m2")` |
| Group then filter groups | `.GroupByParam("Level").Cast<dynamic>().Where(g => g.Count > 5).Table()` |
