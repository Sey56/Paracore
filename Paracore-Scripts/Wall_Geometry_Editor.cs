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
Edit wall geometry by adding sweeps or reveals to selected or all walls.
Supports vertical and horizontal placement with offset control.

UsageExamples:
- "Add a cornice sweep to all walls"
- "Create a reveal at 1 meter height"
- "Add vertical sweep to selected walls"
*/

var p = new Params();

// Collect Walls
List<Wall> walls = new List<Wall>();

if (p.UseSelection)
{
    var selection = UIDoc.Selection.GetElementIds();
    foreach (var id in selection)
    {
        if (Doc.GetElement(id) is Wall w) walls.Add(w);
    }
    
    if (walls.Count == 0)
    {
        Println("🚫 No walls selected. Please select walls or set UseSelection to false.");
        return;
    }
}
else
{
    walls = new FilteredElementCollector(Doc)
        .OfClass(typeof(Wall))
        .Cast<Wall>()
        .ToList();
}

Println($"Found {walls.Count} walls to process.");

// Find Sweep/Reveal Type by name
ElementType? sweepType = null;
BuiltInCategory targetCategory = p.Mode == "AddSweep" ? BuiltInCategory.OST_Cornices : BuiltInCategory.OST_Reveals;

if (!string.IsNullOrEmpty(p.SweepTypeName))
{
    sweepType = new FilteredElementCollector(Doc)
        .WhereElementIsElementType()
        .OfCategory(targetCategory)
        .Cast<ElementType>()
        .FirstOrDefault(x => x.Name.Equals(p.SweepTypeName, StringComparison.OrdinalIgnoreCase));
}

// Fallback to first available if not found or not specified
if (sweepType == null)
{
    sweepType = new FilteredElementCollector(Doc)
        .WhereElementIsElementType()
        .OfCategory(targetCategory)
        .Cast<ElementType>()
        .FirstOrDefault();
        
    if (sweepType != null)
        Println($"ℹ️ Using default type: {sweepType.Name}");
}

if (sweepType == null)
{
    Println($"🚫 No {p.Mode} types found in the project.");
    return;
}

// Find Profile (optional)
FamilySymbol? profile = null;
if (!string.IsNullOrEmpty(p.ProfileName))
{
    profile = new FilteredElementCollector(Doc)
        .OfClass(typeof(FamilySymbol))
        .OfCategory(BuiltInCategory.OST_ProfileFamilies)
        .Cast<FamilySymbol>()
        .FirstOrDefault(x => x.Name.Equals(p.ProfileName, StringComparison.OrdinalIgnoreCase));
        
    if (profile != null && !profile.IsActive)
        profile.Activate();
}

int successCount = 0;

Transact($"Wall Geometry - {p.Mode}", () =>
{
    foreach (var wall in walls)
    {
        try
        {
            // Create WallSweepInfo
            WallSweepType sweepTypeEnum = p.Mode == "AddSweep" ? WallSweepType.Sweep : WallSweepType.Reveal;
            WallSweepInfo sweepInfo = new WallSweepInfo(sweepTypeEnum, p.Vertical);
            sweepInfo.WallSide = p.WallSide == "Exterior" ? WallSide.Exterior : WallSide.Interior;
            
            // For horizontal sweeps, Distance is measured from top or bottom
            // For vertical sweeps, Distance is a parameter along the wall's path (0.0 to 1.0)
            if (p.Vertical)
            {
                // Vertical: use normalized value (0.0 to 1.0)
                sweepInfo.Distance = p.Offset;
            }
            else
            {
                // Horizontal: convert offset ratio to actual distance from base
                // Get wall height and calculate distance from bottom
                double wallHeight = wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM).AsDouble();
                sweepInfo.Distance = wallHeight * p.Offset;
                sweepInfo.DistanceMeasuredFrom = DistanceMeasuredFrom.Base;
            }
            
            // Note: Profile assignment is not directly supported via WallSweepInfo in this API version
            // Profiles must be configured in the WallSweepType definition itself
            
            WallSweep.Create(wall, sweepType.Id, sweepInfo);
            successCount++;
        }
        catch (Exception ex)
        {
            Println($"⚠️ Failed to add {p.Mode} to wall {wall.Id}: {ex.Message}");
        }
    }
});

Println($"✅ Successfully added {p.Mode} to {successCount}/{walls.Count} walls.");

// ============================================
// CLASS DEFINITIONS (Must be at the bottom)
// ============================================

class Params
{
    /// <summary>Operation type</summary>
    public string Mode { get; set; } = "AddSweep";
    public static string[] Mode_Options => new[] { "AddSweep", "AddReveal" };

    /// <summary>Wall side placement</summary>
    public string WallSide { get; set; } = "Exterior";
    public static string[] WallSide_Options => new[] { "Exterior", "Interior" };

    /// <summary>Vertical or horizontal placement</summary>
    public bool Vertical { get; set; } = false; // false = horizontal, true = vertical

    /// <summary>Position along wall height (0=bottom, 0.5=center, 1=top)</summary>
    [Range(0.0, 1.0, 0.05)]
    public double Offset { get; set; } = 0.5;

    [RevitElements(Description: "Wall Sweep or Reveal type")]
    public string SweepTypeName { get; set; } = "";

    public List<string> SweepTypeName_Options()
    {
        var options = new List<string>();

        // Get Sweep Types (Cornices)
        var sweepTypes = new FilteredElementCollector(Doc)
            .WhereElementIsElementType()
            .OfCategory(BuiltInCategory.OST_Cornices)
            .Cast<ElementType>()
            .Select(t => t.Name)
            .ToList();

        // Get Reveal Types
        var revealTypes = new FilteredElementCollector(Doc)
            .WhereElementIsElementType()
            .OfCategory(BuiltInCategory.OST_Reveals)
            .Cast<ElementType>()
            .Select(t => t.Name)
            .ToList();

        options.AddRange(sweepTypes);
        options.AddRange(revealTypes);

        return options.OrderBy(n => n).ToList();
    }

    [RevitElements(Description: "Profile family for the sweep/reveal")]
    public string ProfileName { get; set; } = "";

    public List<string> ProfileName_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(FamilySymbol))
            .OfCategory(BuiltInCategory.OST_ProfileFamilies)
            .Cast<FamilySymbol>()
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
    }

    /// <summary>Operate on selected walls only</summary>
    public bool UseSelection { get; set; } = true;
}
