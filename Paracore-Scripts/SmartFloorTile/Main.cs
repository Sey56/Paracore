// File: Main.cs
using Autodesk.Revit.DB;

// 1. Instantiate Parameters
var p = new Params();

// 2. Logic (Read Only) - Preparation Phase
var room = Utils.GetSelectedRoom(Doc, p.RoomName);
if (room == null)
{
    throw new Exception($"🚫 Room '{p.RoomName}' not found or is unnamed. Please select a valid room.");
}

var floorType = new FilteredElementCollector(Doc)
    .OfClass(typeof(FloorType))
    .Cast<FloorType>()
    .FirstOrDefault(ft => ft.Name.Equals(p.FloorTypeName, StringComparison.OrdinalIgnoreCase));

if (floorType == null)
{
    throw new Exception($"🚫 Floor Type '{p.FloorTypeName}' not found. Please select a valid floor type.");
}

var level = Doc.GetElement(room.LevelId) as Level;
if (level == null)
{
    throw new Exception($"🚫 Level for room '{room.Name}' not found. Cannot create floors without a valid level.");
}

// Convert user-defined spacing and offset to internal units (feet)
double tileSpacingInternal = UnitUtils.ConvertToInternalUnits(p.TileSpacing, UnitTypeId.Meters);
double maxOffsetInternal = p.RandomizeOffset 
    ? UnitUtils.ConvertToInternalUnits(p.MaxOffset, UnitTypeId.Meters) 
    : 0.0;

// Get room boundary extent for grid generation.
// We expand the range slightly to ensure we cover the entire room even if its boundary points don't align perfectly with the grid.
var roomExtent = Utils.GetRoomBoundingBoxXY(room);
double minX = roomExtent.minX - tileSpacingInternal; 
double minY = roomExtent.minY - tileSpacingInternal;
double maxX = roomExtent.maxX + tileSpacingInternal;
double maxY = roomExtent.maxY + tileSpacingInternal;

// Prepare a list to hold all valid floor profiles
var floorProfiles = new List<CurveLoop>();
var random = new Random();
int createdCount = 0;

// Generate tile profiles
for (double x = minX; x < maxX; x += tileSpacingInternal)
{
    for (double y = minY; y < maxY; y += tileSpacingInternal)
    {
        // Calculate the base center point of the potential tile
        XYZ baseCenter = new XYZ(x + tileSpacingInternal / 2, y + tileSpacingInternal / 2, level.Elevation);

        // Apply random offset if enabled and a meaningful offset is provided
        double currentOffsetX = 0;
        double currentOffsetY = 0;
        if (p.RandomizeOffset && maxOffsetInternal > 0.0026) // Minimum valid offset is > 0.0026 feet
        {
            currentOffsetX = (random.NextDouble() * 2 - 1) * maxOffsetInternal; // Random value between -maxOffset and +maxOffset
            currentOffsetY = (random.NextDouble() * 2 - 1) * maxOffsetInternal;
        }

        XYZ tileCenter = baseCenter.Add(new XYZ(currentOffsetX, currentOffsetY, 0));

        // CRUCIAL: Check if the *center* of the proposed tile is within the room boundary.
        // This is a heuristic to keep tiles mostly inside the room while handling irregular room shapes.
        if (!Utils.IsPointInRoom(room, tileCenter))
        {
            continue; // Skip this tile if its center is outside the room
        }

        // Create the four corner points of the square tile
        XYZ p1 = new XYZ(tileCenter.X - tileSpacingInternal / 2, tileCenter.Y - tileSpacingInternal / 2, level.Elevation);
        XYZ p2 = new XYZ(tileCenter.X + tileSpacingInternal / 2, tileCenter.Y - tileSpacingInternal / 2, level.Elevation);
        XYZ p3 = new XYZ(tileCenter.X + tileSpacingInternal / 2, tileCenter.Y + tileSpacingInternal / 2, level.Elevation);
        XYZ p4 = new XYZ(tileCenter.X - tileSpacingInternal / 2, tileCenter.Y + tileSpacingInternal / 2, level.Elevation);

        // Create the curve loop for the tile
        var profile = new CurveLoop();
        profile.Append(Line.CreateBound(p1, p2));
        profile.Append(Line.CreateBound(p2, p3));
        profile.Append(Line.CreateBound(p3, p4));
        profile.Append(Line.CreateBound(p4, p1));

        // Add to the list if the profile is valid (i.e., has non-zero length segments)
        if (profile.Any(curve => curve.Length > 0.0026)) // Revit's minimum curve length tolerance
        {
            floorProfiles.Add(profile);
        }
    }
}

if (!floorProfiles.Any())
{
    throw new Exception($"🚫 No valid floor tile profiles could be generated within the room boundary of '{room.Name}' with the given tile spacing.");
}

// 3. Execution (Single Transaction for all modifications)
Transact("Create Floor Pattern", () =>
{
    foreach (var profile in floorProfiles)
    {
        // Floor.Create(Doc, profile, floorTypeId, levelId) is the correct overload for architectural floors.
        // In Revit 2025+, it expects an IList<CurveLoop>.
        Floor.Create(Doc, new List<CurveLoop> { profile }, floorType.Id, level.Id);
        createdCount++;
    }
});

Println($"✅ Created {createdCount} floor tiles in room '{room.Name}' using Floor Type '{floorType.Name}'.");