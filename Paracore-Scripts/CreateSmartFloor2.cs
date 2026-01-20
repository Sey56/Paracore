using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Linq;
using System.Collections.Generic;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Generates a grid of small floor tiles within a selected room. 
Supports random offsets for a more natural or decorative tiling effect.

UsageExamples:
- "Generate floor tiles in the Kitchen"
- "Create a tiling pattern with 1m spacing"
- "Randomize floor tile positions in Room 101"
*/

// 1. Instantiate Parameters
var p = new Params();

// 2. Logic (Read-only preparation)
Room selectedRoom = null;
FloorType tileFloorType = null;
Level roomLevel = null;

// Retrieve the selected room based on the parameter value
var rooms = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .WhereElementIsNotElementType()
    .Cast<Room>()
    .ToList();

selectedRoom = rooms.FirstOrDefault(r => r.Name == p.SelectedRoom);

if (selectedRoom == null)
{
    Println($"🚫 Selected Room '{p.SelectedRoom}' not found or is invalid.");
    return;
}

// Retrieve the selected floor type for tiles
tileFloorType = new FilteredElementCollector(Doc)
    .OfClass(typeof(FloorType))
    .Cast<FloorType>()
    .FirstOrDefault(ft => ft.Name == p.TileFloorType);

if (tileFloorType == null)
{
    Println($"🚫 Selected Floor Type '{p.TileFloorType}' not found.");
    return;
}

// Get the level associated with the room
roomLevel = Doc.GetElement(selectedRoom.LevelId) as Level;
if (roomLevel == null)
{
    Println($"🚫 Could not determine the level for room '{selectedRoom.Name}'.");
    return;
}

// Convert tile spacing from meters (UI) to internal units (feet)
double tileSpacingInternal = UnitUtils.ConvertToInternalUnits(p.TileSpacing, UnitTypeId.Meters);
if (tileSpacingInternal <= 0.0026) // Revit minimum length for curves
{
    Println("🚫 Tile Spacing must be greater than 0.");
    return;
}

// Calculate internal units for max offset if randomization is enabled
double maxOffsetInternal = 0;
if (p.RandomizeOffset)
{
    maxOffsetInternal = UnitUtils.ConvertToInternalUnits(p.MaxOffset, UnitTypeId.Meters);
    if (maxOffsetInternal < 0) maxOffsetInternal = 0; // Ensure non-negative offset
}

// Get the room's bounding box to define the generation area
BoundingBoxXYZ roomBBox = selectedRoom.get_BoundingBox(null);
if (roomBBox == null || roomBBox.Max.X <= roomBBox.Min.X + 0.0026 || roomBBox.Max.Y <= roomBBox.Min.Y + 0.0026)
{
    Println("🚫 Room bounding box is invalid or too small. Cannot generate tiles.");
    return;
}

// Define the grid boundaries based on the room's bounding box
double minX = roomBBox.Min.X;
double minY = roomBBox.Min.Y;
double maxX = roomBBox.Max.X;
double maxY = roomBBox.Max.Y;

// Assume square tiles where X and Y dimensions are equal to tileSpacing
double tileDimX = tileSpacingInternal;
double tileDimY = tileSpacingInternal;

List<CurveLoop> tileProfiles = new List<CurveLoop>();
Random rnd = p.RandomizeOffset ? new Random() : null; // Initialize Random only if needed
int createdCount = 0;

// Iterate through the bounding box of the room to determine tile placement positions
for (double x = minX - maxOffsetInternal; x < maxX + maxOffsetInternal; x += tileDimX) // Extend bounds slightly for offset tiles
{
    for (double y = minY - maxOffsetInternal; y < maxY + maxOffsetInternal; y += tileDimY) // Extend bounds slightly for offset tiles
    {
        double currentX = x;
        double currentY = y;

        // Apply random offset if enabled
        if (p.RandomizeOffset && rnd != null)
        {
            // Generate offset in range [-maxOffsetInternal, +maxOffsetInternal]
            currentX += (rnd.NextDouble() * 2 - 1) * maxOffsetInternal;
            currentY += (rnd.NextDouble() * 2 - 1) * maxOffsetInternal;
        }

        // Calculate the center of the potential tile for the room boundary check
        XYZ tileCenter = new XYZ(currentX + tileDimX / 2.0, currentY + tileDimY / 2.0, roomLevel.Elevation);

        // Check if the tile's center is within the actual room boundary (not just its bounding box)
        if (selectedRoom.IsPointInRoom(tileCenter))
        {
            // Define the four corner points of the square tile at the room's level elevation
            XYZ p0 = new XYZ(currentX, currentY, roomLevel.Elevation);
            XYZ p1 = new XYZ(currentX + tileDimX, currentY, roomLevel.Elevation);
            XYZ p2 = new XYZ(currentX + tileDimX, currentY + tileDimY, roomLevel.Elevation);
            XYZ p3 = new XYZ(currentX, currentY + tileDimY, roomLevel.Elevation);

            // Ensure curve segments have a valid length for Revit API
            if (p0.DistanceTo(p1) > 0.0026 && p1.DistanceTo(p2) > 0.0026 &&
                p2.DistanceTo(p3) > 0.0026 && p3.DistanceTo(p0) > 0.0026)
            {
                CurveLoop profile = new CurveLoop();
                profile.Append(Line.CreateBound(p0, p1));
                profile.Append(Line.CreateBound(p1, p2));
                profile.Append(Line.CreateBound(p2, p3));
                profile.Append(Line.CreateBound(p3, p0));
                tileProfiles.Add(profile);
            }
        }
    }
}

if (!tileProfiles.Any())
{
    Println("🚫 No valid tile profiles generated within the room's boundaries. Adjust spacing or room size/shape.");
    return;
}

// 3. Execution (Single Transaction for all creations)
Transact("Create Floor Pattern", () =>
{
    foreach (var profile in tileProfiles)
    {
        try
        {
            // Create a new floor element for each tile profile
            Floor.Create(Doc, new List<CurveLoop> { profile }, tileFloorType.Id, roomLevel.Id);
            createdCount++;
        }
        catch (Exception ex)
        {
            // Log individual tile creation errors but continue to attempt other tiles
            Println($"⚠️ Failed to create a tile at elevation {roomLevel.Elevation} due to: {ex.Message}");
        }
    }
});

Println($"✅ Successfully created {createdCount} floor tiles in room '{selectedRoom.Name}'.");

// 4. Class Definitions (MUST BE LAST)
public class Params
{
    #region 1. Room Selection
    /// <summary>Select a room to generate floor tiles in. Only named rooms with area are listed.</summary>
    [RevitElements(TargetType = "Room"), Required]
    public string SelectedRoom { get; set; }


    // Provides options for the SelectedRoom dropdown, filtering for named rooms with area
    public List<string> SelectedRoom_Options => new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
        .Cast<Room>()
        .Where(r => !string.IsNullOrEmpty(r.Name) && r.Area > 0) // Ensure room has a name and area
        .Select(r => r.Name)
        .OrderBy(n => n)
        .ToList();

    #endregion

    #region 2. Tile Type
    /// <summary>The Floor Type to be used for the individual floor tiles.</summary>
    [RevitElements(TargetType = "FloorType"), Required]
    public string TileFloorType { get; set; }

    #endregion

    #region 3. Spacing
    /// <summary>Defines the nominal spacing between the centers of the generated tiles (in meters).</summary>
    [Required]
    public double TileSpacing { get; set; } = 1.0;

    // Defines the dynamic range for the Tile Spacing slider
    public (double min, double max, double step) TileSpacing_Range
    {
        get
        {
            double minSpacingMeters = 0.1; // Minimum allowed tile spacing
            double stepMeters = 0.5;       // Step increment for the slider

            // Default max perimeter if no room is selected or invalid
            double maxPerimeterMeters = 10.0;

            var room = new FilteredElementCollector(Doc)
                .OfCategory(BuiltInCategory.OST_Rooms)
                .WhereElementIsNotElementType()
                .Cast<Room>()
                .FirstOrDefault(r => r.Name == SelectedRoom);

            if (room != null && room.Area > 0)
            {
                // Calculate room perimeter from its boundary segments
                SpatialElementBoundaryOptions options = new SpatialElementBoundaryOptions
                {
                    SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Center
                };

                IList<IList<BoundarySegment>> boundarySegments = room.GetBoundarySegments(options);
                double internalPerimeter = 0;

                if (boundarySegments != null)
                {
                    foreach (IList<BoundarySegment> segmentList in boundarySegments)
                    {
                        foreach (BoundarySegment segment in segmentList)
                        {
                            internalPerimeter += segment.GetCurve().Length;
                        }
                    }
                }

                // Convert internal perimeter (feet) to meters
                double perimeterMeters = UnitUtils.ConvertFromInternalUnits(internalPerimeter, UnitTypeId.Meters);

                // Max spacing is 10% of the room's perimeter
                maxPerimeterMeters = perimeterMeters * 0.10;
            }

            // Round the calculated max to the nearest step increment
            double roundedMaxMeters = Math.Round(maxPerimeterMeters / stepMeters) * stepMeters;
            // Ensure the max is at least the minimum spacing
            roundedMaxMeters = Math.Max(minSpacingMeters, roundedMaxMeters);

            return (minSpacingMeters, roundedMaxMeters, stepMeters);
        }
    }
    #endregion

    #region 4. Offset
    /// <summary>If checked, each tile's position will be randomly offset.</summary>

    public bool RandomizeOffset { get; set; } = false;


    /// <summary>Maximum distance (in meters) a tile can be randomly offset from its grid position.</summary>
    public double MaxOffset { get; set; } = 0.1;

    // Controls the visibility of the MaxOffset parameter based on RandomizeOffset
    public bool MaxOffset_Visible => RandomizeOffset;

    // Defines the dynamic range for the Max Offset slider
    public (double min, double max, double step) MaxOffset_Range
    {
        get
        {
            double minOffsetMeters = 0.0;     // Minimum allowed offset
            double stepMeters = 0.01;         // Step increment for the slider

            // Calculate the maximum possible offset, typically half of the current TileSpacing
            double currentTileSpacingInternal = UnitUtils.ConvertToInternalUnits(TileSpacing, UnitTypeId.Meters);
            double maxOffsetInternalUnits = currentTileSpacingInternal / 2.0;

            double maxOffsetMeters = UnitUtils.ConvertFromInternalUnits(maxOffsetInternalUnits, UnitTypeId.Meters);

            // Round the calculated max to the nearest step increment
            double roundedMaxMeters = Math.Round(maxOffsetMeters / stepMeters) * stepMeters;
            // Ensure the max is at least a small positive value if it ends up being zero
            roundedMaxMeters = Math.Max(0.01, roundedMaxMeters);

            return (minOffsetMeters, roundedMaxMeters, stepMeters);
        }
    }

    #endregion
}