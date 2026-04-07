using Autodesk.Revit.DB;
using SH_Tools.LineUtils;

namespace SH_Tools.Models
{
    public class CadWindow
    {
        const double TOLERANCE = 0.001;
        public (Line, Line) WindowLines { get; set; }  // The two window lines
        public Line WindowLine { get; set; }  // The mid line for the window
        public string LayerName { get; set; }
        public double SillHeight { get; set; }
        public Wall? HostWall { get; set; }
        public string StatusMessage { get; set; }
        public CadWindow(Line line1, Line line2)
        {
            LayerName = string.Empty;
            StatusMessage = string.Empty;
            WindowLines = (line1, line2);
            // Create the WindowLine (mid line)
            WindowLine = CreateWindowLine();
        }

        public Line CreateWindowLine()
        {
            // Calculate the mid point between the two lines
            XYZ midPoint1 = (WindowLines.Item1.GetEndPoint(0) + WindowLines.Item2.GetEndPoint(0)) / 2;
            XYZ midPoint2 = (WindowLines.Item1.GetEndPoint(1) + WindowLines.Item2.GetEndPoint(1)) / 2;

            // Create the mid line using the mid points
            return Line.CreateBound(midPoint1, midPoint2);
        }

        public override bool Equals(object? obj)
        {
            if (obj is CadWindow other)
            {
                // Get the midpoints of the WindowLines
                XYZ midpointThis = (WindowLine.GetEndPoint(0) + WindowLine.GetEndPoint(1)) / 2;
                XYZ midpointOther = (other.WindowLine.GetEndPoint(0) + other.WindowLine.GetEndPoint(1)) / 2;

                // Check if the midpoints are the same
                bool midPointsMatch = midpointThis.IsAlmostEqualTo(midpointOther, TOLERANCE);

                // Check if the WindowLines are collinear
                bool areLinesCollinear = LineUtility.AreCollinear(WindowLine, other.WindowLine);

                // Define what makes two CadWindows equal.
                return midPointsMatch && areLinesCollinear;
            }

            return false;
        }

        public override int GetHashCode()
        {
            unchecked // Overflow is fine, just wrap
            {
                int hash = 17;
                // Suitable nullity checks etc, of course :)
                hash = hash * 23 + WindowLines.Item1.GetHashCode();
                hash = hash * 23 + WindowLines.Item2.GetHashCode();
                hash = hash * 23 + WindowLine.GetHashCode();
                return hash;
            }
        }
    }
}
