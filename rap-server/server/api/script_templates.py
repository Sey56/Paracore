# --- Standard Tool Template ---
CSHARP_TEMPLATE = """// 1. Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
// 2. Execution logic
Transact("Hello World", () =>
{
    Println($"Hello {p.TargetName} from {Doc.Title}!");
});

// 3. Parameters (MUST BE LAST)
public class Params

{
    #region Settings
    
    /// The name to greet.
    public string TargetName { get; set; } = "Paracore User";
    
    #endregion
}
"""

# --- Project Entry Point (Main.cs) Template ---
MULTI_FILE_MAIN_TEMPLATE = """// 1. Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
// 2. Execution
Transact("Modular Loop", () =>
{
    Println($"Hello modular world from {Doc.Title}!");
});

// 3. Parameters (In Main.cs or Params.cs)
public class Params

{
    #region Configuration
    
    public string ExampleInput { get; set; } = "Value";
    
    #endregion
}
"""

# --- Industrial Archetypes for Tools ---
ARCHETYPES = {
    "blank": CSHARP_TEMPLATE,
    
    "selection-surgeon": """// 1. Setup & Validation
Params p = new();

// __INJECT_QUERY_BLOCK__
List<Element> elements = [.. UIDoc.Selection.GetElementIds().Select(Doc.GetElement).Where(el => el != null)];

if (elements.Count == 0) 
    throw new Exception("Please select at least one element in Revit.");

// 2. Execution Logic
Transact("Selection Surgeon", () =>
{
    int count = 0;
    foreach (Element el in elements)
    {
        // TODO: Add your logic here (e.g., el.Name = p.NewName)
        count++;
    }
    Println($"Successfully processed {count} selected elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params

{
    #region Settings
    
    /// Example parameter for the selection logic.
    public string NewName { get; set; } = "Modified Element";
    
    #endregion
}
""",

    "project-auditor": """// 1. Query & Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
List<Element> elements = [.. new FilteredElementCollector(Doc).WhereElementIsNotElementType()];

// 2. Audit Logic
List<object> issues = new();

foreach (Element el in elements)
{
    bool hasIssue = false;
    // TODO: Define your audit rule (e.g., if (el.Name == "") hasIssue = true;)
    
    if (hasIssue)
    {
        issues.Add(new
        { 
            Id = el.Id.Value, 
            el.Name, 
            Reason = "Rule Violation" 
        });
    }
}

// 3. Output
Println($"Audit complete. Found {issues.Count} issues.");
if (issues.Count > 0)
{
    Table(issues);
}

// 4. Parameters (MUST BE LAST)
public class Params

{
    #region Audit Configuration
    
    /// Include linked elements in audit
    public bool IncludeLinks { get; set; } = false;
    
    #endregion
}
""",

    "batch-creator": """// 1. Setup
Params p = new();

if (p.TargetLevel == null) 
    throw new Exception("Target Level is required.");

// __INJECT_QUERY_BLOCK__
// 2. Iterative Creation Logic
Transact("Batch Create Elements", () =>
{
    for (int i = 0; i < p.Count; i++)
    {
        // Calculate position or configuration
        XYZ point = new(i * p.Spacing, 0, 0);
        
        // TODO: Create your element (e.g. Doc.Create.NewFamilyInstance(point, ...))
    }
    Println($"Successfully created {p.Count} elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params

{
    #region Geometry
    
    /// Target level for element creation
    [Required]
    public Level? TargetLevel { get; set; }

    /// Distance between elements
    [Unit("mm")]
    public double Spacing { get; set; } = 1000.0;

    /// Number of elements to create
    [Stepper]
    public int Count { get; set; } = 5;
    
    #endregion
}
""",

    "parameter-porter": """// 1. Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
List<Element> elements = [.. new FilteredElementCollector(Doc).WhereElementIsNotElementType()];

// 2. Data Transfer Logic
Transact("Port Parameters", () =>
{
    int count = 0;
    foreach (Element el in elements)
    {
        Parameter? sourceParam = el.LookupParameter(p.SourceParam);
        Parameter? targetParam = el.LookupParameter(p.TargetParam);
        
        if (sourceParam != null && targetParam != null && sourceParam.HasValue)
        {
            string val = sourceParam.AsString() ?? sourceParam.AsValueString();
            targetParam.Set(val);
            count++;
        }
    }
    Println($"Ported data for {count} elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params

{
    #region Mapping
    
    /// Name of the source parameter
    public string SourceParam { get; set; } = "Comments";

    /// Name of the target parameter
    public string TargetParam { get; set; } = "Mark";
    
    #endregion
}
""",

    "visualizer": """// 1. Setup
Params p = new();

// __INJECT_QUERY_BLOCK__
List<Element> elements = [.. new FilteredElementCollector(Doc).WhereElementIsNotElementType()];

var stats = elements
    .GroupBy(e => e.Category?.Name ?? "Uncategorized")
    .Select(g => new
    { 
        Category = g.Key, 
        Count = g.Count() 
    })
    .OrderByDescending(x => x.Count)
    .ToList();

// 3. Render Visualization
Println("Model composition analysis complete.");
PieChart(stats);
Table(stats);

// 4. Parameters (MUST BE LAST)
public class Params

{
    #region View Options
    
    /// Include uncategorized elements in charts
    public bool ShowUncategorized { get; set; } = true;
    
    #endregion
}
"""
}
