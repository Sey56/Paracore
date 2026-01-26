// File: Main.cs
using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Advanced modular tiling script supporting Uniform, Checkerboard, and Random patterns.
Generates floor elements within a selected room's boundary.

UsageExamples:
- "Create checkerboard floor in Living Room"
- "Generate random tile mix"
- "Tile room with offsets"
*/

// 1. Instantiate Parameters
var p = new Params();

// 2. Logic (Read Only) - Preparation Phase
var room = Utils.GetSelectedRoom(Doc, p.RoomName);
if (room == null)
{
    throw new Exception($"🚫 Room '{p.RoomName}' not found or is unnamed. Please select a valid room.");
}

// Resolve Floor Types
var floorTypes = new FilteredElementCollector(Doc)
    .OfClass(typeof(FloorType))
    .Cast<FloorType>()
    .Where(ft => ft.Name.Equals(p.PrimaryFloorType, StringComparison.OrdinalIgnoreCase) || 
                 ft.Name.Equals(p.SecondaryFloorType, StringComparison.OrdinalIgnoreCase))
    .ToList();

var primaryType = floorTypes.FirstOrDefault(ft => ft.Name.Equals(p.PrimaryFloorType, StringComparison.OrdinalIgnoreCase));
if (primaryType == null) throw new Exception($"🚫 Primary Floor Type '{p.PrimaryFloorType}' not found.");

FloorType secondaryType = null;
if (p.Pattern != "Uniform")
{
    // Secondary type is required for non-Uniform patterns, unless user selected same type for both (which is valid but effectively uniform)
    secondaryType = floorTypes.FirstOrDefault(ft => ft.Name.Equals(p.SecondaryFloorType, StringComparison.OrdinalIgnoreCase));
    
    // If user hasn't selected a valid secondary type yet, default to primary to prevent crash
    if (secondaryType == null && !string.IsNullOrEmpty(p.SecondaryFloorType))
    {
         throw new Exception($"🚫 Secondary Floor Type '{p.SecondaryFloorType}' not found.");
    }
    else if (secondaryType == null)
    {
         // Fallback if empty
         secondaryType = primaryType;
    }
}

var level = Doc.GetElement(room.LevelId) as Level;
if (level == null) throw new Exception($"🚫 Level for room '{room.Name}' not found.");

// Unit conversions
double tileSpacingInternal = UnitUtils.ConvertToInternalUnits(p.TileSpacing, UnitTypeId.Meters);
double maxOffsetInternal = p.RandomizeOffset 
    ? UnitUtils.ConvertToInternalUnits(p.MaxOffset, UnitTypeId.Meters) 
    : 0.0;

// Grid Setup
var roomExtent = Utils.GetRoomBoundingBoxXY(room);
double minX = roomExtent.minX - tileSpacingInternal; 
double minY = roomExtent.minY - tileSpacingInternal;
double maxX = roomExtent.maxX + tileSpacingInternal;
double maxY = roomExtent.maxY + tileSpacingInternal;

// Prepare operations list: (Profile, FloorTypeId)
var tilesToCreate = new List<(CurveLoop Profile, ElementId TypeId)>();
var random = new Random();
int gridCol = 0;

// Generate Grid
for (double x = minX; x < maxX; x += tileSpacingInternal)
{
    int gridRow = 0;
    for (double y = minY; y < maxY; y += tileSpacingInternal)
    {
        // 1. Determine Floor Type based on Pattern
        ElementId selectedTypeId = primaryType.Id;
        
        if (p.Pattern == "Checker")
        {
            // Alternate based on grid position
            if ((gridCol + gridRow) % 2 != 0)
            {
                selectedTypeId = secondaryType.Id;
            }
        }
        else if (p.Pattern == "Random")
        {
            // Random chance based on mix percentage
            if (random.Next(100) < p.RandomMixPct)
            {
                selectedTypeId = secondaryType.Id;
            }
        }

        // 2. Calculate Geometry
        XYZ baseCenter = new XYZ(x + tileSpacingInternal / 2, y + tileSpacingInternal / 2, level.Elevation);

        double currentOffsetX = 0;
        double currentOffsetY = 0;
        if (p.RandomizeOffset && maxOffsetInternal > 0.0026)
        {
            currentOffsetX = (random.NextDouble() * 2 - 1) * maxOffsetInternal;
            currentOffsetY = (random.NextDouble() * 2 - 1) * maxOffsetInternal;
        }

        XYZ tileCenter = baseCenter.Add(new XYZ(currentOffsetX, currentOffsetY, 0));

        // Spatial Check
        if (!Utils.IsPointInRoom(room, tileCenter))
        {
            gridRow++;
            continue;
        }

        // Create Profile
        double halfSize = tileSpacingInternal / 2;
        XYZ p1 = new XYZ(tileCenter.X - halfSize, tileCenter.Y - halfSize, level.Elevation);
        XYZ p2 = new XYZ(tileCenter.X + halfSize, tileCenter.Y - halfSize, level.Elevation);
        XYZ p3 = new XYZ(tileCenter.X + halfSize, tileCenter.Y + halfSize, level.Elevation);
        XYZ p4 = new XYZ(tileCenter.X - halfSize, tileCenter.Y + halfSize, level.Elevation);

        var profile = new CurveLoop();
        profile.Append(Line.CreateBound(p1, p2));
        profile.Append(Line.CreateBound(p2, p3));
        profile.Append(Line.CreateBound(p3, p4));
        profile.Append(Line.CreateBound(p4, p1));

        if (profile.Any(c => c.Length > 0.0026))
        {
            tilesToCreate.Add((profile, selectedTypeId));
        }

        gridRow++;
    }
    gridCol++;
}

if (!tilesToCreate.Any())
{
    throw new Exception($"🚫 No valid floor tile profiles generated for '{room.Name}'. Check tile spacing and room boundaries.");
}

// 3. Execution
Transact("Create Floor Pattern", () =>
{
    foreach (var tile in tilesToCreate)
    {
        Floor.Create(Doc, new List<CurveLoop> { tile.Profile }, tile.TypeId, level.Id);
    }
});

// Summary
Println($"✅ Created {tilesToCreate.Count} tiles in '{room.Name}'.");
if (p.Pattern != "Uniform")
{
    int primaryCount = tilesToCreate.Count(t => t.TypeId == primaryType.Id);
    int secondaryCount = tilesToCreate.Count - primaryCount;
    Println($"   - Primary ({primaryType.Name}): {primaryCount}");
    Println($"   - Secondary ({secondaryType.Name}): {secondaryCount}");
}
