using Autodesk.Revit.DB;
using System;

public class GridWalls
{
    public static int Create(
        Document doc, Level level, WallType wallType, double wallHeightMeters,
        double gridSpacingXMeters, double gridSpacingYMeters,
        int gridCountX, int gridCountY,
        double gridOriginXMeters, double gridOriginYMeters,
        bool roomBounding)
    {
        int wallsCreated = 0;
        double wallHeightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
        double spacingXFt = UnitUtils.ConvertToInternalUnits(gridSpacingXMeters, UnitTypeId.Meters);
        double spacingYFt = UnitUtils.ConvertToInternalUnits(gridSpacingYMeters, UnitTypeId.Meters);
        double originXFt = UnitUtils.ConvertToInternalUnits(gridOriginXMeters, UnitTypeId.Meters);
        double originYFt = UnitUtils.ConvertToInternalUnits(gridOriginYMeters, UnitTypeId.Meters);

        // Diagnostic info removed to keep agent summary clean

        // Create vertical walls (parallel to Y-axis)
        for (int i = 0; i <= gridCountX; i++)
        {
            double x = originXFt + (i * spacingXFt);
            XYZ start = new XYZ(x, originYFt, level.Elevation);
            XYZ end = new XYZ(x, originYFt + (gridCountY * spacingYFt), level.Elevation);
            
            try
            {
                Line line = Line.CreateBound(start, end);
                Wall wall = Wall.Create(doc, line, wallType.Id, level.Id, wallHeightFt, 0, false, roomBounding);
                wallsCreated++;
            }
            catch (Exception ex)
            {
                Println($"⚠️ Could not create vertical wall at x={gridSpacingXMeters * i}m: {ex.Message}");
            }
        }

        // Create horizontal walls (parallel to X-axis)
        for (int j = 0; j <= gridCountY; j++)
        {
            double y = originYFt + (j * spacingYFt);
            XYZ start = new XYZ(originXFt, y, level.Elevation);
            XYZ end = new XYZ(originXFt + (gridCountX * spacingXFt), y, level.Elevation);
            
            try
            {
                Line line = Line.CreateBound(start, end);
                Wall wall = Wall.Create(doc, line, wallType.Id, level.Id, wallHeightFt, 0, false, roomBounding);
                wallsCreated++;
            }
            catch (Exception ex)
            {
                Println($"⚠️ Could not create horizontal wall at y={gridSpacingYMeters * j}m: {ex.Message}");
            }
        }

        return wallsCreated;
    }
}
