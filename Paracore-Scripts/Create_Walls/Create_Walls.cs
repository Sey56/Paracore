using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
Comprehensive wall creation tool supporting multiple automation modes:
- Room Boundaries: Create walls around selected rooms automatically
- Grid Layout: Generate repetitive wall grids for offices, hotels, apartments
- Coordinates: Import walls from CSV/Excel coordinate data
- Perimeter: Create exterior walls from building footprint

UsageExamples:
- "Create walls around all rooms on Level 1"
- "Generate a 5x5 office grid with 3m spacing"
- "Create perimeter walls for the building footprint"
- "Import walls from coordinates file"
*/

// Initialize Parameters from separate file
var p = new Params();

// Get Level
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.levelName);

if (level == null)
{
    Println($"❌ Level '{p.levelName}' not found.");
    return;
}

// Get Wall Type
WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(wt => wt.Name == p.wallTypeName);

if (wallType == null)
{
    Println($"❌ Wall type '{p.wallTypeName}' not found.");
    return;
}

int wallsCreated = 0;

Transact($"Create Walls - {p.creationMode}", () =>
{
    switch (p.creationMode)
    {
        case "RoomBoundaries":
            wallsCreated = RoomBoundaryWalls.Create(
                Doc, level, wallType, p.wallHeightMeters, 
                p.roomBounding, p.wallOffsetMm);
            break;

        case "Grid":
            wallsCreated = GridWalls.Create(
                Doc, level, wallType, p.wallHeightMeters,
                p.gridSpacingXMeters, p.gridSpacingYMeters,
                p.gridCountX, p.gridCountY,
                p.gridOriginXMeters, p.gridOriginYMeters,
                p.roomBounding);
            break;

        case "Coordinates":
            if (string.IsNullOrEmpty(p.csvFilePath))
            {
                Println("❌ CSV file path is required for Coordinates mode.");
                return;
            }
            wallsCreated = CoordinateWalls.Create(
                Doc, level, wallType, p.wallHeightMeters, p.csvFilePath, p.roomBounding);
            break;

        case "Perimeter":
            wallsCreated = PerimeterWalls.Create(
                Doc, level, wallType, p.wallHeightMeters, p.useModelLines, p.roomBounding);
            break;

        default:
            Println($"❌ Unknown creation mode: {p.creationMode}");
            return;
    }
});

// Print result FIRST for agent summary
if (wallsCreated > 0)
{
    Println($"✅ Successfully created {wallsCreated} walls using {p.creationMode} mode.");
}
else
{
    Println($"⚠️ No walls were created. Check your parameters and try again.");
}

// Then print configuration details
Println($"🔧 Wall Creation Mode: {p.creationMode}");
Println($"📍 Level: {p.levelName}");
Println($"🧱 Wall Type: {p.wallTypeName}");
Println($"📏 Wall Height: {p.wallHeightMeters}m");
Println($"🏠 Room Bounding: {p.roomBounding}");
