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

    "blank": """// 1. Query & Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
Println("Hello from Paracore!");

public class Params
{
    #region Generated Parameters
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

    "BlankSentinel": """// Blank Watchdog Sentinel
Watchdog(() =>
{
    Params p = new();
    
    // Sentinel Logic here
    var elements = new FilteredElementCollector(doc)
        .OfCategory(BuiltInCategory.OST_Walls)
        .WhereElementIsNotElementType()
        .ToElements();
        
    WatchdogReport($"Found {elements.Count} elements", "success");
});

public class Params
{
    #region Generated Parameters
    #endregion
}
"""
}
