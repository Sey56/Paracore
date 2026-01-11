using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;

// Instantiate Parameters
var p = new Params();

// Retrieve selected Revit elements
var room = p.GetRoom(p.RoomName);
var floorType = p.GetFloorType(p.FloorTypeName);

// Validate retrieved elements
if (room == null)
{
    throw new Exception($"🚫 Room '{p.RoomName}' not found or invalid.");
}
if (floorType == null)
{
    throw new Exception($"🚫 Floor Type '{p.FloorTypeName}' not found or invalid.");
}

// Ensure the room has a level associated
if (room.LevelId == ElementId.InvalidElementId)
{
    throw new Exception($"🚫 Room '{p.RoomName}' does not have a valid associated Level.");
}
var roomLevel = Doc.GetElement(room.LevelId) as Level;
if (roomLevel == null)
{
    throw new Exception($"🚫 The Level associated with room '{p.RoomName}' could not be retrieved.");
}

// Get the room's bounding box to define the grid generation area
// Using the BoundingBoxXYZ of the room provides a rectangular extent.
// The IsPointInRoom check will filter tiles to be strictly within the room's actual shape.
var roomBb = room.get_BoundingBox(null);
if (roomBb == null)
{
    throw new Exception($"🚫 Could not retrieve bounding box for room '{p.RoomName}'.");
}

// Tile spacing and max offset are already in internal units (feet) due to [Unit("m")] attribute.
double tileSize = p.TileSpacing;
double maxOffset = p.MaxOffset;

// Prepare for random offset if enabled
Random random = p.RandomizeOffset ? new Random() : null;

// Store profiles to create floors in a single transaction
var floorProfiles = new List<CurveLoop>();

// Pre-calculate z-coordinate for floor creation (at room's level elevation)
double zCoord = roomLevel.Elevation;

// Iterate through the bounding box to create tile profiles
// Iterate with tileSize / 2 offset to place the center of the first tile for more accurate IsPointInRoom checks
double startX = roomBb.Min.X;
double startY = roomBb.Min.Y;

// Add a small epsilon to the end condition to ensure full coverage up to the max bound
// and adjust for floating point inaccuracies typical in Revit geometry.
double epsilon = 0.0001; // Small value in feet (approx. 0.003 mm)

// List to store IDs of newly created floors for selection
List<ElementId> newFloorElementIds = new List<ElementId>();
int createdCount = 0;

for (double x = startX; x < roomBb.Max.X - epsilon; x += tileSize)
{
    for (double y = startY; y < roomBb.Max.Y - epsilon; y += tileSize)
    {
        // Calculate the center of the potential tile
        XYZ tileCenter = new XYZ(x + tileSize / 2, y + tileSize / 2, zCoord);

        // Check if the center of the tile is within the room
        if (room.IsPointInRoom(tileCenter))
        {
            // Apply random offset if enabled
            double offsetX = 0;
            double offsetY = 0;
            if (p.RandomizeOffset && random != null)
            {
                // Generate random values between -maxOffset and +maxOffset
                offsetX = (random.NextDouble() * 2 - 1) * maxOffset;
                offsetY = (random.NextDouble() * 2 - 1) * maxOffset;
            }

            // Define the four corners of the tile, applying offset
            XYZ pt1 = new XYZ(x + offsetX, y + offsetY, zCoord);
            XYZ pt2 = new XYZ(x + tileSize + offsetX, y + offsetY, zCoord);
            XYZ pt3 = new XYZ(x + tileSize + offsetX, y + tileSize + offsetY, zCoord);
            XYZ pt4 = new XYZ(x + offsetX, y + tileSize + offsetY, zCoord);

            // Create a curve loop for the floor profile
            var profile = new CurveLoop();
            Line line1 = Line.CreateBound(pt1, pt2);
            Line line2 = Line.CreateBound(pt2, pt3);
            Line line3 = Line.CreateBound(pt3, pt4);
            Line line4 = Line.CreateBound(pt4, pt1);

            // Validate curve length (Revit API requirement: length > 0.0026 ft)
            if (line1.Length > 0.0026 && line2.Length > 0.0026 && line3.Length > 0.0026 && line4.Length > 0.0026)
            {
                profile.Append(line1);
                profile.Append(line2);
                profile.Append(line3);
                profile.Append(line4);
                floorProfiles.Add(profile);
            }
        }
    }
}

// Perform all DB modifications in a single transaction
if (floorProfiles.Any())
{
    Transact("Create Floor Pattern", () =>
    {
        foreach (var profile in floorProfiles)
        {
            try
            {
                // Floor.Create(Document doc, IList<CurveLoop> profile, ElementId floorTypeId, ElementId levelId)
                // This creates an architectural floor.
                Floor newFloor = Floor.Create(Doc, new List<CurveLoop> { profile }, floorType.Id, roomLevel.Id);
                newFloorElementIds.Add(newFloor.Id);
                createdCount++;
            }
            catch (Exception ex)
            {
                // Re-throw to ensure the transaction rolls back for any error during floor creation
                throw new Exception($"Failed to create a floor tile: {ex.Message}");
            }
        }
    });

    Println($"✅ Successfully created {createdCount} floor tiles using '{floorType.Name}' in room '{room.Name}'.");
    // Select the newly created floors
    UIDoc.Selection.SetElementIds(newFloorElementIds);
}
else
{
    throw new Exception("🚫 No valid floor tile profiles could be generated within the room's boundaries. Adjust tile spacing or room selection.");
}