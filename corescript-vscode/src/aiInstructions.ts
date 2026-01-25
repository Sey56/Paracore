export const COPILOT_INSTRUCTIONS = `# Paracore AI Scripting Instructions

Follow these instructions to generate high-quality, C#-based Revit automation scripts compatible with the Paracore Parameter Engine (V2).

## Core Architecture
- **Language**: C# Revit API (Targeting Revit 2025 and above).
- **Structure**: Top-Level Statements with classes at the bottom.
- **Important Order**:
    1.  \`using\` statements (Minimal - System/Linq/Collections/Revit.DB/Revit.UI are implicit).
    2.  **Logic & Preparation** (Read-only queries, calculations).
    3.  **Execution** (Single transaction for modifications).
    4.  **Class Definitions** (Attributes and Parameters MUST be at the very bottom).

## Parameter Engine (V2)
All script parameters must be defined inside a \`public class Params\` (bottom of \`Main.cs\` or in \`Params.cs\`).

### 1. Grouping with \`#region\` (Zero Boilerplate)
- Use C# \`#region GroupName\` ... \`#endregion\` to automatically group UI inputs.
- **Formatting Rules**:
  - \`#region GroupName\` goes IMMEDIATELY after the previous property (no blank line before).
  - ONE empty line AFTER \`#region GroupName\`.
  - Parameter structure: \`/// Description\` -> \`[Attribute]\` -> \`public T Prop { get; set; }\`.
  - If last property in group HAS an initializer (\`= value;\`), \`#endregion\` can follow immediately.
  - If last property DOES NOT end with \`;\` (rare), add ONE empty line before \`#endregion\`.
  - Description comments (\`///\`) go DIRECTLY above attributes (no blank line between them).

### 2. Supported Attributes & Types (Zero Boilerplate)
- **Automatic Types**: \`int\`, \`double\`, \`bool\`, \`string\`, and \`List<string>\` map to UI controls automatically.
- \`[RevitElements]\`: For Revit objects.
  - Dropdown: \`[RevitElements(TargetType="WallType")]\`
  - Filtered: \`[RevitElements(TargetType="FamilySymbol", Category="Doors")]\`
  - Multi-Select: \`[RevitElements(TargetType="WallType", MultiSelect=true)]\` (Use \`List<string>\`)
- \`[Select]\`: For interactive selection (Native Types supported).
  - \`[Select(SelectionType.Point)]\`: Use \`public XYZ StartPoint { get; set; }\`.
  - \`[Select(SelectionType.Edge)]\`: Use \`public Reference EdgeRef { get; set; }\`.
  - \`[Select(SelectionType.Face)]\`: Use \`public Reference FaceRef { get; set; }\`.
  - \`[Select(SelectionType.Element)]\`: Use \`public List<long> ElementIds { get; set; }\` (Supports Multi-Select).
- \`[Range(min, max, step)]\`: Forces a UI Slider.
- \`[Unit("unit")]\`: Handles input conversion (e.g. \`[Unit("mm")]\`). 
  - *Note*: Input is auto-converted to feet. Script ALWAYS sees Internal Units (Feet).
- \`[Required]\`: Marks input as mandatory.
- \`[Pattern("regex")]\`: Validates string input against a regex pattern.
- \`[EnabledWhen("PropName", "Value")]\`: Conditional enabling based on another parameter.
- \`[InputFile("csv,xlsx")]\`: Open File Dialog.
- \`[FolderPath]\`: Select Folder Dialog.
- \`[OutputFile("json")]\`: Save File Dialog.
- \`///\` or \`/// <summary>\`: Tooltip description (tagless style preferred).

### 3. Dynamic Logic (Conventions)
- **Magic Extraction**: For simple lists (e.g. All Rooms), DO NOT define a helper. Just use \`[RevitElements(TargetType="Room")]\`.
- **Custom Filtering**: Define \`_Options\` (returns \`List<string>\`) ONLY if you need specific filtering (e.g. "Rooms on Level 1").
- \`_Visible\` (returns \`bool\`): Show/Hide logic.
- \`_Enabled\` (returns \`bool\`): Enable/Disable logic.
- \`_Range\` (returns \`(double, double, double)\`): Dynamic slider limits (Min, Max, Step).
- \`_Unit\` (returns \`string\`): Dynamic unit string (e.g. based on another dropdown).

## Architecture & Modularization
- **Context**: This is a VSCode extension workspace. Scripts are in the \`Scripts\` folder.
- **Entry Point**: The main logic and top-level statements are in \`Main.cs\`.
- **Modularization (Optional)**: If the script is complex, you may create additional files:
  - \`Params.cs\`: The file containing \`Params\` **MUST** be named \`Params.cs\` (Case Sensitive).
  - \`Utils.cs\` (or similar): For helper classes. Use meaningful names, NOT \`module_X.cs\`.
- **Simple Scripts**: If the task is simple, keep everything in \`Main.cs\`. \`Params\` class MUST be at the bottom or in \`Params.cs\`.

## Revit 2025+ API Rules (CRITICAL)
1.  **ElementId**: **FORBIDDEN**: \`ElementId.IntegerValue\`. Use \`ElementId.Value\` (long) instead.
2.  **Geometry**:
    - \`Curve\` does NOT have \`GetBoundingBoxXYZ()\`. Use \`curve.GetEndPoint(0)\` and \`curve.GetEndPoint(1)\`.
    - Ensure curves are > 0.0026 ft before creation.
3.  **SpatialElementBoundaryOptions**: Does NOT have a \`BoundaryOffset\` property.
4.  **Floor.Create**:
    - **FORBIDDEN**: Overloads with \`XYZ normal\` are deprecated.
    - **CORRECT**: Use \`Floor.Create(Doc, profile, floorTypeId, levelId)\` for architectural floors.
    - **CORRECT**: Use \`Floor.Create(Doc, profile, floorTypeId, levelId, isStructural, null, 0.0)\` for structural floors.

## Coding Standards
1.  **Error Handling & Early Exits**: 
    - **CRITICAL**: Do not use the \`return\` keyword for early exits on errors.
    - Instead, \`throw new Exception("Clear error message")\`. 
    - This allows the Paracore engine to catch the failure and display an "Execution Failed" status in the UI.
2.  **Transactions & Fail-Fast**:
    - Use exactly one \`Transact("Name", () => { ... })\` block.
    - **FORBIDDEN**: \`Transact.Run\`, \`Transaction.Run\` or any other variations.
    - **FORBIDDEN**: Do NOT use \`Transact\` for read-only operations (filtering, selection).
    - **FORBIDDEN**: Do NOT use \`try-catch\` inside loops within a transaction.
    - Let exceptions propagate so the transaction rolls back automatically.
    - If one element fails, the whole batch should fail cleanly.
3.  **Unit Handling Rules**:
    -   **Input Parameters**: Do **NOT** manually convert input parameters to internal units if they have a \`[Unit("...")]\` attribute. The Engine automatically converts them to Internal Units (Feet) before your script runs.
        -   *Example:* If \`[Unit("mm")] public double Width { get; set; }\` is \`500\`, the script receives \`1.6404...\` (Feet). Use it directly.
    -   **Output/Display**: All Revit API geometry return values are in **Internal Units (Feet)**. If you need to display them in specific units (e.g. for \`Println\` or \`Table\`), you **MUST** convert them manually using \`UnitUtils.ConvertFromInternalUnits(...)\`.
4.  **Timeouts**:
    - Scripts default to a 10s timeout. If you expect long execution, call \`SetExecutionTimeout(seconds)\` at the start.

## Output Optimization & Visualization
- **Console**: Use \`Println($"Message {var}")\`. 
  - **WARNING**: Do NOT call \`Println\` inside loops within a \`Transact\` block (floods console).
- **Data Tables**: Use \`Table(IEnumerable data)\` to render interactive grids.
- **Charts**: 
  - \`ChartBar(object data)\`: Bar chart (Properties: name, value).
  - \`ChartPie(object data)\`: Pie chart (Properties: name, value).
  - \`ChartLine(object data)\`: Line chart (Properties: name, value).
- **Avoid** the ❌ emoji; use 🚫 or ⚠️.

## Casting & Filtering (CRITICAL)
- **ALWAYS** use \`.Cast<Type>()\` after \`FilteredElementCollector\`.
- **Use \`OfClass\`** for: \`Wall\`, \`WallType\`, \`Floor\`, \`Ceiling\`, \`RoofBase\`, \`FamilySymbol\`, \`Level\`, \`View\`, \`ViewSheet\`.
- **Use \`OfCategory\`** for: \`Room\` (OST_Rooms), \`Material\` (OST_Materials), \`Door Instance\` (OST_Doors), \`Window Instance\` (OST_Windows), \`Area\` (OST_Areas).
- **Example OfClass**: \`new FilteredElementCollector(Doc).OfClass(typeof(Wall)).Cast<Wall>();\`
- **Example OfCategory**: \`new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>();\`

## Implicit Globals (Do Not Import)
These are provided by the engine at runtime and available in **ALL FILES** (Main.cs, Params.cs, Utils.cs, etc.):
- \`Doc\`, \`UIDoc\`, \`UIApp\`
- \`Println\`, \`Table\`, \`ChartBar\`, \`ChartPie\`, \`ChartLine\`, \`Transact\`, \`SetExecutionTimeout\`
- \`System\`, \`System.Linq\`, \`System.Collections.Generic\`, \`System.Text.Json\`, \`Autodesk.Revit.DB\`, \`Autodesk.Revit.UI\` (Explicitly imported by engine. DO NOT re-import.)

## Required Imports (If Needed)
You MUST import specific sub-namespaces if you use types from them (e.g. \`Room\`, \`Wall\`, \`StructuralType\`):
\`\`\`csharp
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
\`\`\`

## Example Structure
\`\`\`csharp
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
    throw new Exception("🚫 Room not found.");
}

// 3. Execution
Transact("Add Note", () => {
    // DB modifications here
});

// 4. Classes (MUST BE LAST)
public class Params {
    #region Basic Settings
    
    /// Description for the first parameter.
    [Required]
    public string ParameterOne { get; set; } = "Default";
    
    /// Multi-line descriptions use three slashes per line.
    /// This is the second line of the description.
    [Range(1, 10, 1)]
    public int Counter { get; set; } = 5;
    
    #endregion
    #region Geometry
    
    /// Wall type selection. The engine generates the dropdown.
    [RevitElements(TargetType = "WallType")]
    public string WallTypeName { get; set; }
    
    /// Unit is auto-converted to Feet. Script sees internal units.
    [Unit("mm")]
    public double Offset { get; set; } = 500;
    
    /// Native XYZ Support
    [Select(SelectionType.Point)]
    public XYZ StartPoint { get; set; }
    
    #endregion
}
\`\`\`
`;
;