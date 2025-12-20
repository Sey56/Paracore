using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
AI-generated script based on natural language description. Creates a spiral house by adding rectangular walls on each level of the Revit project, with each level rotated by a specified increment.
UsageExamples:
- "Create a spiral house with walls on each level, rotating by 5 degrees per level."
*/

// 1. Configuration
// [Parameter]
double houseWidthMeters = 10.0;
// [Parameter]
double houseDepthMeters = 20.0;
// [Parameter]
string wallTypeName = "Generic - 200mm";
// [Parameter]
double rotationIncrementDegrees = 5.0;

// 2. Find Wall Type
WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .FirstOrDefault(wt => wt.Name == wallTypeName) as WallType;

if (wallType == null)
{
    Println($"❌ Wall Type '{wallTypeName}' not found.");
}
else
{
    // 3. Find all Levels
    List<Level> levels = [.. new FilteredElementCollector(Doc)
        .OfClass(typeof(Level))
        .Cast<Level>()
        .OrderBy(l => l.Elevation)];

    if (levels.Count == 0)
    {
        Println("❌ No levels found in the document.");
    }
    else
    {
        // 4. Geometry Calculation & House Creation
        double currentRotationDegrees = 0.0;
        double toFeet = UnitUtils.ConvertToInternalUnits(1, UnitTypeId.Meters);

        foreach (Level level in levels)
        {
            double rotationRadians = currentRotationDegrees * Math.PI / 180.0;

            // Calculate corner points of the rotated rectangle
            XYZ p1 = RotatePoint(new XYZ(-houseWidthMeters / 2, -houseDepthMeters / 2, 0), rotationRadians);
            XYZ p2 = RotatePoint(new XYZ(houseWidthMeters / 2, -houseDepthMeters / 2, 0), rotationRadians);
            XYZ p3 = RotatePoint(new XYZ(houseWidthMeters / 2, houseDepthMeters / 2, 0), rotationRadians);
            XYZ p4 = RotatePoint(new XYZ(-houseWidthMeters / 2, houseDepthMeters / 2, 0), rotationRadians);

            // Convert meters to feet
            p1 = p1.Multiply(toFeet);
            p2 = p2.Multiply(toFeet);
            p3 = p3.Multiply(toFeet);
            p4 = p4.Multiply(toFeet);

            // Create lines for the walls
            Line line1 = Line.CreateBound(p1, p2);
            Line line2 = Line.CreateBound(p2, p3);
            Line line3 = Line.CreateBound(p3, p4);
            Line line4 = Line.CreateBound(p4, p1);

            // 5. Transaction: Create Walls
            ElementId wallTypeId = wallType.Id;
            ElementId levelId = level.Id;

            Transact($"Create House at {level.Name}", () =>
            {
                CreateWall(line1, wallTypeId, levelId);
                CreateWall(line2, wallTypeId, levelId);
                CreateWall(line3, wallTypeId, levelId);
                CreateWall(line4, wallTypeId, levelId);
            });

            currentRotationDegrees += rotationIncrementDegrees;
        }

        Println("✅ Spiral house created on all levels.");
    }
}

// Helper function to rotate a point around the origin
XYZ RotatePoint(XYZ point, double angleRadians)
{
    double x = point.X * Math.Cos(angleRadians) - point.Y * Math.Sin(angleRadians);
    double y = point.X * Math.Sin(angleRadians) + point.Y * Math.Cos(angleRadians);
    return new XYZ(x, y, point.Z);
}

void CreateWall(Line line, ElementId wallTypeId, ElementId levelId)
{
    Wall.Create(Doc, line, wallTypeId, levelId, 10, 0, false, false);
}
