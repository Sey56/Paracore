using Autodesk.Revit.DB;
/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
This is a template script that creates a simple wall in a Revit project document.
Doc, UIDoc, UIApp, Transact, Print and Show are available in the global scope.

UsageExamples:
- "Create a wall"
*/


// These first top level statements marked with // [Parameter] will be treated as input parameters in the UI
// [Parameter]
string levelName = "Level 1";
// [Parameter]
double wallLengthMeters = 6.0;
// [Parameter]
double wallHeightMeters = 3.0;

// Other Top-Level Statements
double lengthFt = UnitUtils.ConvertToInternalUnits(wallLengthMeters, UnitTypeId.Meters);
double heightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
XYZ pt1 = new XYZ(-lengthFt / 2, 0, 0);
XYZ pt2 = new XYZ(lengthFt / 2, 0, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{
    return;
}


// Write operations inside a transaction
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
});

Println($"Created a wall of length {wallLengthMeters} meters and height {wallHeightMeters} meters at level '{levelName}'.");
