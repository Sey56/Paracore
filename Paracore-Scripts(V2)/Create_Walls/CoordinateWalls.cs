using Autodesk.Revit.DB;
using System;
using System.IO;

public class CoordinateWalls
{
    public static int Create(
        Document doc, Level level, WallType wallType, double wallHeightMeters, 
        string csvFilePath, bool roomBounding)
    {
        int wallsCreated = 0;
        double wallHeightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);

        if (!File.Exists(csvFilePath))
        {
            Println($"❌ CSV file not found: {csvFilePath}");
            return 0;
        }

        try
        {
            var lines = File.ReadAllLines(csvFilePath);
            // Diagnostic info removed to keep agent summary clean

            // Skip header if present
            int startIndex = lines[0].Contains("x1") || lines[0].Contains("X1") ? 1 : 0;

            for (int i = startIndex; i < lines.Length; i++)
            {
                var parts = lines[i].Split(',');
                if (parts.Length < 4) continue;

                try
                {
                    // Expected format: x1,y1,x2,y2 (in meters)
                    double x1 = double.Parse(parts[0].Trim());
                    double y1 = double.Parse(parts[1].Trim());
                    double x2 = double.Parse(parts[2].Trim());
                    double y2 = double.Parse(parts[3].Trim());

                    // Convert to feet
                    double x1Ft = UnitUtils.ConvertToInternalUnits(x1, UnitTypeId.Meters);
                    double y1Ft = UnitUtils.ConvertToInternalUnits(y1, UnitTypeId.Meters);
                    double x2Ft = UnitUtils.ConvertToInternalUnits(x2, UnitTypeId.Meters);
                    double y2Ft = UnitUtils.ConvertToInternalUnits(y2, UnitTypeId.Meters);

                    XYZ start = new XYZ(x1Ft, y1Ft, level.Elevation);
                    XYZ end = new XYZ(x2Ft, y2Ft, level.Elevation);

                    Line line = Line.CreateBound(start, end);
                    Wall wall = Wall.Create(doc, line, wallType.Id, level.Id, wallHeightFt, 0, false, roomBounding);
                    wallsCreated++;
                }
                catch (Exception ex)
                {
                    Println($"⚠️ Could not parse line {i + 1}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            Println($"❌ Error reading CSV file: {ex.Message}");
        }

        return wallsCreated;
    }
}
