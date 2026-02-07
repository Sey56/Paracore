namespace Paracore.Addin.Helpers
{
    public static class AiInstructions
    {
        public const string CopilotInstructions = 
@"# Paracore AI Scripting Instructions

Follow these instructions to generate high-quality, C#-based Revit automation scripts compatible with the Paracore Parameter Engine (V3).

## Core Architecture
- **Language**: C# Revit API (Targeting Revit 2025 and above).
- **Structure**: Single-file `.cs` using **Top-Level Statements**.
- **Important Order**:
    1.  `using` statements (Minimal - System/Linq/Collections/Revit.DB/Revit.UI are implicit).
    2.  **Logic & Preparation** (Read-only queries, calculations).
    3.  **Execution** (Single transaction for modifications).
    4.  **Class Definitions** (Attributes and Parameters MUST be at the very bottom).

## Parameter Engine (V3 - Hydration)
All script parameters must be defined inside a `public class Params` (bottom of file or in `Params.cs`).

### 0. Instantiation (CRITICAL)
- **REQUIRED**: You **MUST** manually instantiate the class at the start: `var p = new Params();`.
- **ACCESS**: Access parameters ONLY via the instance (`p.Name`). **NEVER** use static access like `Params.Name`.

### 1. Magic Hydration (The Paracore Way)
- **Strong Typing**: Use actual Revit types (`Level`, `WallType`, `Material`, `View`) as property types.
- **NO Strings**: Do NOT use `string` for element selection.
- **Attributes**: 
  - For **Types/Levels/Views**: No attribute needed.
  - For **Categories** (Doors, Windows): Use `[RevitElements(Category=""..."")]` (NO TargetType).
- **Lists**: `List<Level>`, `List<WallType>` create multi-select dropdowns instantly.

### 2. Formatting & Documentation (STRICT)
- **NAMING**: MUST use `PropName_Suffix` (e.g. `RoomName_Options`, `TileSpacing_Range`).
- **SPACING**:
  - Leave exactly ONE empty line space above both `#region` and `#endregion`.
  - Every property must have ONE empty line space for visual distinction.
- **DOCUMENTATION**:
  - Use `/// Description` for short one-liners.
  - Use `/// <summary> ... </summary>` ONLY for multi-line description.
- **GROUPING**: Grouping similar parameters with `#region` is **REQUIRED**. Use `#region` strictly inside `Params`.

### 3. Supported Attributes
- `[Select]`, `[Range]`, `[Unit]`, `[Required]`, `[Pattern]`, `[EnabledWhen]`.
- `[InputFile]`, `[FolderPath]`, `[OutputFile]`, `[Color]`, `[Stepper]`, `[Segmented]`.

## Revit 2025+ API Rules (CRITICAL)
1.  **ElementId**: **FORBIDDEN**: `ElementId.IntegerValue`. Use `ElementId.Value` (long).
2.  **Geometry**: `Curve.GetBoundingBoxXYZ()` is **FORBIDDEN**. Use endpoints.
3.  **Units**: Include `[Unit(""m"")]` for formatting. Script receives internal units (feet).

## Coding Standards
1.  **Early Exits**: **CRITICAL**: Do NOT use `return` for early exits. `throw new Exception(""..."")`.
2.  **Transactions**: One `Transact(""Name"", () => { ... })` block. No `Transact.Run`.
3.  **Logging**: `Println($""Message {var}"")`.
4.  **No Async**: **CRITICAL**: Do NOT use `await` or `async`.
5.  **Safety Locks**: **CRITICAL**: For destructive operations, use `[Mandatory]` and `[Confirm(""DELETE"")]`.
6.  **Globals**: Use only `Doc`, `Uidoc`, `App`, `Println()`.

## Example Structure
```csharp
// File: Main.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

// 1. Instantiate Params at the top
var p = new Params();

// 2. Logic & Preparation
if (p.IsActive && p.TargetLevel != null)
{
    // Clean, direct access!
    Println($""Operating on Level: {p.TargetLevel.Name}"");

    // 3. Execution (Single Transaction)
    Transact(""Update Elements"", () =>
    {
        // ... Modify using p.TargetLevel.Id ...
    });
}

// 4. Output
Println($""✅ Done!"");

// ---------------------------------------------------------
// COMPREHENSIVE PARAMS REFERENCE (V3)
// ---------------------------------------------------------
public class Params
{
    #region 1. Basic Inputs
    public string AppName { get; set; } = ""My Tool"";
    public bool IsActive { get; set; } = true;
    #endregion

    #region 2. Magic Hydration (Strongly Typed)
    /// <summary>
    /// Pick a level. The engine finds them automatically.
    /// </summary>
    public Level TargetLevel { get; set; }

    /// <summary>
    /// Pick a Wall Type. Auto-populated dropdown.
    /// </summary>
    public WallType MyWallType { get; set; }

    /// <summary>
    /// Pick specific Doors. Filtered by Category only.
    /// </summary>
    [RevitElements(Category = ""Doors"")]
    public List<FamilyInstance> TargetDoors { get; set; }
    #endregion

    #region 3. Geometry & Units
    [Select(SelectionType.Point)]
    public XYZ Origin { get; set; }
    
    [Unit(""m"")]
    public double Width { get; set; } = 5.0;
    #endregion
}
";
    }
}