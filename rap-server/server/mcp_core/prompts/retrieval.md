# Element Retrieval

Use GetElements, NEVER FilteredElementCollector:

## System Families
(C# classes: Wall, Floor, Room, Ceiling, etc.)
- `GetElements<Wall>()` → typed Wall instances
- `GetElements<WallType>()` → typed wall type definitions
- `GetElements("Walls")` → untyped Element list (use only when type doesn't matter)

## Loadable Families
(Doors, Windows, Furniture, Columns, etc.)
- `GetElements<FamilyInstance>("Doors")` → typed FamilyInstance, door category
- `GetElements<FamilySymbol>("Doors")` → typed type symbols (door family types)
- `GetElements("Doors")` → untyped Element list

## Utilities
- `GetElement("name")` → single element by name/ID
- `GetMagicNames()` → all targetable category/family/class strings
- `GetCategories()` → all project category names
