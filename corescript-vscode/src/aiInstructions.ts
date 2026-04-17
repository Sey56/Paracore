export const COPILOT_INSTRUCTIONS = "# Script Context: Paracore Tool Project\n" +
"# All logic goes into the Scripts/ folder.\n" +
"# Modularization is optional. If simple, keep everything in the entry file. \n" +
"# If complex, create helper files like Utils.cs, Params.cs, etc.\n" +
"# PARAMETER GROUPING: use #region GroupName directives to organize parameters.\n" +
"\n" +
"# Paracore Scripting Reference\n" +
"\n" +
"Generate C# Revit API scripts for the Paracore / CoreScript.Engine runtime.\n" +
"\n" +
"## Code Structure (STRICT ORDER)\n" +
"\n" +
"Scripts use **Top-Level Statements**. The order is mandatory:\n" +
"\n" +
"```\n" +
"1. using statements\n" +
"2. Top-level logic (var p = new Params(); queries, Transact blocks, output)\n" +
"3. Top-level helper methods (if needed)\n" +
"4. Class definitions (Params class MUST be LAST)\n" +
"```\n" +
"\n" +
"## Available Globals\n" +
"\n" +
"| Global | Type | Purpose |\n" +
"|--------|------|---------|\n" +
"| `Doc` | Document | Active Revit document |\n" +
"| `UIDoc` | UIDocument | UI document for selections |\n" +
"| `UIApp` | UIApplication | Revit application |\n" +
"| `Println(msg)` | void | Print to Console tab |\n" +
"| `Print(msg)` | void | Print without newline |\n" +
"| `Transact(\"Name\", () => { })` | void | Wrap modifications in a transaction |\n" +
"| `Table(data)` | void | Render data as a sortable table in the Table tab |\n" +
"| `BarChart(data)` | void | Render a bar chart in the Summary tab |\n" +
"| `PieChart(data)` | void | Render a pie chart in the Summary tab |\n" +
"| `LineChart(data)` | void | Render a line chart in the Summary tab |\n" +
"| `Show(data)` | void | **Coordination Only**: Renders Clash Grid + 3D Helpers focus |\n" +
"| `SetExecutionTimeout(seconds)` | void | Extend the default 10s timeout |\n" +
"| `GetElement<T>(name)` | T? | Find a Revit element by its Name |\n" +
"| `GetElements<T>()` | List<T> | Get all elements of type T in the document |\n" +
"| `Watchdog(action)` | void | **SENTINEL ONLY**: Wrapper for background monitoring logic |\n" +
"| `WatchdogReport(msg, status, ids)` | void | **SENTINEL ONLY**: Push a report (\"success\",\"warning\",\"error\") with optional List<ElementId>? ids |\n" +
"\n" +
"### 🛡️ Coordination & Clash Audit (Element Collections)\n" +
"| Method | Purpose |\n" +
"|--------|---------|\n" +
"| `.AuditClashes(targetCat)` | Detect every intersection with target category |\n" +
"| `.AuditClashes(cat, tol, vol, help)` | **Pro**: `tol`=\"10mm\", `vol`=bool, `help`=bool (renders 3D red helpers) |\n" +
"| `.InProjectUnits()` | Transforms result coordinates/volumes to Active Project Units |\n" +
"| `.Show()` | **Preferred Output**: Coordination Grid + Automated 3D Focus |\n" +
"\n" +
"### Door & Window Extensions (FamilyInstance)\n" +
"| Method | Type | Purpose |\n" +
"|--------|------|---------|\n" +
"| `RoomTo()` | string | Name of the room the door opens INTO (latest phase) |\n" +
"| `RoomFrom()` | string | Name of the room the door opens FROM (latest phase) |\n" +
"| `HingeSide()` | string | \"Left\" or \"Right\" hinge location (from FromRoom side) |\n" +
"| `Handing()` | string | Industry code: LH, RH, LHR, RHR |\n" +
"| `IsHandFlipped()` | bool | Returns true if hand is flipped from family default |\n" +
"| `IsFacingFlipped()` | bool | Returns true if face is flipped from family default |\n" +
"\n" +
"## Implicit Using Statements\n" +
"\n" +
"These namespaces are available without explicit `using`:\n" +
"`System`, `System.Collections.Generic`, `System.Linq`, `System.Text.Json`,\n" +
"`Autodesk.Revit.DB`, `Autodesk.Revit.DB.Architecture`, `Autodesk.Revit.DB.Structure`, `Autodesk.Revit.UI`,\n" +
"`CoreScript.Engine.Globals`\n" +
"\n" +
"## Params Class (THE ONLY PARAMETER SOURCE)\n" +
"\n" +
"All user-configurable values MUST go in `public class Params` at the bottom of the file. \n" +
"\n" +
"**STRICT RULES FOR PARAMETERS:**\n" +
"1. **SINGLE SOURCE**: `Params` is the ONLY class the engine scans for UI parameters.\n" +
"2. **NO NESTING**: Properties in `Params` must be flat. Do NOT put other classes or objects inside `Params`.\n" +
"3. **ISOLATION**: Other user-defined classes (e.g., `public class HelperData`) MUST NOT contain properties with Paracore attributes (`[Unit]`, `[Select]`, etc.). They will be ignored and may cause errors.\n" +
"4. **INSTANTIATION**: Instantiate it at the top: `var p = new Params();`\n" +
"5. **ACCESS**: Access values via the instance: `p.MyLevel`, never `Params.MyLevel`.\n" +
"\n" +
"### Basic Property Types\n" +
"\n" +
"| C# Type | UI Control | Default Example |\n" +
"|---------|-----------|-----------------|\n" +
"| `string` | Text input | `= \"My Value\"` |\n" +
"| `int` | Numeric field | `= 5` |\n" +
"| `double` | Numeric field | `= 3.2` |\n" +
"| `bool` | Toggle switch | `= true` |\n" +
"\n" +
"### Revit Element Types (Magic Hydration)\n" +
"\n" +
"Use Revit types directly — the engine auto-discovers all instances/types and populates a dropdown:\n" +
"\n" +
"| C# Type | What appears in UI |\n" +
"|---------|--------------------|\n" +
"| `Level` | Dropdown of all levels |\n" +
"| `WallType` | Dropdown of all wall types |\n" +
"| `Wall` | Dropdown of all wall instances |\n" +
"| `Material` | Dropdown of all materials |\n" +
"| `FamilySymbol` | Dropdown of all family types |\n" +
"| `FamilyInstance` | Dropdown of all family instances |\n" +
"| `ViewSheet` | Dropdown of all sheets |\n" +
"| `View` | Dropdown of all views |\n" +
"| Any `Element` subclass | Auto-discovered dropdown |\n" +
"| Any `ElementType` subclass | Auto-discovered dropdown |\n" +
"\n" +
"**Lists** create multi-select checkboxes: `List<Wall>`, `List<Level>`, etc.\n" +
"\n" +
"### Revit Enum Types\n" +
"\n" +
"Use Revit enums directly — all enum values are listed in a searchable dropdown:\n" +
"\n" +
"```csharp\n" +
"public BuiltInParameter TargetParam { get; set; }\n" +
"public BuiltInCategory TargetCategory { get; set; }\n" +
"```\n" +
"\n" +
"### Supported Attributes\n" +
"\n" +
"| Attribute | Purpose | Example |\n" +
"|-----------|---------|---------|\n" +
"| `[Unit(\"key\")]` | Metric-to-Feet conversion | `[Unit(\"mm\")] public double Width { get; set; } = 250;` |\n" +
"| `[Range(min, max, step)]` | Slider with bounds | `[Range(0, 100, 5)] public int Count { get; set; } = 10;` |\n" +
"| `[Required]` | Mark as mandatory | `[Required] public Level BaseLevel { get; set; }` |\n" +
"| `[Confirm(\"TEXT\")]` | Safety lock for destructive ops | `[Confirm(\"DELETE\")] public string Confirm { get; set; }` |\n" +
"| `[Select(SelectionType.Element)]` | Pick from Revit viewport | `[Select(SelectionType.Element)] public Wall MyWall { get; set; }` |\n" +
"| `[Select(SelectionType.Point)]` | Pick a point in Revit | `[Select(SelectionType.Point)] public XYZ Origin { get; set; }` |\n" +
"| `[EnabledWhen(nameof(Prop), \"value\")]` | Conditional enable | `[EnabledWhen(nameof(ShowAdvanced), \"true\")]` |\n" +
"| `[RevitElements(Category = \"Doors\")]` | Filter by Revit category | On `FamilyInstance` or `List<FamilyInstance>` properties |\n" +
"| `[InputFile(\"csv, xlsx\")]` | Open File dialog | `[InputFile(\"csv\")] public string DataPath { get; set; }` |\n" +
"| `[OutputFile(\"xlsx\")]` | Save File dialog | `[OutputFile(\"xlsx\")] public string ExportPath { get; set; }` |\n" +
"| `[FolderPath]` | Folder Browser dialog | `[FolderPath] public string BackupFolder { get; set; }` |\n" +
"| `[Color]` | Color swatch picker | `[Color] public string HighlightColor { get; set; } = \"#3B82F6\";` |\n" +
"| `[Stepper]` | +/- buttons for integers | `[Stepper] public int Iterations { get; set; } = 10;` |\n" +
"| `[Segmented]` | Horizontal button group | `[Segmented] public string Mode { get; set; } = \"Preview\";` |\n" +
"\n" +
"**STRICT UNIT REALITY (IMPORTANT):**\n" +
"Revit's internal units are ALWAYS **Feet** (Decimal Feet, Square Feet, Cubic Feet).\n" +
"1. **NO [Unit] FOR IMPERIAL**: If the user wants Feet, Square Feet, or Cubic Feet, **DO NOT** use the `[Unit]` attribute. It is redundant and forbidden.\n" +
"2. **SUPPORTED KEYS ONLY**: The engine ONLY supports these Metric/Conversion keys: `mm`, `cm`, `m`, `in`, `m2` (or `sqm`), `m3` (or `cum`).\n" +
"3. **NO HALLUCINATIONS**: Never use `sf`, `sq`, `ft`, `ft2`, `sqft` or other custom keys. \n" +
"4. **PURPOSE**: `[Unit]` is exclusively for Metric shielding.\n" +
"\n" +
"### Specialized Door/Window Accessors (Stable Orientation)\n" +
"Revit's native `ToRoom`/`FromRoom` properties are inconsistent. Use these stable Paracore helpers:\n" +
"- `.RoomAccess()`: (Stable) Returns the room name on the non-swing side (The source/exterior).\n" +
"- `.RoomDestination()`: (Stable) Returns the room name the door swings INTO.\n" +
"- `.Handing()`: (Stable) Returns \"LH\", \"RH\", \"LHR\", or \"RHR\" regardless of flips.\n" +
"- `.HingeSide()`: (Stable) Returns \"Left\" or \"Right\" as seen from the Access room.\n" +
"- `.IsHandFlipped()` / `.IsFacingFlipped()`: Raw orientation booleans.\n" +
"\n" +
"### Data Providers (Suffix Conventions)\n" +
"\n" +
"Define a companion property or method with the `_Suffix\" naming convention:\n" +
"\n" +
"| Suffix | Purpose | Example |\n" +
"|--------|---------|---------|\n" +
"| `_Options` | Custom dropdown items | See below |\n" +
"| `_Visible\" | Conditional visibility | `public bool ShowAdvanced_Visible => IsActive;` |\n" +
"| `_Range\" | Dynamic range values | `public (double, double, double) Count_Range => (1, 100, 1);` |\n" +
"\n" +
"#### _Options: Custom Data Provider (IMPORTANT)\n" +
"\n" +
"When the engine's auto-discovery is too broad, define custom filtered options:\n" +
"\n" +
"```csharp\n" +
"// The parameter — a dropdown of walls\n" +
"public Wall TargetWall { get; set; }\n" +
"\n" +
"// Custom filter — only show walls with \"Generic\" in the name\n" +
"public List<Wall> TargetWall_Options => new FilteredElementCollector(Doc)\n" +
"    .OfClass(typeof(Wall)).Cast<Wall>()\n" +
"    .Where(w => w.Name.Contains(\"Generic\")).ToList();\n" +
"```\n" +
"\n" +
"For string dropdowns with `[Segmented]`:\n" +
"```csharp\n" +
"[Segmented]\n" +
"public string Mode { get; set; } = \"Preview\";\n" +
"public List<string> Mode_Options => [\"Preview\", \"Commit\", \"Audit\"];\n" +
"```\n" +
"\n" +
"### Formatting Rules\n" +
"\n" +
"- Group related parameters with `#region GroupName` / `#endregion`\n" +
"- One empty line above `#region` and `#endregion`\n" +
"- One empty line between each property for readability\n" +
"- Use `/// Short description` for one-liners\n" +
"- Use `/// <summary>Multi-line description</summary>` for longer docs\n" +
"\n" +
"## Coding Rules\n" +
"\n" +
"1. **Transactions**: One `Transact(\"Name\", () => { ... })` block. All modifications inside.\n" +
"2. **Sentinels (Watchdogs)**: If the user asks for background monitoring or a \"Sentinel\", wrap the logic in `Watchdog(() => { ... });`. Use `WatchdogReport(msg, status)` to send feedback (\"success\", \"warning\", \"error\").\n" +
"3. **No Async**: NEVER use `await` or `async`. Scripts run in a synchronous UI thread.\n" +
"4. **Target Existing File**: Write ALL code in the existing .cs file provided in the context (e.g. `MyScript.cs`). NEVER create `Script.cs` or other new files.\n" +
"5. **Early Exits**: Use `throw new Exception(\"message\")` instead of top-level `return`.\n" +
"6. **ElementId**: `ElementId.IntegerValue\" is FORBIDDEN in Revit 2025+. Use `ElementId.Value` (long).\n" +
"7. **Safety Locks**: For destructive operations (Delete, Overwrite), MUST use `[Confirm(\"DELETE\")]`.\n" +
"8. **Unit suffix shorthand**: Name parameters with `_mm`, `_cm\", `_m`, `_ft\", `_in` for auto unit detection.\n" +
"\n" +
"## Complete Example\n" +
"\n" +
"```csharp\n" +
"using Autodesk.Revit.DB;\n" +
"\n" +
"var p = new Params();\n" +
"\n" +
"// 1. Query\n" +
"var walls = new FilteredElementCollector(Doc)\n" +
"    .OfClass(typeof(Wall)).Cast<Wall>()\n" +
"    .Where(w => w.LevelId == p.TargetLevel.Id).ToList();\n" +
"\n" +
"// 2. Visualize\n" +
"Table(walls.Select(w => new { Name = w.Name, Length = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() }));\n" +
"Println($\"Found {walls.Count} walls on {p.TargetLevel.Name}\");\n" +
"\n" +
"// 3. Modify (if needed)\n" +
"if (p.ApplyChanges)\n" +
"{\n" +
"    Transact(\"Update Walls\", () =>\n" +
"    {\n" +
"        foreach (var wall in walls)\n" +
"        {\n" +
"            wall.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set(p.NewMark);\n" +
"        }\n" +
"    });\n" +
"    Println($\"Updated {walls.Count} wall marks to '{p.NewMark}'\");\n" +
"}\n" +
"\n" +
"// ---------------------------------------------------------\n" +
"// PARAMS (MUST BE LAST)\n" +
"// ---------------------------------------------------------\n" +
"public class Params\n" +
"{\n" +
"    #region Target\n" +
"\n" +
"    /// Select the level to filter walls\n" +
"    public Level TargetLevel { get; set; }\n" +
"\n" +
"    #endregion\n" +
"\n" +
"    #region Action\n" +
"\n" +
"    /// Set a new mark value for all walls on the selected level\n" +
"    public string NewMark { get; set; } = \"UPDATED\";\n" +
"\n" +
"    /// Toggle to apply changes\n" +
"    public bool ApplyChanges { get; set; } = false;\n" +
"\n" +
"    #endregion\n" +
"}\n" +
"```\n" +
"\n" +
"## Sentinel (Watchdog) Example\n" +
"\n" +
"```csharp\n" +
"using Autodesk.Revit.DB;\n" +
"\n" +
"Watchdog(() => \n" +
"{\n" +
"    var p = new Params();\n" +
"\n" +
"    // 1. Audit Logic\n" +
"    var elements = new FilteredElementCollector(Doc)\n" +
"        .OfCategory(p.TargetCategory)\n" +
"        .WhereElementIsNotElementType()\n" +
"        .ToElements();\n" +
"\n" +
"    var breachCount = elements.Count(e => e.Name.Contains(\"TEMP\"));\n" +
"\n" +
"    // 2. Report\n" +
"    if (breachCount > 0)\n" +
"    {\n" +
"        WatchdogReport($\"Found {breachCount} temporary elements.\", \"warning\");\n" +
"    }\n" +
"    else\n" +
"    {\n" +
"        WatchdogReport(\"Compliance verified.\", \"success\");\n" +
"    }\n" +
"});\n" +
"\n" +
"public class Params\n" +
"{\n" +
"    public BuiltInCategory TargetCategory { get; set; } = BuiltInCategory.OST_Walls;\n" +
"}\n" +
"```\n";
