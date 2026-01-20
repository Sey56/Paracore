/*
DocumentType: Project
Categories: Tutorial, Audit
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
(Day 04 - Start) A minimal script for absolute beginners. 
Hardcoded to find and isolate all walls shorter than 2 meters (2000mm).

UsageExamples:
- "Run the starter length audit"
- "Find short walls (Day 04 Start)"
*/

// 1. Get all walls in the project
var wallList = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .ToList();

// 2. Filter for walls shorter than 2 meters (2000mm)
double limitFeet = UnitUtils.ConvertToInternalUnits(2000, UnitTypeId.Millimeters);

var shortWalls = wallList
    .Where(w => w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble() < limitFeet)
    .ToList();

if (shortWalls.Count == 0)
{
    throw new Exception("No walls shorter than 2000mm were found.");

}
else
{
    // 3. Show the results in a table
    var results = shortWalls.Select(w =>
    {
        // Break down the "Long" statement into clear steps:
        var lengthParam = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH); // 1. Get Param
        double feetValue = lengthParam.AsDouble();                            // 2. Get Value (Feet)
        double mmValue = UnitUtils.ConvertFromInternalUnits(feetValue, UnitTypeId.Millimeters); // 3. Convert to mm

        return new
        {
            Id = w.Id.Value,
            Type = w.WallType.Name,
            Length = Math.Round(mmValue) // 4. Round for display
        };
    });

    Table(results);

    // 4. Select and Isolate in the view
    var ids = shortWalls.Select(w => w.Id).ToList();
    UIDoc.Selection.SetElementIds(ids);

    Transact("Day 04 Start: Isolate", () =>
    {
        Doc.ActiveView.IsolateElementsTemporary(ids);
    });

    Println($"📊 Found {shortWalls.Count} walls shorter than 2000mm.");
}

