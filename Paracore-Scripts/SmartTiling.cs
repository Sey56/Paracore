// File: SmartTiling.cs
using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB.Architecture;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Advanced tiling tool for creating individual floor elements within room boundaries.
Includes automated selection of room levels and randomization for organic patterns.

UsageExamples:
- "smart tiling for the living room"
- "create tile patterns from CSV"
- "generate floor tiles with random offset"
*/

// 1. Setup Parameters
var p = new Params();

// 2. Retrieve Revit elements (Read-only)
var room = p.GetRoom(p.RoomName);
var floorType = p.GetFloorType(p.FloorTypeName);

if (room == null || floorType == null)
{
    throw new Exception("🚫 Room or Floor Type not found. Please check your selections.");
}

if (room.LevelId == ElementId.InvalidElementId)
{
    throw new Exception($"🚫 Room '{p.RoomName}' is not associated with a valid Level.");
}

var roomLevel = Doc.GetElement(room.LevelId) as Level;
var roomBb = room.get_BoundingBox(null);
if (roomBb == null) throw new Exception("🚫 Could not retrieve room boundaries.");

// 3. Preparation Logic (Read-only)
double tileSize = p.TileSpacing; // CoreScript auto-converts [Unit("m")] to Feet
double maxOffset = p.MaxOffset;
Random random = p.RandomizeOffset ? new Random() : null;
double zCoord = roomLevel.Elevation;
double epsilon = 0.0001; 

List<CurveLoop> validProfiles = new List<CurveLoop>();

// Iterate through the bounding box to find valid tile locations
for (double x = roomBb.Min.X; x < roomBb.Max.X - epsilon; x += tileSize)
{
    for (double y = roomBb.Min.Y; y < roomBb.Max.Y - epsilon; y += tileSize)
    {
        XYZ tileCenter = new XYZ(x + tileSize / 2, y + tileSize / 2, zCoord);

        if (room.IsPointInRoom(tileCenter))
        {
            double offsetX = 0, offsetY = 0;
            if (p.RandomizeOffset && random != null)
            {
                offsetX = (random.NextDouble() * 2 - 1) * maxOffset;
                offsetY = (random.NextDouble() * 2 - 1) * maxOffset;
            }

            XYZ pt1 = new XYZ(x + offsetX, y + offsetY, zCoord);
            XYZ pt2 = new XYZ(x + tileSize + offsetX, y + offsetY, zCoord);
            XYZ pt3 = new XYZ(x + tileSize + offsetX, y + tileSize + offsetY, zCoord);
            XYZ pt4 = new XYZ(x + offsetX, y + tileSize + offsetY, zCoord);

            var profile = new CurveLoop();
            profile.Append(Line.CreateBound(pt1, pt2));
            profile.Append(Line.CreateBound(pt2, pt3));
            profile.Append(Line.CreateBound(pt3, pt4));
            profile.Append(Line.CreateBound(pt4, pt1));
            
            validProfiles.Add(profile);
        }
    }
}

// 4. Execution (Write)
List<ElementId> createdIds = new List<ElementId>();

if (validProfiles.Count > 0)
{
    // FIX: Transaction wraps the loop, NOT the other way around
    Transact("Create Floor Pattern", () =>
    {
        foreach (var profile in validProfiles)
        {
            // Floor.Create requires a list of CurveLoops
            Floor newFloor = Floor.Create(Doc, new List<CurveLoop> { profile }, floorType.Id, roomLevel.Id);
            createdIds.Add(newFloor.Id);
        }
    });

    Println($"✅ Successfully created {createdIds.Count} tiles.");
    UIDoc.Selection.SetElementIds(createdIds);
}
else
{
    Println("⚠️ No tiles were generated. Try decreasing Tile Spacing.");
}

// 5. Parameter Definitions
public class Params
{
    #region Selection
    /// <summary>Select the room to tile.</summary>
    [RevitElements(TargetType = "Room"), Required]
    public string RoomName { get; set; }

    /// <summary>Select the floor type for the tiles.</summary>
    [RevitElements(TargetType = "FloorType"), Required]
    public string FloorTypeName { get; set; }

    #endregion

    #region Geometry
    /// <summary>Tile size and spacing.</summary>
    [Unit("m")]
    public double TileSpacing { get; set; } = 0.6;

    /// <summary>Randomize the tile grid origin.</summary>
    public bool RandomizeOffset { get; set; } = false;

    /// <summary>Maximum randomization distance.</summary>
    [Unit("m")]
    [Range(0, 0.5, 0.01)]
    public double MaxOffset { get; set; } = 0.05;

    #endregion

    // Logic Helpers
    public bool MaxOffset_Visible => RandomizeOffset;

    public List<string> RoomName_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .Where(r => r.Area > 0) 
            .Select(r => r.Name)
            .OrderBy(n => n)
            .ToList();
    }

    public Room GetRoom(string name)
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .FirstOrDefault(r => r.Name == name);
    }

    public FloorType GetFloorType(string name)
    {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(FloorType))
            .Cast<FloorType>()
            .FirstOrDefault(ft => ft.Name == name);
    }
}