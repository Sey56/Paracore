
using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
AI-generated script based on natural language description. Creates a spiral house by adding rectangular walls on each level of the Revit project, with each level rotated by a specified increment.
UsageExamples:
- "Create a spiral house with walls on each level, rotating by 5 degrees per level."
*/

// 1. Top-Level Statements for parameters
// [Parameter]
string wallTypeName = "Generic - 200mm";
// [Parameter]
double houseWidthMeters = 10.0;
// [Parameter]
double houseDepthMeters = 20.0;
// [Parameter]
double rotationIncrementDegrees = 5.0;
// [Parameter]
double defaultWallHeightMeters = 3.0; // Assuming a default wall height if not specified

// 2. Preparation (Read-only operations, outside transaction)

// Convert dimensions to internal units (feet)
double houseWidthFt = UnitUtils.ConvertToInternalUnits(houseWidthMeters, UnitTypeId.Meters);
double houseDepthFt = UnitUtils.ConvertToInternalUnits(houseDepthMeters, UnitTypeId.Meters);
double defaultWallHeightFt = UnitUtils.ConvertToInternalUnits(defaultWallHeightMeters, UnitTypeId.Meters);

// Get all levels, sorted by elevation
var levels = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .OrderBy(l => l.Elevation)
    .ToList();

if (levels.Count == 0)
{
    Println("🚫 No levels found in the document. Cannot create the house.");
    return; // Early exit
}

// Find the specified wall type
WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(wt => wt.Name == wallTypeName);

// Fallback if the specified wall type is not found
if (wallType == null)
{
    wallType = new FilteredElementCollector(Doc)
        .OfClass(typeof(WallType))
        .Cast<WallType>()
        .FirstOrDefault(wt => wt.Kind == WallKind.Basic); // Try to get any basic wall type

    if (wallType == null)
    {
        Println("🚫 Neither 'Generic - 200mm' nor any 'Basic' wall type was found. Cannot create walls.");
        return; // Early exit
    }
    Println($"⚠️ Wall Type '{wallTypeName}' not found. Using default '{wallType.Name}' instead.");
}

// Instantiate the helper class
var houseCreator = new SpiralHouseCreator(houseWidthFt, houseDepthFt, defaultWallHeightFt, rotationIncrementDegrees);

// 3. Execution (Single Transact block)
Transact("Create Spiral House", () =>
{
    double currentRotationRadians = 0.0; // Start with no rotation for the first level

    foreach (var level in levels)
    {
        houseCreator.CreateRectangularWalls(Doc, level, wallType, currentRotationRadians);
        currentRotationRadians += rotationIncrementDegrees * (Math.PI / 180.0); // Convert degrees to radians
    }
});

Println($"✅ Spiral house created across {levels.Count} levels using '{wallType.Name}'.");


// 4. Class Definition (Must come after all top-level statements)
public class SpiralHouseCreator
{
    private readonly double _widthFt;
    private readonly double _depthFt;
    private readonly double _wallHeightFt;
    private readonly double _rotationIncrementDegrees;

    public SpiralHouseCreator(double widthFt, double depthFt, double wallHeightFt, double rotationIncrementDegrees)
    {
        _widthFt = widthFt;
        _depthFt = depthFt;
        _wallHeightFt = wallHeightFt;
        _rotationIncrementDegrees = rotationIncrementDegrees;
    }

    /// <summary>
    /// Creates a rectangular set of walls at the given level with a specified rotation.
    /// </summary>
    /// <param name="doc">The Revit document.</param>
    /// <param name="level">The level to create walls on.</param>
    /// <param name="wallType">The wall type to use.</param>
    /// <param name="rotationRadians">The rotation angle in radians.</param>
    public void CreateRectangularWalls(Document doc, Level level, WallType wallType, double rotationRadians)
    {
        // Define base corner points for a rectangle centered at the origin (Z=0 for rotation logic)
        XYZ p1_base = new XYZ(-_widthFt / 2, -_depthFt / 2, 0);
        XYZ p2_base = new XYZ(_widthFt / 2, -_depthFt / 2, 0);
        XYZ p3_base = new XYZ(_widthFt / 2, _depthFt / 2, 0);
        XYZ p4_base = new XYZ(-_widthFt / 2, _depthFt / 2, 0);

        // Rotate the base points around the Z-axis (origin)
        XYZ p1_rot = RotatePoint(p1_base, rotationRadians);
        XYZ p2_rot = RotatePoint(p2_base, rotationRadians);
        XYZ p3_rot = RotatePoint(p3_base, rotationRadians);
        XYZ p4_rot = RotatePoint(p4_base, rotationRadians);

        // Adjust Z-coordinate to the current level's elevation
        XYZ final_p1 = new XYZ(p1_rot.X, p1_rot.Y, level.Elevation);
        XYZ final_p2 = new XYZ(p2_rot.X, p2_rot.Y, level.Elevation);
        XYZ final_p3 = new XYZ(p3_rot.X, p3_rot.Y, level.Elevation);
        XYZ final_p4 = new XYZ(p4_rot.X, p4_rot.Y, level.Elevation);

        // Create lines for the four walls
        Line[] lines =
        [
            Line.CreateBound(final_p1, final_p2),
            Line.CreateBound(final_p2, final_p3),
            Line.CreateBound(final_p3, final_p4),
            Line.CreateBound(final_p4, final_p1)
        ];

        // Create walls
        foreach (var line in lines)
        {
            // Geometry Validation: Ensure the line has a valid length
            if (line.Length > 0.0026) // Minimum valid length in feet
            {
                Wall.Create(doc, line, wallType.Id, level.Id, _wallHeightFt, 0, false, false);
            }
            else
            {
                Println($"⚠️ Skipped creating a wall on Level {level.Name} due to invalid geometry (line length too short).");
            }
        }
    }

    /// <summary>
    /// Rotates an XYZ point around the Z-axis (origin).
    /// </summary>
    /// <param name="point">The point to rotate.</param>
    /// <param name="angle">The rotation angle in radians.</param>
    /// <returns>The rotated XYZ point.</returns>
    private XYZ RotatePoint(XYZ point, double angle)
    {
        double x = point.X * Math.Cos(angle) - point.Y * Math.Sin(angle);
        double y = point.X * Math.Sin(angle) + point.Y * Math.Cos(angle);
        // The Z-coordinate is preserved as rotation is around Z-axis in XY plane
        return new XYZ(x, y, point.Z); 
    }
}