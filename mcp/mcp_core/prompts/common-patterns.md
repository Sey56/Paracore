# Common Patterns

## CRITICAL: .Select() column naming rules

When using `.Select()` to create named columns in a table:

1. **Column names MUST match Revit parameter names** — replace spaces with underscores.
   - `"Unconnected Height"` → `Unconnected_Height` (NOT `UnconnectedHeight_m`)
   - `"Base Constraint"` → `Base_Constraint`
   - `"Family And Type"` → `Family_And_Type`

2. **NEVER add unit suffixes to column names** — the unit is in `GetNum(name, unit)`.
   - ❌ `Length_m`, `Volume_m3`
   - ✅ `Length`, `Volume`

3. **The UI renders underscores as spaces** for display. CSV upload uses column names
   to find Revit parameters — wrong names break editing.

## When to aggregate vs. list rows

- **User asks for totals/sums/averages** → use `.SumParam()` (one number)
- **User asks "per level" or "by type"** → use `.GroupByParam()` (summary table)
- **User asks for raw elements** → use `.Table()` with `.Take(N)` to limit rows
- **Never list thousands of elements** — the summarizer caps at 50 rows and the
  user won't see the full data. If a query might return >50 rows, add `.Take(50)`.

```csharp
// Group and count
GetElements("Doors").GroupByParam("Level").Table()

// Group, sum, display
GetElements("Rooms").GroupByParam("Level", "Area", "m2").Table()

// Group, sum, bar chart
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph()

// Filter and display
GetElements("Walls").WhereParam("Base Constraint", "Level 1")
    .Select(w => new { w.Id, Name = w.GetStr("Name") }).Table()

// Bulk set one param
GetElements("Walls").WhereParam("Base Constraint", "Level 01")
    .SetParam("Comments", "Reviewed")

// Bulk set two params (chain)
walls.SetParam("Top Constraint", "Level 02").SetParam("Top Offset", -150, "cm")

// Bulk delete
GetElements("Generic Models").WhereMatches("TEMP").Delete()

// Foreach modify
Transact("Update", () => {
    foreach (var w in walls) {
        w.SetVal("Top Constraint", "Level 02");
    }
});

// After modify, always print count
Println($"Updated {walls.Count()} walls — Top Constraint → Level 02.");
```
