using System.Globalization;
using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Management, Documentation
Author: Paracore Team
Dependencies: CoreScript.Engine, RevitAPI

Description:
Updates the casing of Sheet Names or View Names in bulk. 
Essential for maintaining strict project documentation standards.

UsageExamples:
- "Convert all selected sheet names to UPPERCASE"
- "Standardize all View Names to Title Case"
*/

// 1. Initialize Parameters
var p = new Params();

// 2. Identify Target Elements
var targetIds = new List<ElementId>();

// Resolve Categories from Names
var targetCatIds = new List<ElementId>();
foreach (var catName in p.targetCategoryNames)
{
    Category cat = Doc.Settings.Categories.get_Item(catName);
    if (cat != null) targetCatIds.Add(cat.Id);
}

if (p.scope == "Selection")
{
    var selectionIds = UIDoc.Selection.GetElementIds();
    foreach (var id in selectionIds)
    {
        Element el = Doc.GetElement(id);
        if (el == null || el.Category == null) continue;
        
        // Handle "Special" cases for internal categories 
        bool isTarget = targetCatIds.Any(catId => el.Category.Id.Value == catId.Value);
        
        // Logic for "Sheets" and "Views" if they aren't caught by standard category IDs
        if (!isTarget && p.targetCategoryNames.Contains("Sheets") && el is ViewSheet) isTarget = true;
        if (!isTarget && p.targetCategoryNames.Contains("Views") && el is View && !(el is ViewSheet)) isTarget = true;

        if (isTarget) targetIds.Add(id);
    }
}
else
{
    var collector = new FilteredElementCollector(Doc);
    
    // Build a filter for all target categories
    if (targetCatIds.Any())
    {
        var categoryFilter = new ElementMulticategoryFilter(targetCatIds);
        collector.WherePasses(categoryFilter);
    }
    
    // Explicitly add Sheets/Views if selected (they have special classes)
    var allElements = collector.WhereElementIsNotElementType().ToList();
    
    foreach (var el in allElements)
    {
        targetIds.Add(el.Id);
    }

    // Add Sheets/Views manually if using the special "Sheets" / "Views" names
    if (p.targetCategoryNames.Contains("Sheets"))
    {
        var sheetIds = new FilteredElementCollector(Doc).OfClass(typeof(ViewSheet)).ToElementIds();
        targetIds.AddRange(sheetIds);
    }
    if (p.targetCategoryNames.Contains("Views"))
    {
        var viewIds = new FilteredElementCollector(Doc).OfClass(typeof(View)).Where(v => !(v is ViewSheet)).Select(v => v.Id);
        targetIds.AddRange(viewIds);
    }
}

targetIds = targetIds.Distinct().ToList();

if (!targetIds.Any())
{
    string targetList = string.Join(", ", p.targetCategoryNames);
    Println($"⚠️ No elements found for categories: [{targetList}] in scope '{p.scope}'.");
    return;
}

// 3. Define Casing Logic
string TransformName(string original)
{
    switch (p.caseMode)
    {
        case "UPPERCASE": return original.ToUpper();
        case "lowercase": return original.ToLower();
        case "Title Case": 
            TextInfo textInfo = new CultureInfo("en-US", false).TextInfo;
            // Lowering first ensures it doesn't stay ALL CAPS if it already was
            return textInfo.ToTitleCase(original.ToLower());
        default: return original;
    }
}

// 4. Execute Renaming
int updatedCount = 0;
int skippedCount = 0;

Transact($"Standardize Multi-Category Case", () => 
{
    foreach (var id in targetIds)
    {
        Element el = Doc.GetElement(id);
        if (el == null) continue;

        string oldName = el.Name;
        
        // Skip elements that don't have a valid name or are protected
        if (string.IsNullOrEmpty(oldName)) continue;

        string newName = TransformName(oldName);

        if (oldName == newName) continue;

        try 
        {
            // Note: For some elements (like Rooms/Sheets), el.Name is the setable property.
            el.Name = newName;
            updatedCount++;
        }
        catch (Exception ex)
        {
            skippedCount++;
            // We only print errors for significant failures (like name already exists)
            if (p.enableDetailedLogging)
                Println($"❌ Skipped '{oldName}': {ex.Message}");
        }
    }
});

// 5. Final Report
if (updatedCount > 0)
    Println($"✔️ Successfully updated casing for {updatedCount} elements across {p.targetCategoryNames.Count} categories.");
else
    Println($"ℹ️ No elements in the selected categories required updates.");

if (skippedCount > 0)
    Println($"⚠️ {skippedCount} items were skipped (Name conflicts or read-only). Enable 'Detailed Logging' for details.");

// --- Parameter Definitions ---
class Params {
    [RevitElements(MultiSelect: true, Description: "Select multiple categories to rename. Click 'Compute' to refresh the list.")]
    public List<string> targetCategoryNames = new() { "Sheets" };

    // Dynamic Options method for targetCategoryNames
    public List<string> targetCategoryNames_Options() 
    {
        // 1. Define high-priority documentation categories
        var priorityNames = new List<string> { 
            "Sheets", 
            "Views", 
            "Rooms", 
            "Levels", 
            "Areas", 
            "Spaces" 
        };
        
        var allOptions = new List<string>();
        
        // 2. Add Annotation categories that commonly need standardization
        foreach (Category cat in Doc.Settings.Categories) 
        {
            // We specifically want Annotations and specified documentation categories
            // Most Model categories (Walls/Floors) don't support direct instance renaming
            if (cat.CategoryType == CategoryType.Annotation || priorityNames.Contains(cat.Name))
            {
                if (!allOptions.Contains(cat.Name))
                    allOptions.Add(cat.Name);
            }
        }

        // 3. Sort and ensure priority items are prominent (or just alphabetical for cleanliness)
        allOptions.Sort();
        
        return allOptions;
    }

    [ScriptParameter(Options: "UPPERCASE, lowercase, Title Case", Description: "The target text casing style.")]
    public string caseMode = "UPPERCASE";

    [ScriptParameter(Options: "Selection, All in Project", Description: "Scope of the operation.")]
    public string scope = "Selection";

    [ScriptParameter(Group: "Advanced", Description: "Print errors for every skipped element.")]
    public bool enableDetailedLogging = false;
}
