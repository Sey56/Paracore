using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

public class PerimeterWalls
{
    public static int Create(
        Document doc, Level level, WallType wallType, double wallHeightMeters, 
        bool useModelLines, bool roomBounding)
    {
        int wallsCreated = 0;
        double wallHeightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);

        if (useModelLines)
        {
            // Use existing model lines as perimeter
            var modelLines = new FilteredElementCollector(doc)
                .OfClass(typeof(CurveElement))
                .OfType<ModelCurve>()
                .Where(mc => mc.SketchPlane != null && 
                            Math.Abs(mc.SketchPlane.GetPlane().Origin.Z - level.Elevation) < 0.1)
                .ToList();

            // Diagnostic info removed to keep agent summary clean
            // Found {modelLines.Count} model lines at level elevation

            foreach (var modelLine in modelLines)
            {
                try
                {
                    Curve curve = modelLine.GeometryCurve;
                    Wall wall = Wall.Create(doc, curve, wallType.Id, level.Id, wallHeightFt, 0, false, roomBounding);
                    wallsCreated++;
                }
                catch (Exception ex)
                {
                    Println($"⚠️ Could not create wall from model line: {ex.Message}");
                }
            }
        }
        else
        {
            // Create rectangular perimeter based on project extents
            Println("⚠️ Automatic perimeter detection not yet implemented. Use 'useModelLines = true' to create walls from existing model lines.");
        }

        return wallsCreated;
    }
}
