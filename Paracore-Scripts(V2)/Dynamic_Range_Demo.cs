using Autodesk.Revit.DB;
using System;
using System.Linq;

/*
Description: 
Demonstrates the Paracore V3 "Dynamic Range" feature. 
Compare a Static range (using Attributes) with a Dynamic range (using the _Range convention).

Usage:
1. Select this script in the Library.
2. Note that 'DynamicDistance' has a [Compute] button.
3. Clicking [Compute] will update the Max range based on the number of Levels in your project.
*/

var p = new Params();

Println("--- Dynamic Range Demo ---");
Println($"Static Value: {p.StaticValue}");
Println($"Dynamic Value: {p.DynamicDistance}");
Println("--------------------------");

public class Params
{
    // 1. STATIC RANGE (The "Standard" Way)
    // This uses the [Range] attribute. These bounds are fixed and parsed immediately
    // without needing to talk to Revit.
    /// <summary>Fixed range: 0 to 100</summary>
    [Range(0, 100, 5)]
    public double StaticValue { get; set; } = 50.0;

    // 2. DYNAMIC RANGE (The "Pro" Way)
    // This value is constrained by a property named 'DynamicDistance_Range'.
    // The existence of this property tells Paracore that this parameter is "Computable".
    /// <summary>Bounds change based on Project Levels</summary>
    [ScriptParameter]
    public double DynamicDistance { get; set; } = 10.0;

    // CONVENTION: {ParameterName}_Range
    // This returns (Min, Max, Step).
    // Because it contains logic (queries Doc), the UI will show a [Compute] button.
    public (double, double, double) DynamicDistance_Range => 
        (0.0, GetDynamicMax(), 0.5);

    // Helper logic to determine the max elevation/bound
    private double GetDynamicMax()
    {
        var levels = new FilteredElementCollector(Doc).OfClass(typeof(Level)).Cast<Level>().ToList();
        
        if (levels.Count == 0) return 50.0; // Fallback
        
        // Let's make the max range equal to the highest level elevation + 10
        double maxElevation = levels.Max(l => l.Elevation);
        double rawMax = Math.Max(10.0, maxElevation + 10.0);
        
        // Round to nearest 0.5 to ensure the slider can actually reach the max value
        return Math.Round(rawMax * 2) / 2;
    }
}
