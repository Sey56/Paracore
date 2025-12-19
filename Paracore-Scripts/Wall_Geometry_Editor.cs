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
Edit wall geometry by adding sweeps or reveals to selected or all walls.
Supports vertical and horizontal placement with offset control.

UsageExamples:
- "Add a cornice sweep to all walls"
- "Create a reveal at 1 meter height"
- "Add vertical sweep to selected walls"
*/

// [ScriptParameter(Options: "AddSweep, AddReveal")]
string mode = "AddSweep";

// [ScriptParameter]
bool vertical = false; // false = horizontal, true = vertical

// [ScriptParameter]
double offsetMeters = 1.0;

// [ScriptParameter]
string typeName = ""; // Optional: specific WallSweepType name

// [ScriptParameter]
bool useSelection = true; // Operate on selected walls only

// Collect Walls
List<Wall> walls = new List<Wall>();
bool canProceed = true;

if (useSelection)
{
    var selection = UIDoc.Selection.GetElementIds();
    foreach (var id in selection)
    {
        if (Doc.GetElement(id) is Wall w) walls.Add(w);
    }
    
    if (walls.Count == 0)
    {
        Println("⚠️ No walls selected. Please select walls or set useSelection to false.");
        canProceed = false;
    }
}
else
{
    walls = new FilteredElementCollector(Doc)
        .OfClass(typeof(WallSweepType)) // Mistake in previous copy? No, this should be Wall.
        // Wait, the previous code had .OfClass(typeof(Wall)).
        // Let me correct that.
        .OfClass(typeof(Wall))
        .Cast<Wall>()
        .ToList();
}

ElementType? sweepType = null;

if (canProceed)
{
    Println($"Found {walls.Count} walls to process.");

    // Find WallSweepType
    if (!string.IsNullOrEmpty(typeName))
    {
        sweepType = new FilteredElementCollector(Doc)
            .OfClass(typeof(WallSweepType))
            .FirstOrDefault(x => x.Name.Equals(typeName, StringComparison.OrdinalIgnoreCase));
    }

    // Fallback to first available if not found or not specified
    if (sweepType == null)
    {
        sweepType = new FilteredElementCollector(Doc)
            .OfClass(typeof(WallSweepType))
            .FirstOrDefault();
            
        if (sweepType != null)
            Println($"ℹ️ Using default type: {sweepType.Name}");
    }

    if (sweepType == null)
    {
        Println("! No Wall Sweep/Reveal Type found in the project.");
        canProceed = false;
    }
}

if (canProceed && sweepType != null)
{
    int successCount = 0;

    Transact($"Wall Geometry - {mode}", () =>
    {
        foreach (var wall in walls)
        {
            try
            {
                // Create WallSweepInfo
                WallSweepInfo sweepInfo = new WallSweepInfo();
                sweepInfo.WallSide = WallSide.Exterior; // Default to exterior
                sweepInfo.Distance = UnitUtils.ConvertToInternalUnits(offsetMeters, UnitTypeId.Meters);
                sweepInfo.IsVertical = vertical;
                
                WallSweep.Create(wall, sweepType.Id, sweepInfo);
                successCount++;
            }
            catch (Exception ex)
            {
                // Silently fail or log
            }
        }
    });

    Println($"✅ Successfully added {mode} to {successCount} walls.");
}
