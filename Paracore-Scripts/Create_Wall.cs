using Autodesk.Revit.DB;

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

XYZ pt1 = p.AlongXAxis ? new(-p.WallLength / 2, 0, 0) : new(0, -p.WallLength / 2, 0);
XYZ pt2 = p.AlongXAxis ? new(p.WallLength / 2, 0, 0) : new(0, p.WallLength / 2, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

// 2. Select the elements from Revit
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.LevelName); 

WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(w => w.Name == p.WallTypeName);

if (wallType == null)
{
    Println($"🚫 Wall type '{p.WallTypeName}' not found.");
    return;
}

if (level == null)
{
    Println($"🚫 Level '{p.LevelName}' not found.");
    return;
}

double displayLength = UnitUtils.ConvertFromInternalUnits(p.WallLength, UnitTypeId.Meters);
double displayHeight = UnitUtils.ConvertFromInternalUnits(p.WallHeight, UnitTypeId.Meters);
Println($"Preparing to create wall of {displayLength:F2}m × {displayHeight:F2}m on '{p.LevelName}'...");


// 3. Create the wall inside a transaction
Transact("Create Wall", () =>
{
    Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    wall.WallType = wallType;
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(p.WallHeight);
    
    Println($"✔️ Wall created: {wall.Id}");
});

// --- Parameter Definitions (Simplified V3 Pattern) ---

class Params {
    [RevitElements(TargetType = "Level")]
    public string LevelName { get; set; } = "Level 1";

    [RevitElements(TargetType = "WallType")]
    public string WallTypeName { get; set; } = "Generic - 200mm";

    /// <summary>Length in meters</summary>
    [Range(0.1, 50.0), Unit("m")]
    public double WallLength { get; set; } = 6.0;

    /// <summary>Height in meters</summary>
    [Range(0.1, 20.0), Unit("m")]
    public double WallHeight { get; set; } = 3.0;

    /// <summary>If true, the wall is created along the X-axis. If false, along the Y-axis.</summary>
    public bool AlongXAxis { get; set; } = true;
}
