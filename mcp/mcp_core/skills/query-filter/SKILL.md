---
name: query-filter
description: Element retrieval, filtering, and sorting — GetElements, WhereParam, WhereMatches, OrderByParam
---

# Query & Filter

How to retrieve, filter, and sort Revit elements. This is the starting point for every query.

## Element Retrieval

**System families** (Wall, Floor, Room, Ceiling, etc. — have C# classes):
```csharp
GetElements<Wall>()       // typed Wall instances
GetElements<WallType>()   // typed wall type definitions
GetElements("Walls")      // untyped Element list (use only when necessary)
```

**Loadable families** (Doors, Windows, Furniture, Columns — no C# class):
```csharp
GetElements<FamilyInstance>("Doors")   // typed FamilyInstance, door category
GetElements<FamilySymbol>("Doors")     // typed type symbols
GetElements("Doors")                   // untyped Element list
```

**Single element:** `GetElement("name-or-id")` or `GetElement<T>("name-or-id")`

**Discovery:** `GetMagicNames()` (all targetable names), `GetCategories()` (all project categories)

**NEVER use:** `new FilteredElementCollector(Doc)`, `.OfCategory(BuiltInCategory.OST_...)`, `.WhereElementIsNotElementType()`

## Filtering

All filters preserve the generic element type and track pipeline counts.

### WhereParam — string match
```csharp
GetElements("Walls").WhereParam("Fire Rating", "2 hr")
GetElements("Walls").WhereParam("Comments", "!=", "")        // has a comment
GetElements("Doors").WhereParam("Type", "starts", "Interior")
GetElements("Walls").WhereParam("Type Name", "contains", "HCB")
```

### WhereParam — numeric comparison
```csharp
GetElements("Structural Columns").WhereParam("Volume", ">", 1.0, "m3")
GetElements("Walls").WhereParam("Unconnected Height", ">=", 2.5, "m")
```

### WhereAnyParam
```csharp
// Matches if ANY of the named parameters contains the value
GetElements("Walls").WhereAnyParam(new[]{"Comments","Mark"}, "fire")
```

### WhereTypeParam — filter by type-level parameter
```csharp
GetElements("Walls").WhereTypeParam("Material", "contains", "HCB")
```

### WhereMatches — fuzzy name/family search
```csharp
GetElements<FamilyInstance>("Doors").WhereMatches("flush")
```

### WhereMaterial / WhereMaterialNot
```csharp
GetElements("Structural Framing").WhereMaterial("Concrete")
GetElements("Structural Framing").WhereMaterialNot("Steel")
```

### StandardDoor — exclude curtain-wall doors
```csharp
GetElements<FamilyInstance>("Doors").StandardDoor()   // 33 standard out of 40 total
door.IsStandardDoor()                                 // true if NOT hosted on Curtain Wall
```

### Standard C# Where (lambda) — only when WhereParam can't express it
```csharp
GetElements<Wall>().Where(w => w.GetNum("Unconnected Height", "m") > 3.0)
```

## Sorting

```csharp
GetElements<FamilyInstance>("Doors").OrderByParam("Width").Table()
GetElements("Structural Columns").OrderByParamDesc("Volume").Table()
```

Automatically uses numeric sorting for Double/Integer parameters, string sorting otherwise.

## Quick checks

```csharp
GetElements("Walls").Count()        // integer count
GetElements("Doors").Any()          // true/false
collection.First()                  // first element (throws if empty)
collection.FirstOrDefault()         // first or null
collection.Take(20)                 // limit results
```
