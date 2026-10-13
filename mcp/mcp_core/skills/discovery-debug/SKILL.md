---
name: discovery-debug
description: Discovering element parameters, properties, and geometry — CombinedParams, Peek, BuiltInParams, NativeProperties
---

# Discovery & Debug

Inspect elements to discover what parameters they have, what properties are available, and what their geometry looks like. Use these BEFORE writing queries that filter or read parameters.

## Primary Discovery — CombinedParams

```csharp
GetElements("Walls").First().CombinedParams().Table()
```

Returns EVERYTHING: Instance params + Type params + Native properties, with Scope, Name, Storage, and current Value columns. This is the authoritative source — it never fails due to naming issues. Works with any element type. Takes ZERO arguments.

## Parameter Discovery Methods

```csharp
element.BuiltInParams().Table()          // built-in parameters with current values
element.InstanceParams().Table()         // instance parameters: Name, Storage, Value
element.TypeParams().Table()             // type parameters on the element's family type
element.ParamsDict()                     // Dictionary<string,string> of all params
element.NativeProperties()               // Category, Level, Workset, etc.
```

## Reflection Discovery

```csharp
element.ReflectionProperties().Table()   // all C# properties on the element
element.ReflectionMethods().Table()      // all C# methods (public, not Object)
```

## Quick Peek

```csharp
element.Peek()                           // quick summary without full table
```

## Geometry

```csharp
element.GeometrySummary().Table()        // recursive: Solids, Curves, Arcs in world space
```

## Discovery Workflow

For EVERY category you interact with for the first time, discover its parameter names BEFORE writing any query:

1. **Primary:** `GetElements("CategoryName").First().CombinedParams().Table()` — exhaustive, shows exact names and values
2. **Fast (cached):** `search_schema("CategoryName")` — returns parameter names + storage types, no values

Copy ONLY the parameter name from the first column. NEVER include storage type annotations:
- Schema shows: `Level` | String | Instance
- CORRECT: `.WhereParam("Level", "Level 3")`
- WRONG: `.WhereParam("Level [String]", "Level 3")`
