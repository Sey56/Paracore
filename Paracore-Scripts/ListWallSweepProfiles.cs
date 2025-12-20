using Autodesk.Revit.DB;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
Lists all profile families that can be used for wall sweeps and reveals.
Helps identify which profiles are properly configured for wall sweep usage.

UsageExamples:
- "List all wall sweep profiles"
- "Show available profiles for wall sweeps"
*/

var profiles = new FilteredElementCollector(Doc)
    .OfClass(typeof(FamilySymbol))
    .OfCategory(BuiltInCategory.OST_ProfileFamilies)
    .Cast<FamilySymbol>()
    .ToList();

Println($"✅ Found {profiles.Count} profile families in the project:");
Println("");

foreach (var profile in profiles)
{
    Println($"Name: {profile.Name}");
    Println($"  Family: {profile.FamilyName}");
    Println($"  Id: {profile.Id}");
    
    // Try to get Profile Usage parameter
    var usageParam = profile.LookupParameter("Profile Usage");
    if (usageParam != null)
    {
        Println($"  Profile Usage: {usageParam.AsValueString()}");
    }
    
    Println("");
}
