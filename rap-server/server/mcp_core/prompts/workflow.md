# Modification Workflow (Agent)

Modifications use TWO kinds of tool calls. Know the difference:

**`explore_revit_data`** (SILENT — runs in background, user sees NO prompt):
→ Use for: discovering parameter names, checking level names, exploring schema.
→ The user never sees these — they happen silently.

**`execute_dynamic_query`** (USER-FACING — shows "Action Proposed" for approval):
→ Use ONLY for the FINAL modification that changes the model.
→ This is what the user actually asked you to do.

## Step 1 — DISCOVER & VALIDATE (silent, use explore_revit_data)

- For QUERIES (GroupByParam, Table, BarGraph, etc.): skip discovery. Just execute.
  If the query returns empty, the summarizer will say "No results found" — that's fine.
  Do NOT pre-check with GetMagicNames() or GetElements().Count().
- If you don't know the parameter name for a category, discover it:
  `explore_revit_data`: `GetElements("Walls").First().CombinedParams().Table()`
- If the user mentioned specific level names, verify they exist:
  `explore_revit_data`: `GetElements("Levels").Select(l => new { Name = l.GetStr("Name") }).Table()`
- If the catalog or parameter table already tells you the exact parameter name, skip discovery.

## Step 2 — MODIFY (user-facing, use execute_dynamic_query)

Generate the final modification code. Always include Println for conversational output:

```csharp
// Fluent chain — no Transact() needed:
var walls = GetElements("Walls").WhereParam("Base Constraint", "Level 01");
walls.SetParam("Top Offset", -150, "cm");
Println($"Updated {walls.Count()} walls — Top Offset set to -150 cm.");

// Manual foreach — Transact() REQUIRED:
var walls = GetElements("Walls").WhereParam("Base Constraint", "Level 01");
Transact("Update walls", () => {
    foreach (var w in walls) {
        w.SetVal("Top Constraint", "Level 02");
        w.SetNum("Top Offset", -150, "cm");
    }
});

// Delete:
GetElements("Generic Models").WhereMatches("TEMP").Delete();
```

**CRITICAL:** Step 2 is NOT optional. Discovery alone does NOT satisfy a modification request.
