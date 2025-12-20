using Autodesk.Revit.DB;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Creates a wall along the X-axis at a user-defined level with specified length and height.
Parameters allow customizing geometry in meters. Great for layout prototyping.

UsageExamples:
- "Create a linear wall along X-axis"
- "Create a wall of 8m length and 3m height on 'Level 1'"
*/

// Initialize Parameters
var p = new Params();

// 1. Setup the geometry
double lengthFt = UnitUtils.ConvertToInternalUnits(p.wallLengthMeters, UnitTypeId.Meters);
double heightFt = UnitUtils.ConvertToInternalUnits(p.wallHeightMeters, UnitTypeId.Meters);

XYZ pt1 = p.alongXAxis ? new(-lengthFt / 2, 0, 0) : new(0, -lengthFt / 2, 0);
XYZ pt2 = p.alongXAxis ? new(lengthFt / 2, 0, 0) : new(0, lengthFt / 2, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

// 2. Select the elements from Revit
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.levelName); 

WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(w => w.Name == p.wallTypeName);

if (wallType == null)
{
    Println($"🚫 Wall type '{p.wallTypeName}' not found.");
    return;
}

if (level == null)
{
    Println($"🚫 Level '{p.levelName}' not found.");
    return;
}

Println($"Preparing to create wall of {p.wallLengthMeters}m × {p.wallHeightMeters}m on '{p.levelName}'...");

// 3. Create the wall inside a transaction
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.WallType = wallType;
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
    
    Println($"✔️ Wall created: {wall.Id}");
});

// --- Parameter Definitions (The "Pro" Pattern) ---

class Params {
    [RevitElements]
    public string levelName = "Level 1";

    public List<string> levelName_Options() {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Select(l => l.Name)
            .ToList();
    }

    [RevitElements]
    public string wallTypeName = "Generic - 200mm";

    public List<string> wallTypeName_Options() {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(WallType))
            .Select(w => w.Name)
            .OrderBy(n => n)
            .ToList();
    }

    [ScriptParameter(Min: 0.1, Max: 50, Step: 0.1)]
    public double wallLengthMeters = 6.0;

    [ScriptParameter(Min: 0.1, Max: 20, Step: 0.1)]
    public double wallHeightMeters = 3.0;

    [ScriptParameter(Description: "If true, the wall is created along the X-axis. If false, along the Y-axis.")]
    public bool alongXAxis = true;
}
