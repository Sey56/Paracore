using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
Creates a wall along the X-axis at a user-defined level with specified length and height.
Parameters allow customizing geometry in meters. Great for layout prototyping.

UsageExamples:
- "Create a 10m x 4m wall on 'Level 2'":
- "Create a wall of 8m length and 3m height on 'Level 1'":
    
*/


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
    Println($"❌ Level '{levelName}' not found.");
    return 1; // Exit with failure code
}

Println($"Preparing to create wall of {wallLengthMeters}m × {wallHeightMeters}m on '{levelName}'...");

// Write operations inside a transaction.
// The new "Intelligent Engine" will automatically detect the created wall
// and add it to the working set.
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
});

Println("✅ Wall created.");
return 0; // Exit with success code
