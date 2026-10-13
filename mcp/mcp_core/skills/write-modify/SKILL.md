---
name: write-modify
description: Modifying elements — SetVal, SetNum, SetParam, Delete, Hide, Isolate, Transact
---

# Write & Modify

Modify Revit elements — single elements, bulk collections, and manual foreach loops.

## Transaction Rules

- **Single element** (`.SetVal()`, `.SetNum()`, `.Delete()`, `.Hide()`, `.Unhide()`, `.Isolate()`) — auto-transact. No `Transact()` needed.
- **Collection bulk** (`.SetParam()`, `.Delete()`, `.Hide()`, `.Unhide()`, `.Isolate()`) — ONE transaction for the whole collection.
- **Manual foreach** — ALWAYS wrap in `Transact("name", () => { ... })`. Inside a Transact block, individual `.SetVal`/`.SetNum` calls run directly without creating sub-transactions.
- **After ANY modification**, add a `Println()` with the count and what was done. The output text feeds your conversational response.

## SetNum — set a numeric value with unit conversion

```csharp
wall.SetNum("Unconnected Height", 3.0, "m")   // converts 3.0m → internal ft
wall.SetNum("Base Offset", -150, "mm")         // converts -150mm → internal ft
```

NEVER do manual conversion math. ALWAYS pass the unit string.

## SetVal — THE smart setter

```csharp
wall.SetVal("Comments", "New comment")          // String
wall.SetVal("Unconnected Height", 3.0)          // Double (uses param's display unit)
wall.SetVal("Room Bounding", 0)                 // Int (0 = unchecked, 1 = checked)
wall.SetVal("Level", "Level 2")                 // ElementId resolved by name
wall.SetVal("Mark", "A-12")                     // String parameter
```

With explicit unit:
```csharp
wall.SetVal("Unconnected Height", 2800, "mm")   // converts from mm
column.SetVal("Base Offset", -0.15, "m")        // converts from m
```

## Collection Bulk Write — SetParam

All set operations run in a single transaction. All methods are chainable.

```csharp
GetElements("Walls")
    .WhereParam("Fire Rating", "None")
    .SetParam("Fire Rating", "2 hr")

GetElements("Structural Columns")
    .SetParam("Base Offset", -150, "mm")         // with unit conversion

GetElements("Doors")
    .SetParam("Mark", d => $"D-{d.RoomFrom()}")  // dynamic factory per element

GetElements("Walls")
    .SetParam("Mark", (w, idx) => $"W{idx+1:D3}") // indexed factory
```

## Manual foreach — Transact REQUIRED

```csharp
var walls = GetElements("Walls").WhereParam("Base Constraint", "Level 01");
Transact("Update walls", () => {
    foreach (var w in walls) {
        w.SetVal("Top Constraint", "Level 02");
        w.SetNum("Top Offset", -150, "cm");
    }
});
Println($"Updated {walls.Count()} walls — Top Constraint → Level 02.");
```

Transact signature: `Transact("description", () => { ... })` — the first argument MUST be a string label.

## Delete, Hide, Unhide, Isolate

```csharp
element.Delete()                               // single element (BIM-safe)
element.Hide() / element.Unhide()              // visibility
element.Isolate()                              // isolate in view

GetElements("Generic Models").WhereMatches("TEMP").Delete()   // bulk delete (one transaction)
```

## Chain bulk writes

```csharp
walls.SetParam("Top Constraint", "Level 02")
     .SetParam("Top Offset", -150, "cm");
```
