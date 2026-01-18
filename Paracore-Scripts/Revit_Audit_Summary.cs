using Autodesk.Revit.DB.Architecture;

// Revit_Audit_Summary.cs - Tutorial Day 04: The "Magic to Freedom" Demo
// Structure: Single-File Consolidated Script (Imports -> Logic -> Helper Classes -> Params)

var p = new Params();

Println("--- [v2.1.1] Parameter Engine Deep-Dive ---");

// 1. Show the "Magic" results
Println($"1. Shortcut (Strategy 1): {p.ShortcutWallType}");
Println($"2. Category (Strategy 2): {p.CategoryWallTypes}");
Println($"3. Instance (Strategy 3): {p.DistinctDimensionName}");

// 2. Show the "Freedom" result
Println($"4. Freedom (_Options): {p.PreciseSheetName}");

// 3. Demo the Data Table (WYSIWYG Result)
var results = new[] {
    new { Step = "Strategy 1", Status = "Optimized Shortcut", Result = p.ShortcutWallType },
    new { Step = "Strategy 2", Status = "Smart Category", Result = p.CategoryWallTypes },
    new { Step = "Strategy 3", Status = "Literal Class", Result = p.DistinctDimensionName },
    new { Step = "Freedom", Status = "_Options Masterpiece", Result = p.PreciseSheetName }
};

Table(results);
Println("\nInspect the UI! If the Magic fails, use your Freedom.");


// --- Helper Classes ---

public class Element_Collector {
    public List<Element> GetElementsOnLevel(string levelName, List<string> categoryNames) {
        // DELIBERATE ERROR: Missing 'Doc' global context (logic check for Explain & Fix)
        // AND: Typo in BuiltInCategory lookup
        
        var level = new FilteredElementCollector(Doc) 
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(x => x.Name == levelName);
            
        if (level == null) return new List<Element>();

        var multyCategoryFilter = new ElementMulticategoryFilter(
            categoryNames.Select(c => {
                 // TYPO: BiltInCategory instead of BuiltInCategory
                 return (BiltInCategory)Enum.Parse(typeof(BuiltInCategory), "OST_" + c);
            }).ToList()
        );

        return new FilteredElementCollector(Doc)
            .WherePasses(multyCategoryFilter)
            .WhereElementIsNotElementType()
            .Where(x => x.LevelId == level.Id)
            .ToList();
    }
}

public class Parameter_Helper {
    public static double CalculateHealthScore(Element el) {
        int totalParams = 0;
        int filledParams = 0;
        
        foreach (Parameter p in el.Parameters) {
            totalParams++;
            if (p.HasValue && !string.IsNullOrWhiteSpace(p.AsValueString())) {
                filledParams++;
            }
        }
        
        if (totalParams == 0) return 100.0;
        return (double)filledParams / totalParams * 100.0;
    }
}


// --- Params Class (Must be Last) ---

public class Params {

    #region Basic Settings

    /// <summary>Tolerance for auditing overlapping elements (automatically converted from mm to Feet)</summary>
    [Range(0, 100, 5)] [Unit("mm")]
    public double Tolerance { get; set; } = 50.0;
    
    /// <summary>Enable deep audit for more thorough parameter checking</summary>
    public bool DeepAudit { get; set; } = false;

    /// <summary>Select Revit categories to include in the audit summary</summary>
    [RevitElements(TargetType = "Category")]
    public List<string> CheckCategories { get; set; } = new List<string> { "Walls", "Doors" };

    #endregion


    #region Revit Element Discovery

    /// <summary>Pillar 1: Strategy 1 (Optimized map shortcut for Wall Types)</summary>
    [RevitElements(TargetType = "WallType")]
    public string ShortcutWallType { get; set; }

    /// <summary>Pillar 2: Strategy 2 (Category-based match with Type Bias default)</summary>
    [RevitElements(TargetType = "Walls")]
    public string CategoryWallTypes { get; set; }

    /// <summary>Pillar 3: Strategy 3 (Literal C# Class Reflection — returns all instances, then applies .Distinct() on names)</summary>
    [RevitElements(TargetType = "Dimension")]
    public string DistinctDimensionName { get; set; }

    /// <summary>Pillar 4: The Freedom Layer (Explicitly formatted sheet selection)</summary>
    public string PreciseSheetName { get; set; }

    public List<string> PreciseSheetName_Options => new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Sheets)
        .WhereElementIsNotElementType()
        .Cast<ViewSheet>()
        .Select(s => $"{s.SheetNumber} - {s.Name}") 
        .OrderBy(n => n)
        .ToList();

    #endregion

}
