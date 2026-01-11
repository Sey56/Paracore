// File: Params.cs
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;

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
            .Where(r => !string.IsNullOrWhiteSpace(r.Name)) // Filter for rooms that actually have a name
            .Select(r => r.Name)
            .Distinct() // Ensure unique names in the dropdown
            .OrderBy(name => name)
            .ToList();
    }

    /// <summary>Select the Floor Type to be used for the tiles.</summary>
    [RevitElements(TargetType = "FloorType"), Required]
    public string FloorTypeName { get; set; }
    #endregion

    #region Pattern Settings
    /// <summary>The size (side length) of each square floor tile in meters.</summary>
    [Range(0.1, 10.0, 0.1), Unit("m")] // Initial range, will be dynamically adjusted by TileSpacing_Range
    public double TileSpacing { get; set; } = 1.0;

    /// <summary>Defines the dynamic range for Tile Spacing based on the selected Room's perimeter.</summary>
    public (double min, double max, double step) TileSpacing_Range
    {
        get
        {
            // Attempt to retrieve the currently selected room
            var room = Utils.GetSelectedRoom(Doc, RoomName);
            double perimeterInternal = 0.0;
            if (room != null)
            {
                perimeterInternal = Utils.GetRoomPerimeter(room);
            }

            // Convert perimeter from internal units (feet) to meters for calculation
            double perimeterMeters = UnitUtils.ConvertFromInternalUnits(perimeterInternal, UnitTypeId.Meters);

            // Max spacing is 10% of room perimeter. Ensure a reasonable minimum.
            double maxSpacingMeters = Math.Max(0.5, perimeterMeters * 0.1); 

            // Round the calculated Max to the nearest 0.5 step
            maxSpacingMeters = Math.Round(maxSpacingMeters / 0.5) * 0.5;

            // Ensure the minimum is always 0.1 and max is at least 0.5 to avoid degenerate sliders.
            return (0.1, Math.Max(0.5, maxSpacingMeters), 0.1);
        }
    }

    /// <summary>If checked, tiles will be randomly offset from their grid position.</summary>
    [ScriptParameter]
    public bool RandomizeOffset { get; set; } = false;

    /// <summary>The maximum random offset distance for tiles in meters (if Randomize Offset is checked).</summary>
    [Range(0.0, 1.0, 0.05), Unit("m")] // Initial range, Max value is usually small compared to tile size
    public double MaxOffset { get; set; } = 0.5;

    /// <summary>Controls the visibility of the Max Offset parameter based on RandomizeOffset.</summary>
    public bool MaxOffset_Visible => RandomizeOffset;
    #endregion
}