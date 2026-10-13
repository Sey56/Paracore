# Parameter Discovery

Revit parameters are NOT consistent across categories. There is NO universal "Level"
parameter — every category uses a different name for the same concept. Guessing parameter
names is the #1 cause of execution failures.

## Mandatory Discovery

For EVERY category you interact with for the first time, discover its parameter names
BEFORE writing any query that filters, groups, or reads parameters.

**Primary method — COMPREHENSIVE:**
```
GetElements("CategoryName").First().CombinedParams().Table()
```
- Returns EVERY parameter: Native properties + Instance params + Type params
- Shows EXACT names, storage types, AND current values
- This is the authoritative source. It never fails due to naming issues.
- Works with any category name the hydration engine accepts.
- Shows up to 100 rows — enough for even parameter-heavy categories like Walls.

**Secondary method — FAST (cached):** `search_schema("CategoryName")`
- Returns parameter names + storage types (no values)
- Cached after first call. Falls back to CombinedParams if the name isn't recognized.
- Use for quick confirmation when you already know the category exists.

## Known Patterns (verified, not assumed)

These common categories have CONSISTENT parameter names across most projects.
They are listed for speed, but discovery is still safer:

| Category | Level Parameter | Area/Volume Params |
|---|---|---|
| Walls | `"Base Constraint"` | `"Length"`, `"Area"`, `"Volume"` |
| Structural Columns | `"Base Level"` | — |
| Floors | `"Level"` | `"Area"`, `"Volume"`, `"Thickness"` |
| Rooms | `"Level"` | `"Area"`, `"Perimeter"` |
| Ceilings | `"Level"` | — |
| Doors | `"Level"` | — |
| Windows | `"Level"` | — |

Even for these, if your query fails with "parameter not found", run discovery — the
project may use different names (localized, custom parameters, or template variations).

## After Discovery

Copy ONLY the parameter name from the first column. NEVER include storage type
annotations in your code:

- Schema shows: `Level` | String | Instance
- CORRECT: `.WhereParam("Level", "Level 3")`
- WRONG: `.WhereParam("Level [String]", "Level 3")`
