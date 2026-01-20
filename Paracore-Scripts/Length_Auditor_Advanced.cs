/*
DocumentType: Project
Categories: Tutorial, Audit
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
(Day 04 - Advanced) Multi-Parameter Filtering. 
Audits wall lengths on a specified Level and isolates walls shorter than a 
user-defined threshold. Demonstrates professional error handling and multi-criteria filtering.

UsageExamples:
- "Audit walls shorter than 3000mm on Level 1"
- "Find and isolate short walls on specific levels"
- "Advanced wall audit (Day 04)"
*/

// Create the Params instance
var p = new Params();

// 1. Find the Level element that matches the provided name
Level? targetLevel = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.TargetLevel);

// Stop with a clear error if the level isn't found
if (targetLevel == null) throw new Exception($"🚫 Level not found: '{p.TargetLevel}'");

// 2. Collect only the walls on that specific level
var wallsOnLevel = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId == targetLevel.Id)
    .ToList();

// 3. Filter for walls shorter than the user's threshold
double thresholdFeet = p.MaxThreshold; 

var shortWalls = wallsOnLevel
    .Where(w => 
    {
        var lenParam = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH);
        
        // Safety check: skip if the parameter is missing or has no value
        if (lenParam == null || !lenParam.HasValue) return false;
        
        return lenParam.AsDouble() < thresholdFeet;
    })
    .ToList();

// 4. Show the results (if any are found)
if (!shortWalls.Any())
{
    double limitMm = UnitUtils.ConvertFromInternalUnits(thresholdFeet, UnitTypeId.Millimeters);
    Println($"✅ No walls shorter than {Math.Round(limitMm)}mm found on level '{p.TargetLevel}'.");
}
else
{
    // Transform the results into a clean table
    var results = shortWalls.Select(w => 
    {
        var lenParam = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH);
        double feetValue = lenParam.AsDouble();
        double mmValue = UnitUtils.ConvertFromInternalUnits(feetValue, UnitTypeId.Millimeters);

        var wallType = Doc.GetElement(w.GetTypeId()) as WallType;
        
        return new 
        {
            Id = w.Id.Value,
            Type = wallType?.Name ?? "Unknown",
            Level = targetLevel.Name,
            Length_mm = Math.Round(mmValue)
        };
    }).ToList();

    Table(results);

    // 5. Visualize the results in Revit
    var idsToSelect = shortWalls.Select(w => w.Id).ToList();
    UIDoc.Selection.SetElementIds(idsToSelect);

    Transact("Day 04 Advanced: Isolate", () => 
    {
        Doc.ActiveView.IsolateElementsTemporary(idsToSelect);
    });

    // Final feedback
    double limitMm = UnitUtils.ConvertFromInternalUnits(thresholdFeet, UnitTypeId.Millimeters);
    Println($"🔍 Found {shortWalls.Count} walls on {p.TargetLevel} shorter than {Math.Round(limitMm)}mm.");
}

// --- Parameters ---
public class Params 
{
    #region Audit Settings

    /// <summary>Which Level should we audit?</summary>
    [RevitElements(TargetType = "Level")]
    [Required]
    public string? TargetLevel { get; set; }

    /// <summary>Maximum length threshold to flag walls (entered in mm).</summary>
    [Range(0, 50000, 100)]
    [Unit("mm")] // Engine converts this to feet automatically
    public double MaxThreshold { get; set; } = 3000;

    #endregion
}
