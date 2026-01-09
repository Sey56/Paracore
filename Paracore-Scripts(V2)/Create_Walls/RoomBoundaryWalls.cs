using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.Linq;

public class RoomBoundaryWalls
{
    public static int Create(
        Document doc, Level level, WallType wallType, double wallHeightMeters,
        bool roomBounding, double wallOffsetMm)
    {
        int wallsCreated = 0;
        double wallHeightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
        double offsetFt = UnitUtils.ConvertToInternalUnits(wallOffsetMm, UnitTypeId.Millimeters);

        // Get all rooms on the specified level
        var rooms = new FilteredElementCollector(doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .Where(r => r.Level.Id == level.Id && r.Area > 0)
            .ToList();

        // Diagnostic info removed to keep agent summary clean

        foreach (var room in rooms)
        {
            try
            {
                // Get room boundary segments
                var boundaryOptions = new SpatialElementBoundaryOptions
                {
                    SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish
                };

                var boundarySegments = room.GetBoundarySegments(boundaryOptions);
                if (boundarySegments == null || boundarySegments.Count == 0) continue;

                foreach (var segmentList in boundarySegments)
                {
                    foreach (var segment in segmentList)
                    {
                        Curve curve = segment.GetCurve();
                        
                        // Apply offset if specified
                        if (Math.Abs(offsetFt) > 0.001)
                        {
                            XYZ direction = (curve.GetEndPoint(1) - curve.GetEndPoint(0)).Normalize();
                            XYZ perpendicular = new XYZ(-direction.Y, direction.X, 0).Normalize();
                            Transform offset = Transform.CreateTranslation(perpendicular * offsetFt);
                            curve = curve.CreateTransformed(offset);
                        }

                        // Create wall with room-bounding parameter
                        Wall wall = Wall.Create(doc, curve, wallType.Id, level.Id, wallHeightFt, 0, false, roomBounding);
                        wallsCreated++;
                    }
                }
            }
            catch (Exception ex)
            {
                Println($"⚠️ Could not create walls for room '{room.Name}': {ex.Message}");
            }
        }

        return wallsCreated;
    }
}
