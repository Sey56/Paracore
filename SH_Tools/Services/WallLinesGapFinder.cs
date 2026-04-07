
using Autodesk.Revit.DB;
using SH_Tools.LineUtils;

namespace SH_Tools.Services
{
    public static class WallLinesGapFinder
    {
        // Conversion factor from centimeters to feet
        private const double CmToFt = 30.48;

        // Minimum wall length allowed in feet
        private const double MinLength = 2.5 / CmToFt; // 2.5cm in feet
        public static List<GeometryObject> ExplodeToLayerUnits(List<GeometryObject> wallObjects)
        {
            var wallUnits = new List<GeometryObject>();
            const double Tolerance = 0.01;

            foreach (var obj in wallObjects)
            {
                if (obj is Line line)
                {
                    if (line.Length > MinLength + Tolerance)
                        wallUnits.Add(line);
                }
                else if (obj is PolyLine polyline)
                {
                    var coords = (List<XYZ>)polyline.GetCoordinates();
                    for (var i = 0; i < coords.Count - 1; i++)
                    {
                        var point1 = coords[i];
                        var point2 = coords[i + 1];
                        if ((point2 - point1).GetLength() > MinLength + Tolerance)
                            wallUnits.Add(Line.CreateBound(point1, point2));
                    }
                }
            }
            return wallUnits;
        }
        public static double DetectGap(List<GeometryObject> units)
        {
            // Create a list to store all MINGAP sizes
            var gaps = new List<double>();

            // Convert GeometryObject to Line
            var lines = units.OfType<Line>().ToList();

            // Compare each pair of lines
            for (var i = 0; i < lines.Count - 1; i++)
            {
                for (var j = i + 1; j < lines.Count; j++)
                {
                    var line1 = lines[i];
                    var line2 = lines[j];

                    // Check if the lines are parallel
                    if (!LineUtility.AreParallel(line1, line2)) continue;
                    // Calculate the MINGAP between the lines
                    var gap = CalculateGap(line1, line2);

                    // Add the MINGAP to the list
                    gaps.Add(gap);
                }
            }

            // Find the most common MINGAP size
            return (double)FindMostCommon(gaps);
        }

        public static double FindMostCommon(List<double> gaps, double tolerance = 0.01)
        {
            var gapCounts = new Dictionary<double, int>();
            foreach (var gap in gaps)
            {
                var closeKey = gapCounts.Keys.FirstOrDefault(k => Math.Abs(k - gap) <= tolerance);
                if (closeKey != 0)
                {
                    gapCounts[closeKey]++;
                }
                else
                {
                    gapCounts[gap] = 1;
                }
            }

            return gapCounts.Aggregate((l, r) => l.Value > r.Value ? l : r).Key;
        }

        public static double CalculateGap(Line line1, Line line2)
        {
            return LineUtility.ShortestDistanceVector(line1, line2).GetLength();
        }
    }
}