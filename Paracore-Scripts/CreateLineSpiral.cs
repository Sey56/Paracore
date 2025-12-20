using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Prototyping
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Creates a spiral using model lines on a specified level with user-defined parameters
for maximum radius, number of turns, and angle resolution.

UsageExamples:
- "create a spiral with model lines"

*/

// 🌿 Editable Parameters
// [Parameter]
string levelName = "Level 1";
// [Parameter]
double maxRadiusCm = 2400;
// [Parameter]
int numTurns = 10;
// [Parameter]
double angleResolutionDegrees = 20;

Print("Starting spiral sketch...");

Transact("Create Spiral", () =>
{
    var spiral = new SpiralCreator();
    spiral.CreateSpiral(Doc, levelName, maxRadiusCm, numTurns, angleResolutionDegrees);
});

Print("Spiral sketch finished.");

public class SpiralCreator
{
    public void CreateSpiral(Document doc, string levelName, double maxRadiusCm, int numTurns, double angleResolutionDegrees)
    {
        Level level = new FilteredElementCollector(doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(l => l.Name == levelName)
            ?? throw new Exception($"Level \"{levelName}\" not found.");

        double z = level.Elevation; // Ensures Z alignment with SketchPlane
        XYZ origin = new(0, 0, z);
        SketchPlane sketch = SketchPlane.Create(doc, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, origin));

        double maxRadiusFt = UnitUtils.ConvertToInternalUnits(maxRadiusCm, UnitTypeId.Centimeters);
        double angleResRad = angleResolutionDegrees * Math.PI / 180;

        var curves = new List<Curve>();

        for (int i = 0; i < numTurns * 360 / angleResolutionDegrees; i++)
        {
            double angle1 = i * angleResRad;
            double angle2 = (i + 1) * angleResRad;

            double radius1 = maxRadiusFt * angle1 / (numTurns * 2 * Math.PI);
            double radius2 = maxRadiusFt * angle2 / (numTurns * 2 * Math.PI);

            XYZ pt1 = new(radius1 * Math.Cos(angle1), radius1 * Math.Sin(angle1), z);
            XYZ pt2 = new(radius2 * Math.Cos(angle2), radius2 * Math.Sin(angle2), z);

            Line line = Line.CreateBound(pt1, pt2);
            if (line.Length > 0.0026)
                curves.Add(line);
        }

        foreach (Curve curve in curves)
        {
            doc.Create.NewModelCurve(curve, sketch);
        }
    }
}
