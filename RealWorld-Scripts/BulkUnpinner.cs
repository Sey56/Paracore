using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Management, General
Author: Paracore Team
Dependencies: CoreScript.Engine, RevitAPI

Description:
A utility to bulk-unpin elements based on your current selection or the active view. 
Essential for quick project cleanup and geometry editing.

UsageExamples:
- "Unpin all selected items"
- "Unpin everything in the current view"
*/

// 1. Initialize Parameters
var p = new Params();

// 2. Identify the target elements
IEnumerable<ElementId> targetIds;

if (p.Scope == "Selection")
{
    targetIds = UIDoc.Selection.GetElementIds();
    if (!targetIds.Any())
    {
        Println("⚠️ No elements selected. Please select elements or change scope to 'Current View'.");
        return;
    }
}
else
{
    // Capture all elements in the active view
    targetIds = new FilteredElementCollector(Doc, UIDoc.ActiveView.Id)
        .WhereElementIsNotElementType()
        .ToElementIds();
}

// 3. Perform the unpinning
int unpinnedCount = 0;
int skippedCount = 0;

// Define critical categories to protect in "Safe Mode"
var criticalCategories = new List<BuiltInCategory> {
    BuiltInCategory.OST_Grids,
    BuiltInCategory.OST_Levels,
    BuiltInCategory.OST_RvtLinks,
    BuiltInCategory.OST_VolumeOfInterest // Scope Boxes
};

Transact("Bulk Unpin (Hardened)", () => 
{
    foreach (var id in targetIds)
    {
        Element el = Doc.GetElement(id);
        if (el == null || !el.Pinned) continue;

        // --- SAFETY GUARDS ---
        
        // 1. Category Filter (if specified)
        if (p.CategoryFilter != "All Categories" && el.Category?.Name != p.CategoryFilter)
        {
            continue;
        }

        // 2. Critical Element Protection (Safe Mode)
        if (p.SafeMode)
        {
            bool isCritical = el.Category != null && criticalCategories.Contains((BuiltInCategory)el.Category.Id.Value);
            bool isGridOrLevel = el is Grid || el is Level; // Extra check for safety
            
            if (isCritical || isGridOrLevel)
            {
                skippedCount++;
                continue;
            }
        }

        el.Pinned = false;
        unpinnedCount++;
    }
});

// 4. Report back
if (unpinnedCount > 0)
{
    string msg = $"✔️ Successfully unpinned {unpinnedCount} elements.";
    if (skippedCount > 0) msg += $" (🛡️ Skipped {skippedCount} critical elements).";
    Println(msg);
}
else if (skippedCount > 0)
{
    Println($"🛡️ All {skippedCount} pinned elements found were protected (Grids/Levels/Links). Turn off 'Safe Mode' if you really need to unpin them.");
}
else
{
    Println("ℹ️ No pinned elements were found matching your criteria.");
}

// --- Parameter Definitions ---
public class Params 
{
    /// <summary>Determine which elements to search for pinned status.</summary>
    [ScriptParameter]
    public string Scope { get; set; } = "Selection";

    // Static Options for Scope
    public List<string> Scope_Options() => new List<string> { "Selection", "Current View" };

    /// <summary>If true, protects critical elements like Grids, Levels, and Linked Models from being unpinned.</summary>
    [ScriptParameter]
    public bool SafeMode { get; set; } = true;

    /// <summary>Optional: Only unpin elements of this specific category. Select 'All Categories' to unpin everything (respecting Safe Mode).</summary>
    [RevitElements]
    public string CategoryFilter { get; set; } = "All Categories";

    public List<string> CategoryFilter_Options() 
    {
        var categoryNames = new List<string> { "All Categories" };
        
        foreach (Category cat in Doc.Settings.Categories) 
        {
            if (cat.CategoryType == CategoryType.Model || cat.CategoryType == CategoryType.Annotation)
            {
                if (!categoryNames.Contains(cat.Name))
                    categoryNames.Add(cat.Name);
            }
        }
        categoryNames.Sort();
        return categoryNames;
    }
}
