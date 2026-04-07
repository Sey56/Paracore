using Autodesk.Revit.DB;

namespace SH_Tools.Models
{
    public class CadDoor
    {
        public Arc Swing { get; set; }
        public Line Leaf { get; set; }
        public Line Opening { get; set; }
        public string StatusMessage { get; set; }

        // These two properties (DoorLine & WallLines) need the Gap to be offsetted. so must be set
        // in the WallLayerModel after Gap is set.
        // The DoorLine should be at the center of the wall, so should be
        // offsetted by half of the wall's width (i.e Gap)
        public (Line?, Line?)? WallLines { get; set; }
        public Line? DoorLine { get; set; }
        public string LayerName { get; set; }
        public string HostLayerName { get; set; }
        public Wall? HostWall { get; set; }
        public double Gap { get; set; } // Host Wall's width
        public XYZ Location { get; set; }  // New property for the door's location

        public CadDoor(Arc swing, Line leaf, Line doorOpeningLine)
        {
            Swing = swing;
            Leaf = leaf;
            Opening = doorOpeningLine;
            Location = Swing.Center;  // Set location to the center of the swing
            // This gap is the host wall's width. so must be set in WallLayerModel
            Gap = 0.0;
            LayerName = "";
            HostLayerName = "";
            StatusMessage = "";
        }

        public void CreateLines(double gap)
        {
            // Now that the Swing and Leaf are oriented, create the DoorLine and WallLines
            DoorLine = CreateDoorLine(gap);
            WallLines = CreateWallLines(gap);
        }

        public Line CreateDoorLine(double gap)
        {
            // Find the arc's center
            XYZ hinge = Swing.Center;
            XYZ leafEndPoint = Leaf.GetEndPoint(1);  // Now this is guaranteed to be the leaf end point

            // Calculate the direction from the leaf's end point to the hinge
            XYZ direction = (leafEndPoint - hinge).Normalize();

            // Calculate the gap vector as the direction scaled by the gap size
            XYZ OffsetVector = direction * gap * 1 / 2;

            // Subtract the OffsetVector from the hinge and door opening endpoint
            hinge -= OffsetVector;
            XYZ doorOpeningEndPoint = Opening.GetEndPoint(1) - OffsetVector;

            // Create the offset line using the offset hinge and door opening endpoint
            return Line.CreateBound(hinge, doorOpeningEndPoint);
        }

        public (Line, Line) CreateWallLines(double gap)
        {
            // Find the arc's center
            XYZ hinge = Swing.Center;
            XYZ leafEndPoint = Leaf.GetEndPoint(1);  // Now this is guaranteed to be the leaf end point

            // Calculate the direction from the leaf's end point to the hinge
            XYZ direction = (leafEndPoint - hinge).Normalize();

            // Calculate the gap vector as the direction scaled by the gap size
            XYZ OffsetVector = direction * gap;

            // Subtract the OffsetVector from the hinge and door opening endpoint
            hinge -= OffsetVector;
            XYZ doorOpeningEndPoint = Opening.GetEndPoint(1) - OffsetVector;

            // Create the Opening
            Line doorOpeningLine = Line.CreateBound(hinge, Opening.GetEndPoint(1));

            // Create the offset line using the offset hinge and door opening endpoint
            Line offsetLine = Line.CreateBound(hinge, doorOpeningEndPoint);

            return (doorOpeningLine, offsetLine);
        }

        public override bool Equals(object? obj)
        {
            if (obj is CadDoor other)
            {
                // Define what makes two CadDoors equal.
                return Leaf.Equals(other.Leaf) && Swing.Equals(other.Swing) && Opening.Equals(other.Opening) && Location.IsAlmostEqualTo(other.Location);
            }

            return false;
        }

        public override int GetHashCode()
        {
            unchecked // Overflow is fine, just wrap
            {
                int hash = 17;
                // Suitable nullity checks etc, of course :)
                hash = hash * 23 + Leaf.GetHashCode();
                hash = hash * 23 + Swing.GetHashCode();
                hash = hash * 23 + Opening.GetHashCode();
                hash = hash * 23 + Location.GetHashCode();
                return hash;
            }
        }
    }
}