# Minimalist templates for Pure Paracore Top-Level Scripting
# Usings are handled by GlobalUsings in the workspace.

ARCHETYPES = {
    "raw_injection": "// __INJECT_QUERY_BLOCK__",
    "ProjectAuditor": """// 1. Query & Setup
Params p = new();

// Visual Query Injection
// __INJECT_QUERY_BLOCK__

public class Params
{
    #region Generated Parameters
    #endregion
}
""",

    "SelectionSurgeon": """// 1. Query & Setup
Params p = new();

// Visual Query Injection
// __INJECT_QUERY_BLOCK__

public class Params
{
    #region Generated Parameters
    #endregion
}
""",

    "blank": """/*
DocumentType: Project
Categories: Template
Author: Paracore Team
Dependencies: RevitAPI 2025+, Paracore.Addin

Description:
This is a top level statement script. Doc, UIDoc, Transact, Println,...
are accessible everywhere in this script or other scripts in the Scripts folder

*/

Params p = new();
string userName = Doc.Application.Username;

Println($"{p.Greeting} {userName}");
Println($"Selected WallType name is: {p.CurrentWallTypes?.Name}");

public class Params
{
    #region parameters

    /// Greeting message
    public string Greeting { get; set; } = "Welcome to Paracore!";

    /// <summary>
    /// Click the compute button and select 
    /// a wall type from the dropdown
    /// </summary>
    public WallType? CurrentWallTypes { get; set; }

    #endregion
}
""",

    "BIMWatchdog": """// 1. Query & Setup
Params p = new();

// BIM Watchdog: Runs in the background every 10 seconds
Watchdog((doc) => {
    var walls = new FilteredElementCollector(doc)
        .OfCategory(BuiltInCategory.OST_Walls)
        .WhereElementIsNotElementType()
        .ToElements();
    
    var invalidWalls = walls.Where(w => string.IsNullOrEmpty(w.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString())).ToList();
    
    if (invalidWalls.Count > 0)
    {
        // Visual Reporting: This powers the pulsing badge in the TopBar
        WatchdogReport($"Found {invalidWalls.Count} walls missing Mark values", "warning", invalidWalls.Select(w => w.Id).ToList());
    }
    else
    {
        WatchdogReport("All walls have valid Mark values", "success");
    }
}, 10);

Println("BIM Watchdog active. Guardian badge enabled in TopBar.");

public class Params
{
}
""",

    "ExcelLink": """// 1. Query & Setup
Params p = new();

// Excel sync logic here

public class Params
{
}
""",

    "BlankSentinel": """/*
DocumentType: Project
Categories: Template
Author: Paracore Team
Dependencies: RevitAPI 2025+, Paracore.Addin

Description:
A template sentinel script structure
*/
Watchdog(() =>
{
    Params p = new();

    // Sentinel Logic here
    IList<Element> elements = new FilteredElementCollector(Doc)
        .OfCategory(p.SelectedCategory)
        .WhereElementIsNotElementType()
        .ToElements();

    WatchdogReport($"Found {elements.Count} elements", "success");
    
    Println($"Found {elements.Count} elements");
});

public class Params
{
    #region Generated Parameters

    [Segmented]
    public BuiltInCategory SelectedCategory { get; set; } = BuiltInCategory.OST_Walls; // default selection
    public List<BuiltInCategory> SelectedCategory_Options => 
     [
        BuiltInCategory.OST_Walls,
        BuiltInCategory.OST_Windows,
        BuiltInCategory.OST_Doors,
        BuiltInCategory.OST_Rooms,
    ];

    #endregion
}
"""
}
