using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Generative, Walls
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Creates spiral walls on a specified level with user-defined parameters for turns, radius, and wall properties.
The walls follow a mathematical spiral pattern, perfect for creating helical structures and decorative walls.

UsageExamples:
- "Create spiral walls on Level 1 with 5 turns"
- "Generate helical wall with 3 meter radius"
- "Make spiral partition wall 200mm thick"
*/

// V3 Parameters
var p = new Params();

public class Params
{
    [RevitElements(TargetType: "Level")]
    public string LevelName { get; set; } = "Level 1";

    /// <summary>Maximum radius in meters</summary>
    [Range(1.0, 100.0)]
    public double MaxRadiusMeters { get; set; } = 24.0;

    /// <summary>Number of spiral turns</summary>
    [Range(1, 20)]
    public int NumTurns { get; set; } = 5;

    /// <summary>Angle resolution in degrees (lower = smoother)</summary>
    [Range(5, 90, 5)]
    public double AngleResolutionDegrees { get; set; } = 30;

    /// <summary>Wall height</summary>
    public double WallHeightMeters { get; set; } = 3.0;
}

// Logic
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.LevelName);

if (level == null)
{
    Println($"❌ Level '{p.LevelName}' not found.");
    return;
}

Print($"Creating spiral walls on level '{p.LevelName}'...");

Transact("Create Spiral Walls", () =>
{
    var spiralCreator = new SpiralWallCreator();
    spiralCreator.CreateSpiralWalls(Doc, level, p.MaxRadiusMeters, p.NumTurns, 
                                  p.AngleResolutionDegrees, p.WallHeightMeters);
});

Println("✅ Spiral walls created successfully!");
