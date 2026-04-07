using Autodesk.Revit.DB;
using SH_Tools.Utilities;

namespace SH_Tools.LineUtils
{
    public static class LineUtility
    {
        private const double TOLERANCE = 0.001;
        // wall lines may not be continuous and have some gaps
        private static readonly double MINGAP = Converter.ConvertToFeet(15, UnitOfMeasurement.Centimeters);

        // This method should be given two parallel lines
        public static bool AreCollinear(Line line1, Line line2)
        {
            // Use AreParallel and ShortestDistanceVector
            bool areParallel = AreParallel(line1, line2);
            double shortestDistance = ShortestDistanceVector(line1, line2).GetLength();

            // Check if the shortest distance is less than or equal to the tolerance
            return areParallel && shortestDistance <= TOLERANCE;
        }

        public static bool IsLineWithinAnotherLine(Line doorLine, Line wallLine)
        {
            XYZ doorStart = doorLine.GetEndPoint(0);
            XYZ doorEnd = doorLine.GetEndPoint(1);

            XYZ wallStart = wallLine.GetEndPoint(0);
            XYZ wallEnd = wallLine.GetEndPoint(1);

            double wallLength = wallStart.DistanceTo(wallEnd);
            double doorStartDistance = wallStart.DistanceTo(doorStart);
            double doorEndDistance = wallStart.DistanceTo(doorEnd);

            return doorStartDistance <= wallLength + TOLERANCE && doorEndDistance <= wallLength + TOLERANCE;
        }

        public static bool AreParallel(Line line1, Line line2)
        {
            XYZ dir1 = line1.Direction.Normalize(); // unit vector from line1
            XYZ dir2 = line2.Direction.Normalize(); // unit vector from line2
                                                    // if they are parallel dot product will be close to 1 or -1
            double dotProduct = dir1.DotProduct(dir2);
            // creating ranges slightly above and below -1 and 1
            return Math.Abs(Math.Abs(dotProduct) - 1) <= TOLERANCE;
        }
        public static bool ArePerpendicular(Line line1, Line line2)
        {
            XYZ dir1 = line1.Direction.Normalize(); // unit vector from line1
            XYZ dir2 = line2.Direction.Normalize(); // unit vector from line2
            double dotProduct = dir1.DotProduct(dir2);
            // Check if the dot product is close to zero
            return Math.Abs(dotProduct) < TOLERANCE;
        }


        // this method must take only parallel lines
        public static XYZ ShortestDistanceVector(Line line1, Line line2)
        {
            // Get one vector on one of the lines
            XYZ vector1 = line1.Direction;

            // Get another vector between points on the lines
            XYZ point1 = line1.GetEndPoint(0);
            XYZ point2 = line2.GetEndPoint(0);

            XYZ vector2 = point2 - point1;

            // project vector2 on vector1
            XYZ projection = vector2.DotProduct(vector1) * vector1;

            // the magnitude of the vertical component of vector2 is the shortest distance
            return vector2 - projection;
        }

        public static double GetMaxDistance(Tuple<XYZ, XYZ> extremePoints)
        {
            return (extremePoints.Item2 - extremePoints.Item1).GetLength();
        }

        // Checking if two collinear lines are mergeable based on
        // the conditions provided (i.e if overlapped, touch at
        // one point or if gap along their lengths is below a given threshold
        public static bool Mergeable(Line line1, Line line2)
        {
            // Extreme points
            Tuple<XYZ, XYZ> extremePoints = GetExtremePoints([line1, line2]);
            // max distance
            double maxDist = 0;
            if (extremePoints != null)
            {
                maxDist = GetMaxDistance(extremePoints);
            }
            // get the sum of the lengths of the two lines
            double lengthSum = line1.Length + line2.Length;
            // Check if lines are collinear and if max distance is less than or equal to the sum of the lengths plus some tolerance
            return AreCollinear(line1, line2) && maxDist <= lengthSum + MINGAP + TOLERANCE;
        }

        // given two collinear lines retun the maximum distance they can make
        // from each of their points and those extreme points that created
        // that maximum distance
        public static Tuple<XYZ, XYZ> GetExtremePoints(List<Line> lines)
        {
            XYZ p1 = new();
            XYZ p2 = new();
            double maxDist = 0;

            List<XYZ> points = [];
            foreach (Line line in lines)
            {
                points.Add(line.GetEndPoint(0));
                points.Add(line.GetEndPoint(1));
            }

            for (int i = 0; i < points.Count - 1; i++)
            {
                for (int j = i + 1; j < points.Count; j++)
                {
                    double dist = (points[j] - points[i]).GetLength();
                    if (maxDist < dist)
                    {
                        p1 = new XYZ(points[i].X, points[i].Y, points[i].Z);
                        p2 = new XYZ(points[j].X, points[j].Y, points[j].Z);
                        maxDist = dist;
                    }
                }
            }
            return Tuple.Create(p1, p2);
        }
        public static bool IsPerpendicularIntersect(Line line1, Line line2)
        {
            // Calculate the midpoint of line2
            XYZ midPoint2 = new((line2.GetEndPoint(0).X + line2.GetEndPoint(1).X) / 2, (line2.GetEndPoint(0).Y + line2.GetEndPoint(1).Y) / 2, 0);

            // Create a line that is perpendicular to line2 and passes through its midpoint
            Line perpLine = Line.CreateUnbound(midPoint2, new XYZ(-line2.Direction.Y, line2.Direction.X, 0));

            // Check if perpLine intersects with line1
            SetComparisonResult intersect = perpLine.Intersect(line1, out _);

            // Return true if perpLine intersects with line1, false otherwise
            return intersect == SetComparisonResult.Overlap;
        }
        public static bool IsPerpendicularIntersectAtMidpoint(Line line1, Line line2)
        {
            // Calculate the midpoint of line1 and line2
            XYZ midPoint1 = new((line1.GetEndPoint(0).X + line1.GetEndPoint(1).X) / 2, (line1.GetEndPoint(0).Y + line1.GetEndPoint(1).Y) / 2, 0);
            XYZ midPoint2 = new((line2.GetEndPoint(0).X + line2.GetEndPoint(1).X) / 2, (line2.GetEndPoint(0).Y + line2.GetEndPoint(1).Y) / 2, 0);

            // Create a line that is perpendicular to line2 and passes through its midpoint
            Line perpLine = Line.CreateUnbound(midPoint2, new XYZ(-line2.Direction.Y, line2.Direction.X, 0));

            // Check if perpLine intersects with line1
            SetComparisonResult intersect = perpLine.Intersect(line1, out IntersectionResultArray results);

            // If perpLine intersects with line1, check if the intersection point is the midpoint of line1
            if (intersect == SetComparisonResult.Overlap)
            {
                XYZ intersectPoint = results.get_Item(0).XYZPoint;
                return intersectPoint.IsAlmostEqualTo(midPoint1, TOLERANCE);
            }

            // Return false if perpLine does not intersect with line1
            return false;
        }

        public static Line OrientLine(Line line, Line referenceLine)
        {
            XYZ direction1 = line.Direction;
            XYZ direction2 = referenceLine.Direction;

            // If the lines are not pointing in the same direction, reverse one of them
            if (direction1.DotProduct(direction2) < 0)
            {
                return Line.CreateBound(line.GetEndPoint(1), line.GetEndPoint(0));
            }

            return line;
        }

        public static List<Line> StandardizeDirection(List<Line> collinearLines, Line referenceLine)
        {
            for (int i = 0; i < collinearLines.Count; i++)
            {
                collinearLines[i] = OrientLine(collinearLines[i], referenceLine);
            }
            return collinearLines;
        }

        public static XYZ ProjectOnto(XYZ point, Line line)
        {
            XYZ lineDirection = line.Direction.Normalize(); // Get the direction of the line
            XYZ vec = point - line.GetEndPoint(0); // Vector from one end of the line to the point

            // Calculate the projection of vec onto lineDirection using the dot product
            double projectionLength = vec.DotProduct(lineDirection);

            // Calculate the coordinates of the projected point
            return line.GetEndPoint(0) + (lineDirection * projectionLength);
        }

        public static Line ProjectOnto(this Line line1, Line line2)
        {
            // Get the direction vectors of the lines
            XYZ v1 = line1.Direction;
            XYZ v2 = line2.Direction;

            // Calculate the scalar projection of v1 onto v2
            double scalarProjection = v1.DotProduct(v2.Normalize());

            // Calculate the vector projection of v1 onto v2
            XYZ vectorProjection = v2.Normalize().Multiply(scalarProjection);

            // Create a new line for the projection
            XYZ startPoint = line1.GetEndPoint(0);
            XYZ endPoint = startPoint.Add(vectorProjection);
            return Line.CreateBound(startPoint, endPoint);
        }

        public static bool DoesOverlap(this Line line1, Line line2)
        {
            // Get the intersection result of the lines
            SetComparisonResult result = line1.Intersect(line2);

            // Check if the lines overlap
            return result == SetComparisonResult.Overlap;
        }

        public static List<XYZ> PointsProjectedHalfWay(Line line1, Line line2)
        {
            // Get the points on each line
            XYZ p1 = line1.GetEndPoint(0);
            XYZ p2 = line1.GetEndPoint(1);

            XYZ p3 = line2.GetEndPoint(0);
            XYZ p4 = line2.GetEndPoint(1);

            // ShortestDistanceVector scaled to half
            XYZ dir = ShortestDistanceVector(line1, line2) / 2;

            // Add half of shortest distance vector to points on line1
            // Subtract half of shortes distance vector from points on line2
            // By doing so we effectively project all of the points on the lines
            // to a position equidistant to both of the parallel lines. 

            XYZ newPt1 = p1 + dir;
            XYZ newPt2 = p2 + dir;
            XYZ newPt3 = p3 - dir;
            XYZ newPt4 = p4 - dir;

            // return the projected points as a list
            return [newPt1, newPt2, newPt3, newPt4];
        }

        public static Line Midline(List<XYZ> projectedPoints)
        {
            // Initialize variables to store the extreme points
            XYZ? point1 = null;
            XYZ? point2 = null;
            double maxDistance = 0;

            // Compare each pair of points to find the pair with the maximum distance
            for (int i = 0; i < projectedPoints.Count - 1; i++)
            {
                for (int j = i + 1; j < projectedPoints.Count; j++)
                {
                    double distance = projectedPoints[i].DistanceTo(projectedPoints[j]);
                    if (!(distance > maxDistance)) continue;
                    maxDistance = distance;
                    point1 = projectedPoints[i];
                    point2 = projectedPoints[j];
                }
            }

            // Create a line between the extreme points

            return Line.CreateBound(point1, point2);
        }

        public static Dictionary<string, List<Line>> GroupLinesByDirection(List<Line> lines)
        {
            var linesByDirection = new Dictionary<string, List<Line>>();
            int groupCounter = 1;

            for (int i = 0; i < lines.Count; i++)
            {
                Line line = lines[i];
                bool addedToGroup = false;
                foreach (var kvp in linesByDirection)
                {
                    Line groupLine = kvp.Value[0];
                    if (AreParallel(line, groupLine))
                    {
                        if (line.Direction.Normalize().IsAlmostEqualTo(-groupLine.Direction.Normalize()))
                        {
                            lines[i] = Line.CreateBound(line.GetEndPoint(1), line.GetEndPoint(0));
                        }

                        kvp.Value.Add(lines[i]);
                        addedToGroup = true;
                        break;
                    }
                }

                if (!addedToGroup)
                {
                    linesByDirection.Add($"parallelGroup-{groupCounter++}", [lines[i]]);
                }
            }

            return linesByDirection;
        }

        public static List<Line> SortLinesByDistance(List<Line> lines)
        {
            Line maxDistLine1 = Line.CreateBound(new XYZ(0, 0, 0), new XYZ(1, 1, 1));
            Line maxDistLine2 = Line.CreateBound(new XYZ(0, 0, 0), new XYZ(1, 1, 1));

            double maxDistance = double.MinValue;

            for (int i = 0; i < lines.Count; i++)
            {
                for (int j = i + 1; j < lines.Count; j++)
                {
                    double distance = lines[i].GetEndPoint(0).DistanceTo(lines[j].GetEndPoint(0));
                    if (distance > maxDistance)
                    {
                        maxDistance = distance;
                        maxDistLine1 = lines[i];
                        maxDistLine2 = lines[j];
                    }
                }
            }

            lines.Remove(maxDistLine1);
            lines.Remove(maxDistLine2);

            Line startLine = maxDistLine1;

            lines.Sort((line1, line2) =>
            {
                XYZ start1 = line1.GetEndPoint(0);
                XYZ start2 = line2.GetEndPoint(0);
                XYZ currentStart = startLine.GetEndPoint(0);

                double distance1 = start1.DistanceTo(currentStart);
                double distance2 = start2.DistanceTo(currentStart);

                return distance1.CompareTo(distance2);
            });

            var sortedLines = new List<Line>
            {
                startLine
            };
            sortedLines.AddRange(lines);
            sortedLines.Add(maxDistLine2);

            return sortedLines;
        }

        public static Dictionary<string, List<Line>> OrganizeLinesByDirectionAndDistance(List<Line> lines)
        {
            var linesByDirection = GroupLinesByDirection(lines);
            var sortedLinesByDirection = new Dictionary<string, List<Line>>();

            foreach (var kvp in linesByDirection)
            {
                var sortedLines = SortLinesByDistance(kvp.Value);
                sortedLinesByDirection.Add(kvp.Key, sortedLines);
            }

            return sortedLinesByDirection;
        }

        public static bool AreMidPointsAlmostEqualTo(Line line1, Line line2)
        {
            const double TOLERANCE = 0.001;
            XYZ midPoint1 = 0.5 * (line1.GetEndPoint(0) + line1.GetEndPoint(1));
            XYZ midPoint2 = 0.5 * (line2.GetEndPoint(0) + line2.GetEndPoint(1));

            return midPoint1.IsAlmostEqualTo(midPoint2, TOLERANCE);
        }

        // Check if lines are collinear and overlapping
        public static bool AreLinesOverlapping(Line line1, Line line2)
        {
            const double OVERLAP_PERCENT = 0.1;

            // Check if the lines are collinear
            if (!AreCollinear(line1, line2))
            {
                return false;
            }

            // Calculate the maximum distance between the extreme points
            double maxDistance = Math.Max(
                Math.Max(line1.GetEndPoint(0).DistanceTo(line2.GetEndPoint(0)), line1.GetEndPoint(0).DistanceTo(line2.GetEndPoint(1))),
                Math.Max(line1.GetEndPoint(1).DistanceTo(line2.GetEndPoint(0)), line1.GetEndPoint(1).DistanceTo(line2.GetEndPoint(1)))
            );

            // Calculate the sum of the lengths of the lines
            double sumOfLengths = line1.Length + line2.Length;

            // Adjust the tolerance to allow for significant overlap
            double overlapThreshold = OVERLAP_PERCENT * sumOfLengths; // You can adjust this threshold as needed

            // If the maximum distance is less than the overlap threshold, consider them overlapping
            return maxDistance < sumOfLengths - overlapThreshold;
        }

        public static bool IsLineInsideAnother(Line doorLine, Line wallLine)
        {
            // Check if the start and end points of the door line are on the wall line
            bool isStartOnWallLine = IsPointOnLine(doorLine.GetEndPoint(0), wallLine);
            bool isEndOnWallLine = IsPointOnLine(doorLine.GetEndPoint(1), wallLine);

            // Check if any point on the door line is not on the wall line
            bool isAnyPointOutside = false;
            for (double i = 0; i <= 1; i += 0.01)
            {
                XYZ pointOnDoorLine = doorLine.Evaluate(i, true);
                if (!IsPointOnLine(pointOnDoorLine, wallLine))
                {
                    isAnyPointOutside = true;
                    break;
                }
            }

            return isStartOnWallLine && isEndOnWallLine && !isAnyPointOutside;
        }

        public static bool IsPointOnLine(XYZ point, Line line)
        {
            // Calculate the distances between the point and the line's endpoints
            double d1 = point.DistanceTo(line.GetEndPoint(0));
            double d2 = point.DistanceTo(line.GetEndPoint(1));

            // Calculate the length of the line
            double lineLength = line.Length;

            // The point is on the line if the sum of d1 and d2 is equal to the line's length
            // (with some tolerance to account for floating point errors)
            return Math.Abs(d1 + d2 - lineLength) < 0.0001;
        }

        public static Wall? FindHostWall(Line line, List<Wall> walls)
        {
            const double Tolerance = 0.001;
            return walls.FirstOrDefault(wall =>
            {
                LocationCurve? wallLocation = wall.Location as LocationCurve;
                Line wallLine = wallLocation.Curve as Line;

                XYZ distanceVector = ShortestDistanceVector(line, wallLine);

                // The magnitude of the distanceVector is the shortest distance between the two lines
                double distance = distanceVector.GetLength();

                // Check if the line is fully inside the wall center line
                bool isInside = IsLineInsideAnother(line, wallLine);

                // Check if the line and the wall line are collinear
                bool areCollinear = AreCollinear(line, wallLine);

                return distance < Tolerance && isInside && areCollinear; // Adjust the threshold as needed
            });
        }
    }
}
