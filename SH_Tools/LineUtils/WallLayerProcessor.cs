using Autodesk.Revit.DB;

namespace SH_Tools.LineUtils
{
    public static class WallLayerProcessor
    {
        public static List<Line> MidLines(List<List<Line>> pairedLinesLists)
        {
            var midLines = new List<Line>();

            foreach (var pair in pairedLinesLists)
            {
                // Ensure there are exactly two wallLines in the pair
                if (pair.Count == 2)
                {
                    var line1 = pair[0];
                    var line2 = pair[1];

                    // Get the points projected halfway
                    var projectedPoints = LineUtility.PointsProjectedHalfWay(line1, line2);

                    // Create the midline
                    var midLine = LineUtility.Midline(projectedPoints);

                    // Add the midline to the list
                    midLines.Add(midLine);
                }
            }

            // Return the midlines
            return midLines;
        }

        // regroup a list of wallLines into lists according to their collinearity
        public static List<List<Line>> CollinearLists(List<Line> wallLines)
        {
            var collinearLists = new List<List<Line>>();
            var usedLines = new HashSet<Line>();

            for (var i = 0; i < wallLines.Count; i++)
            {
                if (!usedLines.Contains(wallLines[i]))
                {
                    var collinears = new List<Line> { wallLines[i] };
                    usedLines.Add(wallLines[i]);
                    for (var j = 0; j < wallLines.Count; j++)
                    {
                        if (wallLines[i] != wallLines[j] &&
                            !usedLines.Contains(wallLines[j]) &&
                            LineUtility.AreCollinear(wallLines[i], wallLines[j]))
                        {
                            collinears.Add(wallLines[j]);
                            usedLines.Add(wallLines[j]);
                        }
                    }

                    collinearLists.Add(collinears);
                }
            }

            return collinearLists;
        }

        public static List<List<Line>> OrientedCollinearLists(List<List<Line>> collinearGroups)
        {
            var orientedCollinearGroups = new List<List<Line>>();

            foreach (var group in collinearGroups)
            {
                // Get the extreme points and create the reference line
                Tuple<XYZ, XYZ> extremePoints = LineUtility.GetExtremePoints(group);
                Line referenceLine = Line.CreateBound(extremePoints.Item1, extremePoints.Item2);

                // Standardize the direction of the lines in the group
                List<Line> orientedGroup = LineUtility.StandardizeDirection(group, referenceLine);

                // Sort the lines in the group based on their start point positions along the reference line
                orientedGroup.Sort((line1, line2) =>
                {
                    XYZ proj1 = LineUtility.ProjectOnto(line1.GetEndPoint(0), referenceLine);
                    XYZ proj2 = LineUtility.ProjectOnto(line2.GetEndPoint(0), referenceLine);
                    return proj1.DistanceTo(referenceLine.GetEndPoint(0)).CompareTo(proj2.DistanceTo(referenceLine.GetEndPoint(0)));
                });

                orientedCollinearGroups.Add(orientedGroup);
            }

            return orientedCollinearGroups;
        }

        public static List<Line> MergeCollinearList(List<Line> orientedCollinearLists)
        {
            var mergedLinesList = new List<Line>();
            var isMerged = new bool[orientedCollinearLists.Count];

            for (var i = 0; i < orientedCollinearLists.Count; i++)
            {
                if (!isMerged[i])
                {
                    var mergedLine = orientedCollinearLists[i];
                    isMerged[i] = true;

                    for (var j = i + 1; j < orientedCollinearLists.Count; j++)
                    {
                        if (!isMerged[j] && LineUtility.Mergeable(mergedLine, orientedCollinearLists[j]))
                        {
                            // Get the two points that create the maximum distance
                            Tuple<XYZ, XYZ> maxPoints = LineUtility.GetExtremePoints([mergedLine, orientedCollinearLists[j]]);
                            // Merge the lines
                            mergedLine = Line.CreateBound(maxPoints.Item1, maxPoints.Item2);
                            isMerged[j] = true;
                        }
                    }

                    mergedLinesList.Add(mergedLine);
                }
            }

            return mergedLinesList;
        }

        public static List<List<Line>> MergeCollinearLists(List<List<Line>> collinearLists)
        {
            List<List<Line>> mergedCollinearLists = [];
            foreach (var list in collinearLists)
            {
                var mergedCollinearList = MergeCollinearList(list);
                mergedCollinearLists.Add(mergedCollinearList);
            }

            return mergedCollinearLists;
        }
        public static List<Line> FlattenMergedCollinearLists(List<List<Line>> mergedCollinearLists)
        {
            return mergedCollinearLists.SelectMany(x => x).ToList();
        }

        // This method will pair the merged and flattened wall lines based on their width (i.e for walls)
        public static List<List<Line>> GroupFlattenedIntoPairs(List<Line> flattened, double gap)
        {
            const double Tolerance = 0.01;
            var linePairs = new List<List<Line>>();
            var processedLines = new HashSet<Line>();

            // Sort the lines by length in descending order
            var sortedLines = flattened.OrderByDescending(line => line.Length).ToList();

            foreach (var line1 in sortedLines)
            {
                if (processedLines.Contains(line1)) continue;

                List<Line> potentialPairs = [];

                foreach (var line2 in sortedLines)
                {
                    if (line1 == line2 || processedLines.Contains(line2)) continue;

                    bool isParallel = LineUtility.AreParallel(line1, line2);
                    bool isWallWidth = Math.Abs(LineUtility.ShortestDistanceVector(line1, line2).GetLength() - gap) <= Tolerance;

                    // Check if there is a line that intersects perpendicularly with both lines
                    bool isPerpendicularIntersect = LineUtility.IsPerpendicularIntersect(line1, line2);

                    if (isParallel && isWallWidth && isPerpendicularIntersect)
                    {
                        potentialPairs.Add(line2);
                    }
                }

                if (potentialPairs.Count == 1)
                {
                    linePairs.Add([line1, potentialPairs[0]]);
                    processedLines.Add(line1);
                    processedLines.Add(potentialPairs[0]);
                }
                else if (potentialPairs.Count > 1)
                {
                    // Get the line that spans the extreme points of the potential pairs
                    var extremePoints = LineUtility.GetExtremePoints(potentialPairs);
                    var extremeLine = Line.CreateBound(extremePoints.Item1, extremePoints.Item2);

                    linePairs.Add([line1, extremeLine]);
                    processedLines.Add(line1);
                    processedLines.UnionWith(potentialPairs);
                }
            }

            return linePairs;
        }
    }
}