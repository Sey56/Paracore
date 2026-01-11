// File: Utils.cs
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;

public static class Utils
{
    /// <summary>Retrieves a room by its name from the document.</summary>
    /// <param name="doc">The Revit Document.</param>
    /// <param name="roomName">The name of the room to find.</param>
    /// <returns>The Room element, or null if not found or if the name is empty.</returns>
    public static Room GetSelectedRoom(Document doc, string roomName)
    {
        if (string.IsNullOrWhiteSpace(roomName))
        {
            return null;
        }

        return new FilteredElementCollector(doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .FirstOrDefault(r => r.Name.Equals(roomName, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.Name));
    }

    /// <summary>Calculates the perimeter of a room from its boundary segments.</summary>
    /// <param name="room">The room to calculate the perimeter for.</param>
    /// <returns>The total perimeter in internal units (feet).</returns>
    public static double GetRoomPerimeter(Room room)
    {
        if (room == null) return 0.0;

        double perimeter = 0.0;
        SpatialElementBoundaryOptions options = new SpatialElementBoundaryOptions
        {
            SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish // Use the finish face of elements
        };

        // Get the boundary segments, which can be a list of lists for rooms with holes
        IList<IList<BoundarySegment>> segments = room.GetBoundarySegments(options);
        if (segments != null)
        {
            foreach (IList<BoundarySegment> segmentList in segments)
            {
                foreach (BoundarySegment segment in segmentList)
                {
                    Curve curve = segment.GetCurve();
                    if (curve != null && curve.Length > 0.0026) // Ensure curve has valid length
                    {
                        perimeter += curve.Length;
                    }
                }
            }
        }
        return perimeter;
    }

    /// <summary>Calculates the min/max X and Y coordinates of a room's boundary based on its segments.</summary>
    /// <param name="room">The room to determine the bounding box for.</param>
    /// <returns>A tuple containing (minX, minY, maxX, maxY) in internal units (feet).</returns>
    public static (double minX, double minY, double maxX, double maxY) GetRoomBoundingBoxXY(Room room)
    {
        if (room == null) throw new ArgumentNullException(nameof(room));

        double minX = double.MaxValue;
        double minY = double.MaxValue;
        double maxX = double.MinValue;
        double maxY = double.MinValue;

        SpatialElementBoundaryOptions options = new SpatialElementBoundaryOptions
        {
            SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish
        };

        IList<IList<BoundarySegment>> segments = room.GetBoundarySegments(options);
        bool foundSegments = false;

        if (segments != null)
        {
            foreach (IList<BoundarySegment> segmentList in segments)
            {
                foreach (BoundarySegment segment in segmentList)
                {
                    Curve curve = segment.GetCurve();
                    if (curve != null)
                    {
                        XYZ p0 = curve.GetEndPoint(0);
                        XYZ p1 = curve.GetEndPoint(1);

                        minX = Math.Min(minX, Math.Min(p0.X, p1.X));
                        minY = Math.Min(minY, Math.Min(p0.Y, p1.Y));
                        maxX = Math.Max(maxX, Math.Max(p0.X, p1.X));
                        maxY = Math.Max(maxY, Math.Max(p0.Y, p1.Y));
                        foundSegments = true;
                    }
                }
            }
        }
        
        // If no boundary segments were found, fall back to the room's own BoundingBox
        if (!foundSegments)
        {
            BoundingBoxXYZ bb = room.get_BoundingBox(null);
            if (bb != null)
            {
                minX = bb.Min.X;
                minY = bb.Min.Y;
                maxX = bb.Max.X;
                maxY = bb.Max.Y;
            } else {
                 throw new Exception($"🚫 Could not determine valid bounding box or boundary segments for room '{room.Name}'.");
            }
        }

        return (minX, minY, maxX, maxY);
    }

    /// <summary>Checks if a given XYZ point is within the room's spatial boundary.</summary>
    /// <param name="room">The room to check against.</param>
    /// <param name="point">The point to check.</param>
    /// <returns>True if the point is in the room, false otherwise.</returns>
    public static bool IsPointInRoom(Room room, XYZ point)
    {
        if (room == null) return false;

        // Adjust the point's Z-coordinate to be at the room's level elevation plus a small offset.
        // This ensures the point is within the vertical extent typically considered by Room.IsPointInRoom().
        Level roomLevel = room.Document.GetElement(room.LevelId) as Level;
        
        // Use a small fixed offset (e.g., 1 foot or approx 0.3 meters) above the level.
        // This makes the point clearly "inside" vertically, not on a boundary plane.
        double zOffsetInternal = UnitUtils.ConvertToInternalUnits(0.3, UnitTypeId.Meters); 

        XYZ pointAtLevel = new XYZ(point.X, point.Y, roomLevel != null ? roomLevel.Elevation + zOffsetInternal : point.Z);

        return room.IsPointInRoom(pointAtLevel);
    }
}