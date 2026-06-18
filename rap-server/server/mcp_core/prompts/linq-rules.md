# LINQ Rules — Paracore First

Before writing ANY C# code, check this table:

| Instead of raw LINQ | Use Paracore |
|---|---|
| `.Where(e => e.Property)` | `.WhereParam("Name", "value")` |
| `.Where(e => name.Contains(...))` | `.WhereMatches("pattern")` |
| `.Where(fi => !IsCurtainDoor...)` | `.StandardDoor()` |
| `.OrderBy(e => e.GetNum(...))` | `.OrderByParam("Name")` |
| `.OrderByDescending(e => ...)` | `.OrderByParamDesc("Name")` |
| `.GroupBy(e => singleKey)` | `.GroupByParam("Name")` |
| `.Select(g => new {...})` after GroupBy | `.Table()` (chain directly!) |
| `.Sum(e => e.GetNum(...))` | `.SumParam("Name", "unit")` |

## Display Data — `.Table()` ALWAYS, NEVER foreach+Println loops
- CORRECT: `.Select(x => new { x.Id, Name = x.GetStr("Name") }).Table()`
- WRONG: `foreach(var x in list){ Println($"{x.Id}"); }`
- WRONG: `Println($"Ids: {string.Join(", ", items.Select(i => i.Id))}");`
- `Println()` = status messages only ("Done.", "Deleted 5 columns.")

## Allowed LINQ (no Paracore equivalent)

Use these when Paracore can't express what you need:

- `.GroupBy(lambda)` — for grouping by native properties (Location.Point.X,
  Area, Volume), computed values (Math.Round), or multiple keys.
  `.GroupByParam()` only works with STRING parameter names.

- `.Select(x => new{...})` — projection for `.Table()`
- `.Take(n)`, `.Skip(n)`, `.First()`, `.FirstOrDefault()`, `.Any()`
- `.Where(lambda)` — only when `.WhereParam()` can't express the condition

## WARNING
Paracore `.Select()` = "Select in Revit UI" (highlight elements).
For data projection, use LINQ `.Select(x => new {...})`.
NEVER chain LINQ `.Select()` after `.GroupByParam()`. Chain `.Table()` directly:
`GetElements<Wall>().GroupByParam("Base Constraint").Table()`
