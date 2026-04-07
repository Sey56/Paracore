using Autodesk.Revit.DB;
using SH_Tools.LineUtils;

namespace SH_Tools.Services
{
    public static class WallGapService
    {
        const double Tolerance = 0.001;
        public static Dictionary<string, double> GetGapsForAllWallLayers(Dictionary<string, List<GeometryObject>> allWallLayerUnits)
        {
            var gapsByLayer = new Dictionary<string, double>();

            foreach (var layerName in allWallLayerUnits.Keys)
            {
                var lines = allWallLayerUnits[layerName].OfType<Line>().ToList();
                var gaps = new List<double>();

                for (int i = 0; i < lines.Count - 1; i++)
                {
                    for (int j = i + 1; j < lines.Count; j++)
                    {
                        Line line1 = lines[i];
                        Line line2 = lines[j];

                        if (line1 != null && line2 != null && LineUtility.AreParallel(line1, line2))
                        {
                            double gap = CalculateGap(line1, line2);
                            gaps.Add(gap);
                        }
                    }
                }

                // Find the most common gap for this layer
                double mostCommonGap = FindMostCommon(gaps);
                gapsByLayer[layerName] = mostCommonGap;
            }

            return gapsByLayer;
        }

        private static double FindMostCommon(List<double> gaps)
        {
            Dictionary<double, int> gapCounts = [];
            foreach (double gap in gaps)
            {
                double closeKey = gapCounts.Keys.FirstOrDefault(k => Math.Abs(k - gap) <= Tolerance);
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

        private static double CalculateGap(Line line1, Line line2)
        {
            return LineUtility.ShortestDistanceVector(line1, line2).GetLength();
        }
    }
}
