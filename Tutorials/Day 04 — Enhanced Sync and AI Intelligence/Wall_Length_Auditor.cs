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

// 3. Collect all walls on that level
List<Wall> shortWalls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId.Value == level.Id.Value)
    .Where(w => w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble() < p.MaxLengthThreshold)
    .ToList();

// 4. Report results
if (shortWalls.Count == 0)
{
    Println($"✅ No walls found shorter than {p.MaxLengthThreshold} ft on {p.TargetLevel}.");
}
else 
{
    Println($"📊 Found {shortWalls.Count} short walls on {p.TargetLevel}. See Summary tab for details.");

    // 5. Output a rich table for the Summary tab
    Table(shortWalls.Select(w => new {
        Id = w.Id.Value,
        Name = w.Name,
        Type = w.WallType.Name,
        Length_mm = Math.Round(UnitUtils.ConvertFromInternalUnits(w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble(), UnitTypeId.Millimeters), 2)
    }).ToList());
}

// --- Parameter Definitions ---

public class Params
{
    /// <summary>Which Level should we audit?</summary>
    [RevitElements(TargetType = "Levels")]
    public string TargetLevel { get; set; } = "Level 1";

    /// <summary>Maximum length threshold to flag walls (Short Walls).</summary>
    [Range(0, 50000, 100)]
    [Unit("mm")]
    public double MaxLengthThreshold { get; set; } = 3000;
}
