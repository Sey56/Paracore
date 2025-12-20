using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Generative, Walls
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
Creates spiral walls on a specified level with user-defined parameters for turns, radius, and wall properties.
The walls follow a mathematical spiral pattern, perfect for creating helical structures and decorative walls.

UsageExamples:
- "Create spiral walls on Level 1 with 5 turns"
- "Generate helical wall with 3 meter radius"
- "Make spiral partition wall 200mm thick"
*/

// [Parameter]
string levelName = "Level 1";
// [Parameter]
double maxRadiusMeters = 24.0; // Maximum radius in meters
// [Parameter]
int numTurns = 5; // Number of spiral turns
// [Parameter]
double angleResolutionDegrees = 30; // Angle resolution in degrees (lower = smoother)
// [Parameter]
double wallHeightMeters = 3.0; // Wall height

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{
    Println($"❌ Level '{levelName}' not found.");
    return;
}

Print($"Creating spiral walls on level '{levelName}'...");

Transact("Create Spiral Walls", () =>
{
    var spiralCreator = new SpiralWallCreator();
    spiralCreator.CreateSpiralWalls(Doc, level, maxRadiusMeters, numTurns, 
                                  angleResolutionDegrees, wallHeightMeters);
});

Println("✅ Spiral walls created successfully!");