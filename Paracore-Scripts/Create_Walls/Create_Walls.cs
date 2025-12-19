using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Seyoum Hagos
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

// [ScriptParameter(Options: "RoomBoundaries, Grid, Coordinates, Perimeter")]
string creationMode = "RoomBoundaries";



// Common Parameters
// [Parameter]
string levelName = "Level 1";

// [Parameter]
string wallTypeName = "Generic - 200mm";

// [Parameter]
double wallHeightMeters = 3.0;

// [Parameter]
bool roomBounding = true;

// Room Boundaries Mode Parameters
// [ScriptParameter(VisibleWhen: "creationMode == 'RoomBoundaries'")]
double wallOffsetMm = 0.0; // Offset from room boundary (positive = outward)

// Grid Mode Parameters
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
double gridSpacingXMeters = 3.0;
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
double gridSpacingYMeters = 3.0;
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
int gridCountX = 5;
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
int gridCountY = 5;
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
double gridOriginXMeters = 0.0;
// [ScriptParameter(VisibleWhen: "creationMode == 'Grid'")]
double gridOriginYMeters = 0.0;

// Coordinates Mode Parameters
// [ScriptParameter(VisibleWhen: "creationMode == 'Coordinates'")]
string csvFilePath = ""; // Path to CSV file with wall coordinates

// Perimeter Mode Parameters
// [ScriptParameter(VisibleWhen: "creationMode == 'Perimeter'")]
bool useModelLines = false; // Use existing model lines as perimeter

// Get Level
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{
    Println($"❌ Level '{levelName}' not found.");
    return;
}

// Get Wall Type
WallType? wallType = new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault(wt => wt.Name == wallTypeName);

if (wallType == null)
{
    Println($"❌ Wall type '{wallTypeName}' not found.");
    return;
}

int wallsCreated = 0;

Transact($"Create Walls - {creationMode}", () =>
{
    switch (creationMode)
    {
        case "RoomBoundaries":
            wallsCreated = RoomBoundaryWalls.Create(
                Doc, level, wallType, wallHeightMeters, 
                roomBounding, wallOffsetMm);
            break;

        case "Grid":
            wallsCreated = GridWalls.Create(
                Doc, level, wallType, wallHeightMeters,
                gridSpacingXMeters, gridSpacingYMeters,
                gridCountX, gridCountY,
                gridOriginXMeters, gridOriginYMeters,
                roomBounding);
            break;

        case "Coordinates":
            if (string.IsNullOrEmpty(csvFilePath))
            {
                Println("❌ CSV file path is required for Coordinates mode.");
                return;
            }
            wallsCreated = CoordinateWalls.Create(
                Doc, level, wallType, wallHeightMeters, csvFilePath, roomBounding);
            break;

        case "Perimeter":
            wallsCreated = PerimeterWalls.Create(
                Doc, level, wallType, wallHeightMeters, useModelLines, roomBounding);
            break;

        default:
            Println($"❌ Unknown creation mode: {creationMode}");
            return;
    }
});

// Print result FIRST for agent summary
if (wallsCreated > 0)
{
    Println($"✅ Successfully created {wallsCreated} walls using {creationMode} mode.");
}
else
{
    Println($"⚠️ No walls were created. Check your parameters and try again.");
}

// Then print configuration details
Println($"🔧 Wall Creation Mode: {creationMode}");
Println($"📍 Level: {levelName}");
Println($"🧱 Wall Type: {wallTypeName}");
Println($"📏 Wall Height: {wallHeightMeters}m");
Println($"🏠 Room Bounding: {roomBounding}");
