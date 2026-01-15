namespace Paracore.Addin.Helpers
{
    public static class AiInstructions
    {
        public const string CopilotInstructions = 
@"# Paracore AI Scripting Instructions

Follow these instructions to generate high-quality, C#-based Revit automation scripts compatible with the Paracore Parameter Engine (V2).

## Core Architecture
- **Language**: C# Revit API (Targeting Revit 2025 and above).
- **Structure**: Single-file `.cs` using **Top-Level Statements**.
- **Important Order**:
    1.  `using` statements (Minimal - System/Linq/Collections/Revit.DB are implicit).
    2.  **Logic & Preparation** (Read-only queries, calculations).
    3.  **Execution** (Single transaction for modifications).
    4.  **Class Definitions** (Attributes and Parameters MUST be at the very bottom).

## Parameter Engine (V2)
All script parameters must be defined inside a `public class Params` (bottom of file or in `Params.cs`).

### 1. Grouping (Zero Boilerplate)
- Use C# `#region GroupName` ... `#endregion` to automatically group UI inputs.
- **CRITICAL**: Always leave an **EMPTY LINE** before and after `#region` and `#endregion` directives.
- **NOTE**: Keep attributes attached directly to the property (no empty line).

### 2. Supported Attributes & Types
- `[RevitElements]`: For Revit objects (Walls, Sheets, Rooms).
  - Example: `[RevitElements(TargetType=""Room"")]`
  - Example: `[RevitElements(TargetType=""FamilySymbol"", Category=""Doors"")]`
- `[Select]`: For interactive selection (Native Types supported).
  - `[Select(SelectionType.Point)]`: Use `public XYZ StartPoint { get; set; }` (Engine injects `new XYZ(...)`).
  - `[Select(SelectionType.Edge)]`: Use `public Reference EdgeRef { get; set; }`.
  - `[Select(SelectionType.Face)]`: Use `public Reference FaceRef { get; set; }`.
  - `[Select(SelectionType.Element)]`: Use `public int ElementIdVal { get; set; }`.
- `[Range(min, max, step)]`: Forces a UI Slider.
- `[Unit(""unit"")]`: Handles input conversion (e.g. `[Unit(""mm"")]`). 
  - *Note*: Input is auto-converted to feet. Output (Print) must be manual.
- `[Required]`: Marks input as mandatory.
- `/// <summary>`: Tooltip description.

### 3. Dynamic Logic (Conventions)
- **Magic Extraction**: For simple lists (e.g. All Rooms), DO NOT define a helper. Just use `[RevitElements(TargetType=""Room"")]`.
- **Custom Filtering**: Define `_Options` (returns `List<string>`) ONLY if you need specific filtering (e.g. ""Rooms on Level 1"").
- `_Visible` (returns `bool`): Show/Hide logic.
- `_Enabled` (returns `bool`): Enable/Disable logic.
- `_Range` (returns `(double, double, double)`): Dynamic slider limits.

## Architecture & Modularization
- **Context Awareness**: ALWAYS check the `# Current Script Type` header at the very top of this file.
- **Single-File Scripts**: If the header says `SINGLE-FILE`, you **MUST** keep all logic, utility classes, and the `Params` class in that ONE `.cs` file.
- **Multi-File Scripts**: If the header says `MULTI-FILE`, modularization is *optional*:
  - If the script is simple, keep everything in the entry point file `Main.cs`.
  - If complex, you may create separate files. 
  - **CRITICAL**: The file containing `public class Params` **MUST** be named `Params.cs`. Do NOT use `module_X.cs`.
  - Utilities should be named meaningfully (e.g., `GeometryUtils.cs`).

## Revit 2025+ API Rules (CRITICAL)
1.  **ElementId**: Use `ElementId.Value` (long). **NEVER use `.IntegerValue`**.
2.  **Geometry**:
    - `Curve` does NOT have `GetBoundingBoxXYZ()`. Use `curve.GetEndPoint(0)` and `curve.GetEndPoint(1)`.
    - Ensure curves are > 0.0026 ft before creation.
3.  **SpatialElementBoundaryOptions**: Does NOT have a `BoundaryOffset` property.
4.  **Floor.Create**:
    - **FORBIDDEN**: Overloads with `XYZ normal` are deprecated.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId)` for architectural floors.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId, isStructural, null, 0.0)` for structural floors.

## Coding Standards
1.  **Error Handling & Early Exits**: 
    - **CRITICAL**: Do not use the `return` keyword for early exits on errors.
    - Instead, `throw new Exception(""Clear error message"")`. 
    - This allows the Paracore engine to catch the failure and display an ""Execution Failed"" status in the UI.
2.  **Transactions & Fail-Fast**:
    - Use exactly one `Transact(""Name"", () => { ... })` block.
    - **FORBIDDEN**: `Transact.Run`, `Transaction.Run`, or any variations.
    - **FORBIDDEN**: Do NOT use `Transact` for read-only operations (filtering, selection).
    - **FORBIDDEN**: Do NOT use `try-catch` inside loops within a transaction.
    - Let exceptions propagate so the transaction rolls back automatically.
    - If one element fails, the whole batch should fail cleanly.
3.  **Output Optimization**:
    - Use `Println($""Message {var}"")` for console logs.
    - **FORBIDDEN**: Do NOT call `Println` inside loops that are within a `Transact` block. It floods the console and slows execution.
    - **CORRECT**: After the transaction, print ONE summary message like `Println($""✅ Created {count} items."");`
    - **ALLOWED**: `Println` inside loops is fine for read-only operations (filtering, selection).
    - Use `Table(data)` for interactive grids and `ChartBar(data)` for visualizations.
    - **Avoid** the ❌ emoji; use 🚫 or ⚠️.
4. **Casting & Filtering (CRITICAL)**:
    - **ALWAYS** use `.Cast<Type>()` after `FilteredElementCollector`.
    - **FORBIDDEN**: `OfClass(typeof(Room))` causes an API error.
    - **CORRECT**: Use `OfCategory(BuiltInCategory.OST_Rooms)` for Rooms.
    - **CORRECT**: Use `OfCategory(BuiltInCategory.OST_Materials)` for Materials.
    - **General Rule**: If `typeof(T)` fails, use `OfCategory(BuiltInCategory.OST_T)`.

## Implicit Globals (Do Not Import)
These are provided by the engine at runtime:
- `Doc`, `UIDoc`, `UIApp`
- `Println`, `Table`, `ChartBar`, `Transact`
- `System`, `System.Linq`, `System.Collections.Generic`, `Autodesk.Revit.DB` (Explicitly imported by engine)

## Required Imports
```csharp
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
// System, Linq, Collections, DB are implicit but safe to re-import if needed for IntelliSense.
```

## Example Structure
```csharp
using Autodesk.Revit.DB.Architecture;

// 1. Setup
var p = new Params();

// 2. Logic (Preparation)
// Native Point Support!
XYZ start = p.StartPoint ?? XYZ.Zero;

var room = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .Cast<Room>()
    .FirstOrDefault(r => r.Name == p.SelectedRoom);

if (room == null) {
    throw new Exception(""🚫 Room not found."");
}

// 3. Execution
Transact(""Add Note"", () => {
    // DB modifications here
});

// 4. Classes (MUST BE LAST)
public class Params {
    #region Geometry

    // Automatic Unit Conversion
    [Unit(""mm"")]
    public double Offset { get; set; } = 500;

    // Native XYZ Support
    [Select(SelectionType.Point)]
    public XYZ StartPoint { get; set; }

    #endregion

    #region Selection

    // Native Reference Support
    [Select(SelectionType.Edge)]
    public Reference SelectedEdge { get; set; }

    [RevitElements(TargetType = ""WallType"")]
    public string WallTypeName { get; set; }

    #endregion
}
";
    }
}
