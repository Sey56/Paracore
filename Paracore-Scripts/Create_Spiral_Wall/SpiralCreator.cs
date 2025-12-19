using Autodesk.Revit.DB;

public class SpiralWallCreator
{
    public void CreateSpiralWalls(Document doc, Level level, double maxRadiusMeters, 
                                int numTurns, double angleResolutionDegrees, 
                                double wallHeightMeters)
    {
        // Convert units to Revit internal units (feet)
        double maxRadiusFt = UnitUtils.ConvertToInternalUnits(maxRadiusMeters, UnitTypeId.Meters);
        double wallHeightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
        double angleResRad = angleResolutionDegrees * Math.PI / 180;

        var wallCurves = new List<Curve>();
        XYZ origin = XYZ.Zero;

        // Generate spiral curves
        for (int i = 0; i < numTurns * 360 / angleResolutionDegrees; i++)
        {
            double angle1 = i * angleResRad;
            double angle2 = (i + 1) * angleResRad;

            // Archimedean spiral: r = a * θ
            double radius1 = maxRadiusFt * angle1 / (numTurns * 2 * Math.PI);
            double radius2 = maxRadiusFt * angle2 / (numTurns * 2 * Math.PI);

            XYZ pt1 = new(radius1 * Math.Cos(angle1), radius1 * Math.Sin(angle1), level.Elevation);
            XYZ pt2 = new(radius2 * Math.Cos(angle2), radius2 * Math.Sin(angle2), level.Elevation);

            Line line = Line.CreateBound(pt1, pt2);
            if (line.Length > 0.1) // Minimum wall segment length
                wallCurves.Add(line);
        }

        // Get default wall type
        WallType? wallType = new FilteredElementCollector(doc)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .FirstOrDefault(wt => !wt.Name.Contains("Stacked") && wt.Kind == WallKind.Basic) ?? throw new Exception("No suitable wall type found.");

        // Create walls for each spiral segment

        foreach (Curve curve in wallCurves)
        {
            try
            {
                // Create wall using the curve
                Wall wall = Wall.Create(doc, curve, wallType.Id, level.Id, 
                                      wallHeightFt, 0, false, false);
                
            }
            catch (Exception ex)
            {
                Println($"⚠️ Could not create wall segment: {ex.Message}");
            }
        }

        Println($"Created {wallCurves.Count} spiral wall segments");
        Println($"SUMMARY: Created {wallCurves.Count} spiral wall segments.");
    }
}