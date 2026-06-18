# Common Patterns

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
