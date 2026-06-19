# Element Retrieval

Use GetElements, NEVER FilteredElementCollector.

## Typed vs String Retrieval — MUST READ

Some categories have C# classes (`.Name`, `.Area` are native dot-access properties).
Others are loadable families — no native class, must use `.GetStr("Name")` for everything.

**USE TYPED retrieval** for categories that have a C# class:
| Category | Typed | String (only if you need all params) |
|---|---|---|
| Walls | `GetElements<Wall>()` | `GetElements("Walls")` |
| Floors | `GetElements<Floor>()` | `GetElements("Floors")` |
| Rooms | `GetElements<Room>()` | `GetElements("Rooms")` |
| Ceilings | `GetElements<Ceiling>()` | `GetElements("Ceilings")` |
| Levels | `GetElements<Level>()` | ❌ NOT `GetElements("Levels")` |
| Roofs | `GetElements<Roof>()` | ❌ NOT `GetElements("Roofs")` |
| Stairs | `GetElements<Stairs>()` | `GetElements("Stairs")` |
| Views | `GetElements<View>()` | `GetElements("Views")` |
| Sheets | `GetElements<ViewSheet>()` | `GetElements("Sheets")` |
| Grids | `GetElements<Grid>()` | ❌ NOT `GetElements("Grids")` |

**USE STRING retrieval** for loadable families (no C# class):
| Category | Correct |
|---|---|
| Doors | `GetElements("Doors")` or `GetElements<FamilyInstance>("Doors")` |
| Windows | `GetElements("Windows")` or `GetElements<FamilyInstance>("Windows")` |
| Furniture | `GetElements("Furniture")` |
| Structural Columns | `GetElements("Structural Columns")` |
| Structural Framing | `GetElements("Structural Framing")` |
| Generic Models | `GetElements("Generic Models")` |

**For typed elements:** `.Name`, `.Id`, `.Area` are native properties — use dot access.
**For untyped elements (string retrieval):** use `.GetStr("Name")`, `.GetStr("Level")`, etc.

## Special Cases — NOT categories

These are NOT element categories — access via Doc, not GetElements:
- `Doc.ProjectInformation` → singleton with `.Name`, `.Number`, `.ClientName`, `.Address`
- `Doc.Title` → file name
- `Doc.PathName` → file path
- `Doc.IsWorkshared` → boolean
- `ActiveView` → current view
- `Selection` → selected elements

## Utilities
- `GetElement("name")` → single element by name/ID

## ⚠️  DANGER — Never Display Raw
- `GetCategories()` → returns 1,200+ category names. NEVER call `.Table()` or `Println()` on it.
  - Use only for `.Contains("CategoryName")` checks in code, not for display.
- `GetMagicNames()` → returns 500+ category + family + class names. Same danger.
  - Use only for lookup, never for display.
  - To check if a name exists: `GetMagicNames().Any(m => m.Equals("Term", StringComparison.OrdinalIgnoreCase))`
  - To find matching names: use `.Where()` + loop over results — never dump the full list.
