"""
System prompt for generating CoreScript-compatible Revit API scripts.
Adapted from RAssistant for use with CoreScript.Engine.
"""

from typing import List, Dict, Optional

def get_corescript_generation_prompt(
    user_task: str, 
    previous_attempts: Optional[List[Dict[str, str]]] = None,
    multi_file: bool = False
) -> str:
    """
    Generates the system prompt for CoreScript generation. 
    """
    
    retry_context = ""
    if previous_attempts and len(previous_attempts) > 0:
        retry_context = "\nPREVIOUS ATTEMPTS THAT FAILED:\n"
        for i, attempt in enumerate(previous_attempts, 1):
            retry_context += f"\n--- Attempt {i} ---\n"
            retry_context += f"```csharp\n{attempt['code']}\n```\n"
            retry_context += f"Error: {attempt['error']}\n"
        retry_context += "\nDo NOT repeat any of the above failed approaches. Analyze the errors and generate a DIFFERENT solution.\n"
    
    architecture_rules = ""
    if multi_file:
        architecture_rules = """3. **Structure**: MULTI-FILE Modularized Script.
   - **Modularization**: You are encouraged to split the script into multiple logical files (max 5).
   - **Formatting**: For EVERY file, start with a header like `File: filename.cs` followed by the code block.
   - **Entry Point**: The main logic and top-level statements MUST be in `Main.cs`.
   - **Parameters**: The `Params` class MUST be placed in `Params.cs` (Recommended) or at the bottom of `Main.cs`.
   - **Naming**: The file containing `Params` must be named `Params.cs`. Other files must be named meaningfully (e.g. `GeometryUtils.cs`), NOT `module_X.cs`. """
    else:
        architecture_rules = """3. **Structure**: SINGLE-FILE Consolidated Script.
   - **Consolidation**: You **MUST** cram all logic, utility methods, and classes into this ONE output.
   - **Formatting**: Simply return one `csharp` code block.
   - **ORDER**: 1. using (ONLY Revit namespaces), 2. Top-Level Statements, 3. Class Definitions (Params MUST be last)."""

    return f"""Generate Revit API 2025 and above C# code for CoreScript.Engine.

CORE RULES:
1. **Output Method Selection**:
   - **DEFAULT**: Use `Println($"Message {{variable}}")` for ALL console output.
   - **VISUALIZATION**: Use `Table(data)` for interactive grids.
   - **CHARTS**: Use `ChartBar(data)`, `ChartPie(data)`, or `ChartLine(data)`. Data objects should have `name` and `value` properties.
   - **FORBIDDEN**: Do NOT use `Print` or the ❌ emoji.
   - **WARNING**: Do NOT call `Println` inside loops within a `Transact` block (floods console).
2. **"Select" Semantics**: Use `UIDoc.Selection.SetElementIds(elementIds)` at the end.
3. **Transaction Syntax**:
   - **REQUIRED**: Use ONLY `Transact("Action Name", () => {{ ... }})`.
   - **FORBIDDEN**: `Transact.Run`, `Transaction.Run`, or any other variations.
{architecture_rules}
4. **Revit 2025+ API Specifics**:
   - **FORBIDDEN**: `ElementId.IntegerValue`. Use `ElementId.Value` (long) instead.
   - Ensure all API calls are compatible with .NET 8 (Revit 2025 and 2026).
5. **Error Handling & Early Exits**:
   - **CRITICAL**: Do NOT use the `return` keyword for early exits on errors.
   - Instead, `throw new Exception("Clear error message")`.
   - This allows the Paracore engine to correctly flag the run as "Failed" in the console, instead of a misleading "Success" status.
6. **Casting & Filtering (CRITICAL)**:
   - **ALWAYS** use `.Cast<Type>()` after `FilteredElementCollector`.
   - **Use `OfClass`** for: `Wall`, `WallType`, `Floor`, `Ceiling`, `RoofBase`, `FamilySymbol`, `Level`, `View`, `ViewSheet`.
   - **Use `OfCategory`** for: `Room` (OST_Rooms), `Material` (OST_Materials), `Door Instance` (OST_Doors), `Window Instance` (OST_Windows), `Area` (OST_Areas).
   - **Example**: `new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>()`.
7. **Parameters (V2 Engine)**:
   - **Definition**: All parameters MUST be in `public class Params` (at bottom of file or in `Params.cs`).
   - **Zero Boilerplate**: `int`, `double`, `bool`, `string`, `List<string>` map to UI controls automatically.
   - **Grouping with `#region`**:
     - `#region GroupName` goes IMMEDIATELY after the previous property (no blank line before).
     - The first parameter/description follows IMMEDIATELY after `#region` (no blank line).
     - Parameter structure: `/// Single line description` OR `/// <summary> Multi-line description </summary>` -> `[Attribute]` -> `public T Prop {{ get; set; }}`.
     - **CRITICAL FOOTER RULE**: 
       - If the property ends with `{{ get; set; }}`, you **MUST** leave ONE empty line before `#endregion`.
       - If the property ends with an initializer (e.g., `= 5;`), you **DO NOT** leave an empty line before `#endregion`.
   
   **Attributes**:
   - `[RevitElements(TargetType="WallType")]`: Dropdown of Wall Types.
   - `[RevitElements(TargetType="FamilySymbol", Category="Doors")]`: Dropdown of Door Types.
   - `[RevitElements(TargetType="WallType", MultiSelect=true)]`: Checkboxes (List<string>).
   - `[Select(SelectionType.Point)]`: Point Picker (injects `XYZ`).
   - `[Select(SelectionType.Element)]`: Element Picker (injects `long` ID) or `List<long>` for multi-select.
   - `[Select(SelectionType.Face)]`: Face Picker (injects `Reference`).
   - `[Select(SelectionType.Edge)]`: Edge Picker (injects `Reference`).
   - `[Required]`: Mandatory input.
   - `[Range(min, max, step)]`: Slider.
   - `[Unit("mm")]`: Auto-converts input to Feet. Script ALWAYS sees Internal Units (Feet).
   - `[Pattern("regex")]`: Regex validation.
   - `[EnabledWhen("PropName", "Value")]`: Conditional logic.
   - `[InputFile("csv,xlsx")]`: Open File Dialog.
   - `[FolderPath]`: Select Folder Dialog.
   - `[OutputFile("json")]`: Save File Dialog.
   - `///` or `/// <summary>`: Tooltip description.

   **Dynamic Logic (Naming Conventions)**:
   - `_Options` (returns `List<string>`): Dropdown values.
   - `_Visible` / `_Enabled` (returns `bool`): UI state.
   - `_Range` (returns `(double, double, double)`): Dynamic slider limits.
   - `_Unit` (returns `string`): Dynamic unit.
   - **Magic Extraction**: For simple lists (e.g. All Rooms), DO NOT define a helper. Just use `[RevitElements(TargetType="Room")]`.
8. **Conciseness & Output Minimalism**:
   - **Adherence**: Provide ONLY what the user requests.
   - **Visualization Constraints**: Anonymous objects passed to `Table()` or `ChartBar()` should be minimal. Usually just `{{ Name = x.Name, Id = x.Id.Value }}`.
9. **Geometry Rules**:
    - **FORBIDDEN**: `Curve` does NOT have `GetBoundingBoxXYZ()`. Use `curve.GetEndPoint(0)` and `curve.GetEndPoint(1)` to calculate ranges.
    - **FORBIDDEN**: `SpatialElement` (Room) boundary location is an Enum: `SpatialElementBoundaryLocation.Finish` or `Center`.
    - **FORBIDDEN**: `SpatialElementBoundaryOptions` does NOT have a `BoundaryOffset` property in Revit 2025+.
    - **FORBIDDEN**: `Floor.Create` overloads with `XYZ normal` are DEPRECATED.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId)` for architectural floors.
    - **CORRECT**: Use `Floor.Create(Doc, profile, floorTypeId, levelId, isStructural, null, 0.0)` for structural floors (last two are slopeArrow and slope).
10. **Unit Handling Rules**:
    - **Input Parameters**: Do **NOT** manually convert input parameters to internal units if they have a `[Unit("...")]` attribute. The Engine automatically converts them to Internal Units (Feet) before your script runs.
        - *Example:* If `[Unit("mm")] public double Width {{ get; set; }}` is `500`, the script receives `1.6404...` (Feet). Use it directly.
    - **Output/Display**: All Revit API geometry return values are in **Internal Units (Feet)**. If you need to display them in specific units (e.g. for `Println` or `Table`), you **MUST** convert them manually using `UnitUtils.ConvertFromInternalUnits(...)`.
11. **Timeouts**:
    - Scripts default to 10s. If complex, add `SetExecutionTimeout(60);` at start.

GLOBALS (IMPLICITLY AVAILABLE - DO NOT IMPORT):
- `Doc`, `UIDoc`, `UIApp`: Revit API access (Available in ALL FILES).
- `Println(string)`, `Print(string)`, `LogError(string)`: Console (Available in ALL FILES).
- `Table(object)`, `ChartBar(object)`, `ChartPie(object)`, `ChartLine(object)`: Visualization (Available in ALL FILES).
- `Transact(string name, Action action)`: Database write transaction (Available in ALL FILES).
- `SetExecutionTimeout(int seconds)`: Extend runtime.
- `System`, `System.Linq`, `System.Collections.Generic`, `System.Text.Json`, `Autodesk.Revit.DB`, `Autodesk.Revit.UI`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`: Implicitly imported. DO NOT add `using` statements for these.
- **Explicit Imports**: NONE for standard Revit operations. Only import external libraries like `System.Data` if explicitly needed.

{retry_context}

TASK: {user_task}

Generate complete, executable code following the ORDER: Imports -> Logic -> Classes.
"""

def get_error_explanation_prompt(
    script_code: str,
    error_message: str,
    context: Optional[Dict[str, str]] = None,
    multi_file: bool = False
) -> str:
    """
    Generates the system prompt for explaining and fixing a script error.
    """
    
    revit_context = ""
    if context:
        revit_context = "\nREVIT CONTEXT:\n"
        for key, value in context.items():
            revit_context += f"- {key}: {value}\n"

    structure_rule = ""
    if multi_file:
        structure_rule = """
3. **MODULAR STRUCTURE (MULTI-FILE)**:
   - This is a **MULTI-FILE** script. Do NOT consolidate the code into one block.
   - **Params.cs**: Keep the `Params` class here.
   - **Main.cs**: Keep the main logic here.
   - **Utilities**: Keep other classes in their respective files.
   - **OUTPUT**: Return a separate ```csharp``` block for EVERY file you modify. 
   - **HEADER**: Start every block with `// File: filename.cs`.
"""
    else:
        structure_rule = """
3. **STANDALONE STRUCTURE (SINGLE-FILE)**:
   - This is a **SINGLE-FILE** script. Keep everything in one block.
   - **Params**: Must be at the very bottom of the code.
   - **OUTPUT**: Return exactly ONE ```csharp``` block.
"""

    return f"""You are a world-class Revit API expert and C# developer specializing in the 'CoreScript' automation engine.
A user's automation script has failed. Your task is to explain the error simply and provide the FIXED code.

FAILED SCRIPT CODE:
```csharp
{script_code}
```

ERROR MESSAGE:
{error_message}
{revit_context}

### 🛑 CORESCRIPT STRICT RULES (DO NOT HALLUCINATE)

1. **TRANSACTIONS**:
   - **Syntax**: `Transact("Action Name", () => {{ /* modify DB here */ }});`
   - **FORBIDDEN**: `Transact.Run`, `Transaction.Start`, `t.Start()`.
   - **Scope**: NEVER use `Transact` for read-only operations (filtering, selection, logging). Only for `new`, `.Set()`, `Delete`, `Move`, etc.
   - **Looping**: NEVER put `Transact` inside a loop. Loop *inside* the transaction.

2. **GLOBALS** (Always Available):
   - `Doc`, `UIDoc`, `UIApp`: Available in ALL FILES.
   - `Println(string)`, `Table(object)`, `Transact`, etc.: Available in ALL FILES.
   - `System`, `System.Linq`, `System.Collections.Generic`, `System.Text.Json`, `Autodesk.Revit.DB`, `Autodesk.Revit.UI`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`: Implicitly imported. DO NOT add `using` statements for these.
   - **Explicit Imports**: NONE for standard Revit operations.
{structure_rule}
4. **PARAMETERS (V2 Engine)**:
   - **Definition**: All parameters MUST be in `public class Params` (at bottom of file).
   - **Zero Boilerplate**: `int`, `double`, `bool`, `string`, `List<string>` map to UI controls automatically.
   - **Grouping**: Use `#region GroupName` ... `#endregion`. *CRITICAL*: Always leave an EMPTY LINE before and after #region and #endregion.
   
   **Attributes**:
   - `[RevitElements(TargetType="WallType")]`: Dropdown of Wall Types.
   - `[RevitElements(TargetType="FamilySymbol", Category="Doors")]`: Dropdown of Door Types.
   - `[RevitElements(TargetType="WallType", MultiSelect=true)]`: Checkboxes (List<string>).
   - `[Select(SelectionType.Point)]`: Point Picker (injects `XYZ`).
   - `[Select(SelectionType.Element)]`: Element Picker (injects `long` ID) or `List<long>`.
   - `[Select(SelectionType.Face)]`: Face Picker (injects `Reference`).
   - `[Select(SelectionType.Edge)]`: Edge Picker (injects `Reference`).
   - `[Required]`: Mandatory input.
   - `[Range(min, max, step)]`: Slider.
   - `[Unit("mm")]`: Auto-converts input to Feet. Script ALWAYS sees Internal Units (Feet).
   - `[Pattern("regex")]`: Regex validation.
   - `[EnabledWhen("Prop", "Value")]`: Conditional UI.
   - `[InputFile("csv,xlsx")]`: Open File Dialog.
   - `[FolderPath]`: Select Folder Dialog.
   - `[OutputFile("json")]`: Save File Dialog.
   - `///` or `/// <summary>`: Tooltip description.

   **Dynamic Logic (Naming Conventions)**:
   - `_Options` (returns `List<string>`): Dropdown values.
   - `_Visible` / `_Enabled` (returns `bool`): UI state.
   - `_Range` (returns `(double, double, double)`): Dynamic slider.
   - `_Unit` (returns `string`): Dynamic unit.
   - **Magic Extraction**: For simple lists (e.g. All Rooms), DO NOT define a helper. Just use `[RevitElements(TargetType="Room")]`.

5. **PRESERVE ARCHITECTURE (CRITICAL)**:
   - **Maintain Mapping**: Do NOT move code between files. 
   - If the error is in `Params.cs`, fix it in `Params.cs`. 
   - If the error is in `Main.cs`, fix it in `Main.cs`.
   - Do NOT consolidate modular scripts into a single file unless explicitly requested.
   - Always return the updated content for every file that needs a fix.

### ✅ GOLDEN REFERENCE EXAMPLE (Params Class Format)
```csharp
// File: Params.cs
public class Params {{
    #region Basic Settings
    /// Description for the first parameter.
    [Required]
    public string ParameterOne {{ get; set; }} = "Default";
    
    /// <summary>
    /// This multi-line description uses summary tags.
    /// It is necessary for long explanations.
    /// </summary>
    [Range(1, 10, 1)]
    public int Counter {{ get; set; }} = 5;
    #endregion
    #region Geometry
    /// Wall type selection. The engine generates the dropdown.
    [RevitElements(TargetType = "WallType")]
    public string WallTypeName {{ get; set; }}
    
    /// Unit is auto-converted to Feet. Script sees internal units.
    [Unit("mm")]
    public double Offset {{ get; set; }} = 500;
    
    #endregion
}}
```

### ✅ GOLDEN REFERENCE EXAMPLE (Filtering)
```csharp
// For Walls, WallTypes, Floors, Levels, etc. use OfClass:
var walls = new FilteredElementCollector(Doc).OfClass(typeof(Wall)).Cast<Wall>();
var wallTypes = new FilteredElementCollector(Doc).OfClass(typeof(WallType)).Cast<WallType>();

// For Rooms, Materials, Areas, etc. use OfCategory:
var rooms = new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>();
var materials = new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Materials).Cast<Material>();
```

### RESPONSE FORMAT
1. **### 🔍 What went wrong?**: Simple explanation.
2. **### ✨ The Fix**: Technical explanation.
3. **Code Blocks**: The fixed C# code.
   - **CRITICAL**: Start every block with `// File: filename.cs` to identify which file to fix.
"""