# --- Template for new single-file scripts ---
CSHARP_TEMPLATE = """// 1. Setup
var p = new Params();

// 2. Execution logic
Transact("Hello World", () => {
    Println($"Hello {p.TargetName} from {Doc.Title}!");
});

// 3. Parameters (MUST BE LAST)
public class Params {
    #region Settings
    
    /// <summary>
    /// The name to greet.
    /// </summary>
    public string TargetName { get; set; } = "Paracore User";
    
    #endregion
}
"""

# --- Template for Main.cs in multi-file scripts ---
MULTI_FILE_MAIN_TEMPLATE = """// 1. Setup
var p = new Params();

// 2. Execution
Transact("Modular Loop", () => {
    Println($"Hello modular world from {Doc.Title}!");
});

// 3. Parameters (In Main.cs or Params.cs)
public class Params {
    #region Configuration
    
    public string ExampleInput { get; set; } = "Value";
    
    #endregion
}
"""

# --- Industrial Archetypes for Single-File Scripts ---
ARCHETYPES = {
    "blank": CSHARP_TEMPLATE,
    
    "selection-surgeon": """// 1. Setup & Validation
var p = new Params();
var selection = UIDoc.Selection.GetElementIds();

if (!selection.Any()) 
    throw new Exception("Please select at least one element in Revit.");

// 2. Execution Logic
Transact("Selection Surgeon", () => {
    int count = 0;
    foreach (var id in selection) {
        var el = Doc.GetElement(id);
        if (el == null) continue;
        
        // TODO: Add your logic here (e.g., el.Name = p.NewName)
        count++;
    }
    Println($"Successfully processed {count} selected elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params {
    #region Settings
    
    /// <summary>
    /// Example parameter for the selection logic.
    /// </summary>
    public string NewName { get; set; } = "Modified Element";
    
    #endregion
}
""",

    "project-auditor": """// 1. Query & Setup
var p = new Params();

// Collect elements project-wide
var collector = new FilteredElementCollector(Doc)
    .WhereElementIsNotElementType();

// Apply category filter if needed (e.g. BuiltInCategory.OST_Walls)
var elements = collector.ToElements();

// 2. Audit Logic
var issues = new List<object>();

foreach (var el in elements) {
    bool hasIssue = false;
    // TODO: Define your audit rule (e.g., if (el.Name == "") hasIssue = true;)
    
    if (hasIssue) {
        issues.Add(new { 
            Id = el.Id.Value, 
            Name = el.Name, 
            Reason = "Rule Violation" 
        });
    }
}

// 3. Output
Println($"Audit complete. Found {issues.Count} issues.");
if (issues.Any()) {
    Table(issues);
}

// 4. Parameters (MUST BE LAST)
public class Params {
    #region Audit Configuration
    
    public bool IncludeLinks { get; set; } = false;
    
    #endregion
}
""",

    "batch-creator": """// 1. Setup
var p = new Params();

if (p.TargetLevel == null) 
    throw new Exception("Target Level is required.");

// 2. Iterative Creation Logic
Transact("Batch Create Elements", () => {
    for (int i = 0; i < p.Count; i++) {
        // Calculate position or configuration
        XYZ point = new XYZ(i * p.Spacing, 0, 0);
        
        // TODO: Create your element (e.g. Doc.Create.NewFamilyInstance(point, ...))
    }
    Println($"Successfully created {p.Count} elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params {
    #region Geometry
    
    [Required]
    public Level TargetLevel { get; set; }

    [Unit("mm")]
    public double Spacing { get; set; } = 1000.0;

    [Stepper]
    public int Count { get; set; } = 5;
    
    #endregion
}
""",

    "parameter-porter": """// 1. Setup
var p = new Params();

// Query target elements
var elements = new FilteredElementCollector(Doc)
    .WhereElementIsNotElementType()
    .ToList();

// 2. Data Transfer Logic
Transact("Port Parameters", () => {
    int count = 0;
    foreach (var el in elements) {
        var sourceParam = el.LookupParameter(p.SourceParam);
        var targetParam = el.LookupParameter(p.TargetParam);
        
        if (sourceParam != null && targetParam != null && sourceParam.HasValue) {
            string val = sourceParam.AsString() ?? sourceParam.AsValueString();
            targetParam.Set(val);
            count++;
        }
    }
    Println($"Ported data for {count} elements.");
});

// 3. Parameters (MUST BE LAST)
public class Params {
    #region Mapping
    
    public string SourceParam { get; set; } = "Comments";
    public string TargetParam { get; set; } = "Mark";
    
    #endregion
}
""",

    "visualizer": """// 1. Setup
var p = new Params();

// 2. Data Analysis
var elements = new FilteredElementCollector(Doc)
    .WhereElementIsNotElementType()
    .ToList();

var stats = elements
    .GroupBy(e => e.Category?.Name ?? "Uncategorized")
    .Select(g => new { 
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
public class Params {
    #region View Options
    
    public bool ShowUncategorized { get; set; } = true;
    
    #endregion
}
"""
}
