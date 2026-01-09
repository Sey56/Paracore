# Paracore AI Scripting Instructions

Follow these instructions to generate high-quality, C#-based Revit automation scripts compatible with the Paracore Parameter Engine (V2).

## Core Architecture
- **Language**: C# Revit API (Targeting Revit 2025).
- **Structure**: Single-file `.cs` using **Top-Level Statements**.
- **Important Order**:
    1.  `using` statements.
    2.  **Logic & Preparation** (Read-only queries, calculations).
    3.  **Execution** (Single transaction for modifications).
    4.  **Class Definitions** (Attributes and Parameters MUST be at the very bottom).

## Parameter Engine (V2)
All script parameters must be defined inside a `public class Params` at the bottom of the file.

### Attributes
- `[RevitElements(TargetType = "...", Category = "...")]`: Use for anything existing in the Revit document (Walls, Levels, Views).
- `[ScriptParameter(Group = "...")]`: Use for static script settings (Strings, Doubles, Booleans).
- `[Required]`: Add to any parameter essential for execution.
- `/// <summary>Description</summary>`: Use XML summaries for tooltip descriptions.

### Conventions (Providers)
Paracore uses naming conventions to drive dynamic UI behavior:
- `PropertyName_Options`: Returns `List<string>` for dropdowns.
- `PropertyName_Filter`: Alternative for logic-based dropdown lists.
- `PropertyName_Range`: Returns `(double min, double max, double step)` for sliders.
- `PropertyName_Visible`: Returns `bool` for conditional visibility.
- `PropertyName_Enabled`: Returns `bool` for conditional interaction.

> [!IMPORTANT]
> **ROOMS**: "Room" is not a magic `TargetType`. Always use a `_Options` provider with `OfCategory(BuiltInCategory.OST_Rooms)` for Rooms.

## Coding Standards
1.  **Revit 2025 Compatibility**: Use `ElementId.Value` (long) instead of `IntegerValue`.
2.  **Output**: 
    - Use `Println($"Message {var}")` for console logs.
    - Use `Show("table", data)` only for structured grids.
    - **Avoid** the ❌ emoji; use 🚫 or ⚠️.
3.  **Transactions**: Use exactly one `Transact("Name", () => { ... })` block.
4.  **Casting**: Always use `.Cast<Type>()` after `FilteredElementCollector`.
5.  **Geometry**: Ensure curves are > 0.0026 ft before creation.

## Implicit Globals (Do Not Import)
These are provided by the engine at runtime:
- `Doc`, `UIDoc`, `UIApp`
- `Println`, `Show`, `Transact`

## Required Imports
```csharp
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using System;
using System.Linq;
using System.Collections.Generic;
```

## Example Structure
```csharp
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System.Linq;
using System.Collections.Generic;

// 1. Setup
var p = new Params();

// 2. Logic (Preparation)
var room = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .Cast<Room>()
    .FirstOrDefault(r => r.Name == p.SelectedRoom);

if (room == null) {
    Println("🚫 Room not found.");
    return;
}

// 3. Execution
Transact("Add Note", () => {
    // DB modifications here
});

// 4. Classes (MUST BE LAST)
public class Params {
    [RevitElements(Group = "Room Selection"), Required]
    public string SelectedRoom { get; set; }

    public List<string> SelectedRoom_Options => new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
        .Cast<Room>()
        .Select(r => r.Name)
        .ToList();
}
```
