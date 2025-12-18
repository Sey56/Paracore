using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin


Description:
Creates a wall along the X-axis at a user-defined level with specified length and height.
Parameters allow customizing geometry in meters. Great for layout prototyping.

UsageExamples:
- "Create a linear wall along X-axis"
- "Create a wall of 8m length and 3m height on 'Level 1'"
*/

[RevitElements]
string levelName = "Level 1";

List<string> levelName_Options() {
    return new FilteredElementCollector(Doc)
        .OfClass(typeof(Level))
        .Select(l => l.Name)
        .ToList();
}

[RevitElements]
string wallTypeName = "Generic - 200mm";

List<string> wallTypeName_Options() {
    return new FilteredElementCollector(Doc)
        .OfClass(typeof(WallType))
        .Select(w => w.Name)
        .OrderBy(n => n)
        .ToList();
}

[Parameter(Min: 0.1, Max: 50, Step: 0.1)]
double wallLengthMeters = 6.0;

[Parameter(Min: 0.1, Max: 20, Step: 0.1)]
double wallHeightMeters = 3.0;

[Parameter(Description: "If true, the wall is created along the X-axis. If false, along the Y-axis.")]
bool alongXAxis = true;

// Other Top-Level Statements
double lengthFt = UnitUtils.ConvertToInternalUnits(wallLengthMeters, UnitTypeId.Meters);
double heightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);

XYZ pt1 = alongXAxis ? new(-lengthFt / 2, 0, 0) : new(0, -lengthFt / 2, 0);
XYZ pt2 = alongXAxis ? new(lengthFt / 2, 0, 0) : new(0, lengthFt / 2, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName); 

WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(w => w.Name == wallTypeName);


if (wallType == null)
{
    Println($"🚫 Wall type '{wallTypeName}' not found.");
    return;
}


if (level == null)
{
    Println($"🚫 Level '{levelName}' not found.");
    return;
}

Println($"Preparing to create wall of {wallLengthMeters}m × {wallHeightMeters}m on '{levelName}'...");

// Write operations inside a transaction.
// The new "Intelligent Engine" will automatically detect the created wall
// and add it to the working set.
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.WallType = wallType;
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
});

Println("✔️ Wall created.");
