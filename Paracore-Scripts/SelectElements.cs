using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Selection, Filtering
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Selects elements in the Revit UI from multiple categories based on user selection.

UsageExamples:
- "Select walls and doors":
- "Highlight windows and furniture":
- "Select elements from multiple categories":
*/


var p = new Params();

// --- Main Logic ---

if (p.categories == null || p.categories.Count == 0)
{
    Println("⚠️ No categories were selected. Nothing to do.");
    return;
}

Println($"▶️ Processing selection for: {string.Join(", ", p.categories)}");

var builtInCategories = new List<BuiltInCategory>();

foreach (var categoryName in p.categories)
{
    try
    {
        // Revit's BuiltInCategory enum often uses the prefix "OST_".
        // We try parsing with and without it for flexibility.
        if (Enum.TryParse<BuiltInCategory>("OST_" + categoryName.Replace(" ", ""), true, out var parsedCategory))
        {
            builtInCategories.Add(parsedCategory);
        }
        else if (Enum.TryParse<BuiltInCategory>(categoryName.Replace(" ", ""), true, out parsedCategory))
        {
            builtInCategories.Add(parsedCategory);
        }
        else
        {
            Println($"⚠️ Category '{categoryName}' is not a valid BuiltInCategory. Skipping.");
        }
    }
    catch (Exception ex)
    {
        Println($"🚫 Error parsing category '{categoryName}': {ex.Message}");
    }
}

if (builtInCategories.Count == 0)
{
    Println("🚫 No valid categories could be processed from the selection.");
    return;
}

// Use an ElementMulticategoryFilter for efficient filtering
var multicategoryFilter = new ElementMulticategoryFilter(builtInCategories);
var collector = new FilteredElementCollector(Doc);
var elementsToSelect = collector
    .WherePasses(multicategoryFilter)
    .WhereElementIsNotElementType() // Exclude types, only get instances
    .ToElementIds();

if (elementsToSelect.Count == 0)
{
    Println("ℹ️ No element instances found for the selected categories in the document.");
    return;
}

// Set the selection in the Revit UI
UIDoc.Selection.SetElementIds(elementsToSelect);

// Report result
Println($"✅ Selected {elementsToSelect.Count} elements from {builtInCategories.Count} categories.");

class Params
{
    [ScriptParameter(MultiSelect: true, Options: "Walls, Floors, Roofs, Doors, Windows, Stairs, Railings, Columns, Structural Columns, Structural Framing, Foundations, Furniture, Casework, Generic Models, Curtain Panels, Curtain Wall Mullions, Areas, Rooms, Mass, Topography, Site, Parking, Planting")]
    public List<string> categories { get; set; } = ["Walls", "Doors"];
}
