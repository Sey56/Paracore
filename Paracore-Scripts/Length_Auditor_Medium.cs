/*
DocumentType: Project
Categories: Tutorial, Audit
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
(Day 04 - Medium) Introduces User Parameters. 
Allows the user to adjust the length threshold via a slider in the UI.

UsageExamples:
- "Audit walls with a threshold"
- "Find short walls (Day 04 Medium)"
*/

// Create the Params instance to get user input
var p = new Params();

// 1. Get all walls in the project
var wallList = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .ToList();

// 2. Filter using the user-defined threshold (p.MaxThreshold is in internal feet)
var shortWalls = wallList
    .Where(w => {
        double length = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble();
        return length < p.MaxThreshold;
    })
    .ToList();

// 3. Show the results (if any are found)
if (!shortWalls.Any())
{
    double limitMm = UnitUtils.ConvertFromInternalUnits(p.MaxThreshold, UnitTypeId.Millimeters);
    Println($"✅ No walls shorter than {Math.Round(limitMm)}mm found in the project.");
}
else
{
    // Prepare table rows
    var results = shortWalls.Select(w => {
        var lengthParam = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH);
        double feetValue = lengthParam.AsDouble();
        double mmValue = UnitUtils.ConvertFromInternalUnits(feetValue, UnitTypeId.Millimeters);

        return new {
            Id = w.Id.Value,
            Type = w.WallType.Name,
            Length = Math.Round(mmValue)
        };
    });

    Table(results);

    // 4. Select and Isolate in the view
    var ids = shortWalls.Select(w => w.Id).ToList();
    UIDoc.Selection.SetElementIds(ids);

    Transact("Day 04 Medium: Isolate", () => {
        Doc.ActiveView.IsolateElementsTemporary(ids);
    });

    // Provide final feedback
    double limitMm = UnitUtils.ConvertFromInternalUnits(p.MaxThreshold, UnitTypeId.Millimeters);
    Println($"📊 Found {shortWalls.Count} walls shorter than {Math.Round(limitMm)}mm.");
}

// --- Parameters ---
public class Params {
    [Range(0, 10000, 100)]
    [Unit("mm")]
    public double MaxThreshold { get; set; } = 3000;
}
