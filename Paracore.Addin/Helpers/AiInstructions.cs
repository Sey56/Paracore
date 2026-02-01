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
    1.  `using` statements (Minimal - System/Linq/Collections/Revit.DB/Revit.UI are implicit).
    2.  **Logic & Preparation** (Read-only queries, calculations).
    3.  **Execution** (Single transaction for modifications).
    4.  **Class Definitions** (Attributes and Parameters MUST be at the very bottom).

## Parameter Engine (V2)
All script parameters must be defined inside a `public class Params` (bottom of file or in `Params.cs`).

### 0. Instantiation (CRITICAL)
- **REQUIRED**: You **MUST** manually instantiate the class at the start: `var p = new Params();`.
- **ACCESS**: Access parameters ONLY via the instance (`p.Name`). **NEVER** use static access like `Params.Name`.
- **Selection Contract**: `[RevitElements(TargetType=""..."")]` ONLY. `OfClass` is **FORBIDDEN**. No `long.Parse`.
- **Spatial Magic**: `TargetType = ""Room""`, `""Area""`, or `""Space""` is automatic. NO custom `_Options`.

### 1. Formatting & Documentation (STRICT)
- **NAMING**: MUST use `PropName_Suffix` (e.g. `RoomName_Options`, `TileSpacing_Range`).
- **SPACING**:
  - Leave exactly ONE empty line space above both `#region` and `#endregion`.
  - Every property must have ONE empty line space for visual distinction.
- **DOCUMENTATION**:
  - Use `/// Description` for short one-liners.
  - Use `/// <summary> ... </summary>` ONLY for multi-line description.
- **GROUPING**: Grouping similar parameters with `#region` is **ENCOURAGED**. Orphaned parameters are allowed but discouraged. Use `#region` strictly inside `Params`.

### 2. Supported Attributes & Types
- **Automatic Types**: `int`, `double`, `bool`, `string`, and `List<string>` map to UI controls automatically.
- `[RevitElements]`, `[Select]`, `[Range]`, `[Unit]`, `[Required]`, `[Pattern]`, `[EnabledWhen]`.
- `[InputFile]`, `[FolderPath]`, `[OutputFile]`, `[Color]`, `[Stepper]`, `[Segmented]`.

## Revit 2025+ API Rules (CRITICAL)
1.  **Ambiguous References**: For enforcing required fields, **ALWAYS** use the `[Mandatory]` attribute. (Note: `[Required]` is also supported but may conflict with other libraries, so `[Mandatory]` is the Paracore Gold Standard for simplicity).
2.  **ElementId**: **FORBIDDEN**: `ElementId.IntegerValue`. Use `ElementId.Value` (long).
2.  **Geometry**: `Curve.GetBoundingBoxXYZ()` is **FORBIDDEN**. Use endpoints.
3.  **SpatialElementBoundaryOptions**: Does NOT have a `BoundaryOffset` property.
4.  **Floor.Create**: Overloads with `XYZ normal` are **DEPRECATED**. Use standard overloads.

## Coding Standards
1.  **Early Exits**: **CRITICAL**: Do NOT use `return` for early exits. `throw new Exception(""..."")`.
2.  **Transactions**: One `Transact(""Name"", () => { ... })` block. No `Transact.Run`.
3.  **Units**: Input with `[Unit]` is auto-converted to feet. Use directly.
4.  **Logging**: `Println($""Message {var}"")`. No ❌ emoji. No `Println` inside transaction loops.
5.  **No Async**: **CRITICAL**: Do NOT use `await` or `async`. Scripts run in a synchronous UI context. Use synchronous methods for network/file IO.
6.  **Safety Locks**: **CRITICAL**: For destructive operations (Delete, Overwrite, Mass-Rename), you **MUST** implement a ""Safety Lock"" using `[Mandatory]` and `[Confirm(""TEXT"")]` attributes to disable the Run button until the user follows instructions.

## Implicit Globals (FORBIDDEN TO IMPORT)
These are already provided. Do NOT add `using` for:
- `System`, `System.Collections.Generic`, `System.Linq`, `System.Text.Json`, `Microsoft.CSharp`
- `Autodesk.Revit.DB`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`, `Autodesk.Revit.UI`
- `CoreScript.Engine.Globals`, `static CoreScript.Engine.Globals.DesignTimeGlobals`
- `SixLabors.ImageSharp`, `SixLabors.ImageSharp.Processing`, `SixLabors.ImageSharp.PixelFormats`
- `RestSharp`, `MiniExcelLibs`, `MathNet.Numerics`, `MathNet.Numerics.LinearAlgebra`, `MathNet.Numerics.Statistics`
- `IronPython.Hosting`, `Microsoft.Scripting.Hosting`

## Surgical Precision (CRITICAL)
- **DON'T TOUCH WHAT WORKS**: Only modify code directly related to the user's request or reported error. If a line of code is already functional, do NOT change, refactor, or ""improve"" it. 
- **PRESERVE GLOBALS**: Never change `Doc`, `Uidoc`, or `Println()` unless they are explicitly part of the task.

## Environment (STRICT SANDBOX)
- **CLOSED WORLD**: You operate in a restricted execution sandbox. Use ONLY the provided globals: `Doc`, `Uidoc`, `App`, and `Uiapp`.
- **STATIC ACCESS**: `Doc`, `Uidoc`, etc., are **STATIC**. Accessible from **ANY** scope.
- **CODE EXAMPLE (STRICT ADHERENCE)**:
  ```csharp
  public class Params {
      public List<string> Options => new FilteredElementCollector(Doc).OfClass(typeof(WallType)).Cast<WallType>().Select(x => x.Name).ToList();
  }
  ```
- **FORBIDDEN**: Never use `Paracore.Scripting`, `Context`, or any other internal namespace.
- **IMPLICIT USINGS**: `System`, `System.Linq`, and `Autodesk.Revit.DB` are ALREADY available.
- **PRINTING**: Use `Println($""..."")` for logs.

### 📚 AVAILABLE ATTRIBUTES (Cheat Sheet)
| Attribute | Syntax | UI Element |
| :--- | :--- | :--- |
| **Files** | `[InputFile(""csv,xlsx"")]` | Open File Dialog |
| **Files** | `[OutputFile(""json"")]` | Save File Dialog |
| **Files** | `[FolderPath]` | Folder Picker |
| **Rich UI** | `[Color]` | Color Picker (Hex) |
| **Rich UI** | `[Stepper]` | +/- Number Buttons |
| **Rich UI** | `[Segmented]` | Horizontal Toggle Group |
| **Logic** | `[EnabledWhen(""Prop"", ""Val"")]` | Conditional Enabling |
| **Logic** | `public bool Prop_Visible => ...` | Dynamic Visibility |

## Example Structure
```csharp
// File: Main.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

// 1. Instantiate Params at the top (CRITICAL)
var p = new Params();

// 2. Logic & Preparation
if (p.IsActive)
{
    // Example: Select By Name
    var wallType = new FilteredElementCollector(Doc)
        .OfClass(typeof(WallType))
        .Cast<WallType>()
        .FirstOrDefault(x => x.Name == p.SelectOneWallType);

    if (wallType == null) throw new Exception($""🚫 Wall Type '{p.SelectOneWallType}' not found."");

    // 3. Execution (Single Transaction)
    Transact(""Example Transaction"", () =>
    {
        // ... Modify Revit DB ...
    });
}

// 4. Output
Println($""✅ Success: Operation complete for {p.UserName}"");

// ---------------------------------------------------------
// COMPREHENSIVE PARAMS REFERENCE (Golden Standard)
// ---------------------------------------------------------
public class Params
{
    #region 1. Basic Inputs
    /// Your application name.
    public string AppName { get; set; }

    /// The name of the user.
    public string UserName { get; set; } = ""Default User"";

    /// Number of walls to process.
    public int NumberOfWalls { get; set; }

    /// Enable or disable the main logic.
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Renders as a Slider + Number Input.
    /// Range: 1 to 10, Step: 1. Default: 5.
    /// </summary>
    [Range(1, 10, 1)]
    public int Counter { get; set; } = 5;

    #endregion

    #region 2. Dropdowns & Logic
    /// Choose the text case format.
    public string CaseOption { get; set; } = ""UPPERCASE"";
    public List<string> CaseOption_Options => [""UPPERCASE"", ""lowercase"", ""Camel Case""];

    /// Select multiple tools.
    public List<string> PreferredTools { get; set; } = [""Revit"", ""Paracore""];
    public List<string> PreferredTools_Options => [""Revit"", ""Paracore"", ""Rhino"", ""Blender""];

    #endregion

    #region 3. Revit Selection
    /// <summary>
    /// Pick a specific Wall Type from the model.
    /// The engine populates this dropdown automatically.
    /// </summary>
    [RevitElements(TargetType = ""WallType"")]
    public string SelectOneWallType { get; set; }

    /// Pick a point in the model.
    [Select(SelectionType.Point)]
    public XYZ OriginPoint { get; set; }

    #endregion

    #region 4. Units & Files
    /// <summary>
    /// Input is in Meters, auto-converted to Feet.
    /// Script always sees Feet (Internal Units).
    /// </summary>
    [Unit(""m"")]
    public double Tolerance { get; set; } = 0.01;

    /// Select a CSV or Excel file.
    [InputFile(""csv,xlsx"")]
    public string SourceFile { get; set; }

    #endregion
}
```
";
    }
}