using Autodesk.Revit.DB.Architecture;

/*
Description: 
Audits all walls on a specific level and identifies those shorter than a given threshold. 
Demonstrates the 4-tiered RevitElements discovery strategies and Output visualization.
*/

// 1. Initialize Parameters
var p = new Params();

// 2. Find the target level
Level level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.TargetLevel);

if (level == null) throw new Exception($"Level '{p.TargetLevel}' not found in project.");

// 3. Collect walls on the selected level that are too short
List<Wall> shortWalls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId.Value == level.Id.Value)
    .Where(w => 
    {
        // Extract length from Revit parameter (always internal units: feet)
        double internalLength = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble();
        return internalLength < p.MaxLengthThreshold;
    })
    .ToList();

// 4. Report results
if (shortWalls.Count == 0)
{
    Println($"✅ No walls found shorter than {p.MaxLengthThreshold} ft on {p.TargetLevel}.");
}
else 
{
    Println($"📊 Found {shortWalls.Count} short walls on {p.TargetLevel}. See Table tab for details.");

    // 5. Map results into a clean format for the Table tab
    var rows = shortWalls.Select(w => 
    {
        // Get internal length and convert to Millimeters
        double internalLength = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble();
        double mmValue = UnitUtils.ConvertFromInternalUnits(internalLength, UnitTypeId.Millimeters);
        
        return new {
            Id = w.Id.Value,
            Name = w.Name,
            Type = w.WallType.Name,
            Length_mm = Math.Round(mmValue, 2)
        };
    }).ToList();

    Table(rows);

    // 6. Select and Isolate the short walls in the active view
    var idsToSelect = shortWalls.Select(w => w.Id).ToList();
    UIDoc.Selection.SetElementIds(idsToSelect);
    
    // Most view operations (even temporary ones) require a Transaction in certain contexts.
    Transact("Isolate Short Walls", () => {
        Doc.ActiveView.IsolateElementsTemporary(idsToSelect);
    });
    
    Println($"🔍 {shortWalls.Count} walls selected and isolated in active view.");
}

// --- Parameter Definitions ---

public class Params
{
    /// <summary>Which Level should we audit?</summary>
    [RevitElements(TargetType = "Level")]
    public string TargetLevel { get; set; } = "Level 1";

    /// <summary>Maximum length threshold to flag walls (Short Walls).</summary>
    [Range(0, 50000, 100)]
    [Unit("mm")]
    public double MaxLengthThreshold { get; set; } = 3000;
}
