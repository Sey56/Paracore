// File: Params.cs
public class Params
{
    #region Selection
    /// <summary>Select a room to generate floor patterns within. Only named rooms are listed.</summary>
    [RevitElements(TargetType = "Room"), Required]
    public string RoomName { get; set; }

    /// <summary>Provides options for RoomName, filtering out unnamed rooms.</summary>
    public List<string> RoomName_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .Where(r => !string.IsNullOrWhiteSpace(r.Name))
            .Select(r => r.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToList();
    }

    /// <summary>The primary floor type for the tiles.</summary>
    [RevitElements(TargetType = "FloorType"), Required]
    public string PrimaryFloorType { get; set; }

    /// <summary>The secondary floor type (used for Checker/Random patterns).</summary>
    [RevitElements(TargetType = "FloorType")]
    // EnabledWhen removed in favor of dynamic _Enabled property below
    public string SecondaryFloorType { get; set; }

    public bool SecondaryFloorType_Enabled => Pattern != "Uniform";
    
    #endregion

    #region Pattern Settings
    /// <summary>Select the tiling pattern style.</summary>
    [Segmented]
    public string Pattern { get; set; } = "Uniform";
    public List<string> Pattern_Options => new() { "Uniform", "Checker", "Random" };

    /// <summary>Percentage of secondary tiles for the Random pattern.</summary>
    [Range(0, 100, 5), Unit("%")]
    [EnabledWhen("Pattern", "Random")]
    public int RandomMixPct { get; set; } = 30;

    /// <summary>The size (side length) of each square floor tile in meters.</summary>
    [Range(0.1, 10.0, 0.1), Unit("m")]
    public double TileSpacing { get; set; } = 1.0;

    /// <summary>Defines the dynamic range for Tile Spacing based on the selected Room's perimeter.</summary>
    public (double min, double max, double step) TileSpacing_Range
    {
        get
        {
            var room = Utils.GetSelectedRoom(Doc, RoomName);
            double perimeterInternal = 0.0;
            if (room != null)
            {
                perimeterInternal = Utils.GetRoomPerimeter(room);
            }

            double perimeterMeters = UnitUtils.ConvertFromInternalUnits(perimeterInternal, UnitTypeId.Meters);
            double maxSpacingMeters = Math.Max(0.5, perimeterMeters * 0.1);
            maxSpacingMeters = Math.Round(maxSpacingMeters / 0.5) * 0.5;

            return (0.1, Math.Max(0.5, maxSpacingMeters), 0.1);
        }
    }

    /// <summary>If checked, tiles will be randomly offset from their grid position.</summary>
    [ScriptParameter]
    public bool RandomizeOffset { get; set; } = false;

    /// <summary>The maximum random offset distance for tiles in meters.</summary>
    [Range(0.0, 1.0, 0.05), Unit("m")]
    public double MaxOffset { get; set; } = 0.5;

    /// <summary>Controls visibility of Max Offset.</summary>
    public bool MaxOffset_Visible => RandomizeOffset;

    #endregion
}
