using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

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
    .FirstOrDefault(l => l.Name == p.LevelName);

if (level == null)
{
    Println($"❌ Level '{p.LevelName}' not found.");
    return;
}

// Get Wall Type
WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(wt => wt.Name == p.WallTypeName);

if (wallType == null)
{
    Println($"❌ Wall type '{p.WallTypeName}' not found.");
    return;
}

int wallsCreated = 0;

Transact($"Create Walls - {p.CreationMode}", () =>
{
    switch (p.CreationMode)
    {
        case "RoomBoundaries":
            wallsCreated = RoomBoundaryWalls.Create(
                Doc, level, wallType, p.WallHeightMeters, 
                p.RoomBounding, p.WallOffsetMm);
            break;

        case "Grid":
            wallsCreated = GridWalls.Create(
                Doc, level, wallType, p.WallHeightMeters,
                p.GridSpacingXMeters, p.GridSpacingYMeters,
                p.GridCountX, p.GridCountY,
                p.GridOriginXMeters, p.GridOriginYMeters,
                p.RoomBounding);
            break;

        case "Coordinates":
            if (string.IsNullOrEmpty(p.CsvFilePath))
            {
                Println("❌ CSV file path is required for Coordinates mode.");
                return;
            }
            wallsCreated = CoordinateWalls.Create(
                Doc, level, wallType, p.WallHeightMeters, p.CsvFilePath, p.RoomBounding);
            break;

        case "Perimeter":
            wallsCreated = PerimeterWalls.Create(
                Doc, level, wallType, p.WallHeightMeters, p.UseModelLines, p.RoomBounding);
            break;

        default:
            Println($"❌ Unknown creation mode: {p.CreationMode}");
            return;
    }
});

// Print result FIRST for agent summary
if (wallsCreated > 0)
{
    Println($"✅ Successfully created {wallsCreated} walls using {p.CreationMode} mode.");
}
else
{
    Println($"⚠️ No walls were created. Check your parameters and try again.");
}

// Then print configuration details
Println($"🔧 Wall Creation Mode: {p.CreationMode}");
Println($"📍 Level: {p.LevelName}");
Println($"🧱 Wall Type: {p.WallTypeName}");
Println($"📏 Wall Height: {p.WallHeightMeters}m");
Println($"🏠 Room Bounding: {p.RoomBounding}");
