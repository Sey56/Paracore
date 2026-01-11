using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;

public class Params
{
    #region Room and Floor Selection
    /// <summary>Select a room to generate floor tiles within. Only named rooms are shown.</summary>
    [RevitElements(TargetType = "Room"), Required]
    public string RoomName { get; set; }

    /// <summary>Select the floor type for the tiles.</summary>
    [RevitElements(TargetType = "FloorType"), Required]
    public string FloorTypeName { get; set; }
    #endregion

    #region Tile Geometry
    /// <summary>Spacing between floor tiles (in meters).</summary>
    [Unit("m")]
    public double TileSpacing { get; set; } = 0.5;

    /// <summary>Check to add a random offset to each tile.</summary>
    public bool RandomizeOffset { get; set; } = false;

    /// <summary>Maximum random offset for tiles (in meters).</summary>
    [Unit("m")]
    [Range(0, 1.0, 0.05)] // Default range, will be updated dynamically if RandomizeOffset is true
    public double MaxOffset { get; set; } = 0.1;
    #endregion

    // Dynamic parameter logic

    /// <summary>
    /// Populates the RoomName dropdown with only named rooms.
    /// </summary>
    public List<string> RoomName_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .Where(r => !string.IsNullOrEmpty(r.Name)) // Filter for named rooms
            .Select(r => r.Name)
            .ToList();
    }

    /// <summary>
    /// Dynamically sets the range for TileSpacing based on the selected room's perimeter.
    /// Max is 10% of perimeter, rounded to nearest 0.5m.
    /// </summary>
    public (double min, double max, double step) TileSpacing_Range
    {
        get
        {
            const double minSpacingMeters = 0.1; // Minimum spacing in meters
            const double stepMeters = 0.05;      // Step for the slider in meters

            var room = GetRoom(RoomName);
            if (room == null)
            {
                // Default range if room not found or not yet selected
                return (minSpacingMeters, 1.0, stepMeters);
            }

            // Calculate room perimeter
            var boundarySegments = room.GetBoundarySegments(new SpatialElementBoundaryOptions());
            double perimeterFeet = 0.0;
            foreach (var segmentList in boundarySegments)
            {
                foreach (var segment in segmentList)
                {
                    perimeterFeet += segment.GetCurve().Length;
                }
            }

            double perimeterMeters = UnitUtils.ConvertFromInternalUnits(perimeterFeet, UnitTypeId.Meters);

            // Max spacing is 10% of perimeter, rounded to nearest 0.5m
            double calculatedMaxSpacingMeters = perimeterMeters * 0.10;
            double roundedMaxSpacingMeters = Math.Round(calculatedMaxSpacingMeters / 0.5) * 0.5;

            // Ensure max spacing is at least minSpacing and not ridiculously large
            double finalMaxSpacingMeters = Math.Max(minSpacingMeters, roundedMaxSpacingMeters);
            finalMaxSpacingMeters = Math.Min(finalMaxSpacingMeters, 20.0); // Cap at a reasonable max like 20m

            // IMPORTANT: Adjust TileSpacing if it's out of the new calculated range
            if (TileSpacing < minSpacingMeters)
            {
                TileSpacing = minSpacingMeters;
            }
            else if (TileSpacing > finalMaxSpacingMeters)
            {
                // If current value is greater than the new max, clamp it to the new max
                // Also, round to the nearest step to make it a valid slider value
                TileSpacing = Math.Floor(finalMaxSpacingMeters / stepMeters) * stepMeters;
            }

            return (minSpacingMeters, finalMaxSpacingMeters, stepMeters);
        }
    }

    /// <summary>
    /// Controls the visibility of the MaxOffset parameter.
    /// </summary>
    public bool MaxOffset_Visible => RandomizeOffset;

    // Helper methods to retrieve Revit elements
    public Room GetRoom(string roomName)
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .FirstOrDefault(r => r.Name == roomName);
    }

    public FloorType GetFloorType(string floorTypeName)
    {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(FloorType))
            .Cast<FloorType>()
            .FirstOrDefault(ft => ft.Name == floorTypeName);
    }
}