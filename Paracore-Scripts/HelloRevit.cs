

using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
The "Hello World" of Revit automation. Creates a twisting skyscraper form
by rotating rectangular wall loops on every level of the project.

UsageExamples:
- "Create a twisting house form"
- "Generate walls on all levels with 5 degree rotation"
- "Build a simple rectangular tower"
*/

var p = new Params();

var allLevels = new FilteredElementCollector(Doc)
	.OfClass(typeof(Level))
	.Cast<Level>()
	.OrderBy(l => l.Elevation)
	.ToList();

var baseLevel = allLevels.FirstOrDefault(l => l.Name == p.BaseLevelName) ?? allLevels.FirstOrDefault();
if (baseLevel == null)
{
	Println("🚫 No levels found in document.");
	return;
}

var upperLevels = allLevels.Where(l => l.Elevation >= baseLevel.Elevation).ToList();
if (upperLevels.Count == 0)
{
	Println("🚫 No upper levels found.");
	return;
}

double halfWidth = p.WidthMeters / 2.0;

double halfDepth = p.DepthMeters / 2.0;

Transact("Create Twisting House", () =>
{
	for (int i = 0; i < upperLevels.Count; i++)
	{
		var level = upperLevels[i];
		Level? nextLevel = (i + 1 < upperLevels.Count) ? upperLevels[i + 1] : null;

		double angleDeg = i * p.RotationStepDegrees;
		double angle = angleDeg * Math.PI / 180.0;
		double cos = Math.Cos(angle);
		double sin = Math.Sin(angle);

		// rectangle points centered at origin before rotation
		var pts = new List<XYZ> {
			new(-halfWidth, -halfDepth, level.Elevation),
			new(halfWidth, -halfDepth, level.Elevation),
			new(halfWidth, halfDepth, level.Elevation),
			new(-halfWidth, halfDepth, level.Elevation)
		};

		// rotate points around origin in XY plane
		for (int j = 0; j < pts.Count; j++)
		{
			var q = pts[j];
			double x = q.X * cos - q.Y * sin;
			double y = q.X * sin + q.Y * cos;
			pts[j] = new XYZ(x, y, q.Z);
		}

		// create 4 walls (closed loop)
		for (int j = 0; j < 4; j++)
		{
			var a = pts[j];
			var b = pts[(j + 1) % 4];
			var line = Line.CreateBound(a, b);
			if (line.Length <= 0.0026) continue;
			var wall = Wall.Create(Doc, line, level.Id, false);
			if (wall == null) continue;

			// set wall unconnected height to the next level elevation difference if available
			double heightFeet = p.WallHeightMeters;
			if (nextLevel != null) heightFeet = nextLevel.Elevation - level.Elevation;
			var hParam = wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);
			if (hParam != null && hParam.IsReadOnly == false)
			{
				hParam.Set(heightFeet);
			}
		}
	}
});

Println($"✅ Created twisting houses on {upperLevels.Count} levels (base: {baseLevel.Name}).");

public class Params
{

	#region Block Parameters
	/// <summary>Rotation step per level, in degrees.</summary>
	public double RotationStepDegrees { get; set; } = 5.0;

	/// <summary>Wall height for top level (meters) if no next level exists.</summary>
    [Unit("m")]
	public double WallHeightMeters { get; set; } = 3.0;

	/// <summary>House width (meters, X axis).</summary>
    [Unit("m")]
	public double WidthMeters { get; set; } = 20.0;

	/// <summary>House depth (meters, Y axis).</summary>
    [Unit("m")]
	public double DepthMeters { get; set; } = 10.0;
	#endregion

	#region Base Level
	public string BaseLevelName { get; set; } = "Level 1";
	public List<string> BaseLevelName_Options => new FilteredElementCollector(Doc)
		.OfClass(typeof(Level))
		.Cast<Level>()
		.Select(l => l.Name)
		.ToList();
	#endregion
}

