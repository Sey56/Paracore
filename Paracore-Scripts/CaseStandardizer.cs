using System.Globalization;

/*
DocumentType: Project
Categories: Documentation, Annotation, Management
Author: Paracore Team
Repository: https://github.com/Sey56/Paracore-Scripts
Description: 
🚀 Bonus Tool: Standardizes naming cases for Rooms, Views, Sheets, and Text Notes.
⚠️ WARNING: This tool modifies many elements at once. Always test in a dummy project or create a backup before applying to a real production model.
*/

// 1. Setup & Safety Check
var p = new Params();

Println("🚀 Bonus Tool: Case Standardizer Launched.");
Println("⚠️ CAUTION: This script modifies naming across your project. Please test on a dummy file first.");

// 2. Collection Logic
List<Element> elements = [];
FilteredElementCollector? collector = null;

// A. Determine Scope
if (p.Scope == "Selection")
{
    var selIds = UIDoc.Selection.GetElementIds();
    if (selIds.Count > 0)
    {
        foreach (var id in selIds)
        {
            var e = Doc.GetElement(id);
            if (e != null) elements.Add(e);
        }
    }
}
else
{
    if (p.Scope == "Active View")
    {
        collector = new FilteredElementCollector(Doc, Doc.ActiveView.Id);
    }
    else // Entire Project
    {
        collector = new FilteredElementCollector(Doc);
    }
}

if (collector != null)
{
    collector.WhereElementIsNotElementType();
    elements.AddRange(collector.ToElements());
}

// B. Filter by Selected Categories
var targetCategories = p.SelectedCategories; 
var filteredElements = elements.Where(e => 
{
    if (e.Category == null) return false;
    return targetCategories.Contains(e.Category.Name);
}).ToList();

if (!filteredElements.Any())
{
    Println($"⚠️ No elements found matching the selected categories in '{p.Scope}'.");
    return;
}

// 3. Transformation Logic

// Helper: Transform text based on CaseType
string Transform(string input) 
{
    if (string.IsNullOrEmpty(input)) return input;
    switch (p.CaseType) 
    {
        case "UPPERCASE": return input.ToUpper();
        case "lowercase": return input.ToLower();
        case "Title Case": return CultureInfo.CurrentCulture.TextInfo.ToTitleCase(input.ToLower());
        default: return input;
    }
}

// Helper: Find the "main" text parameter for an element
Parameter GetTargetParameter(Element e) 
{
    // 1. Text Notes (Special Class)
    if (e is TextNote) return e.get_Parameter(BuiltInParameter.TEXT_TEXT);

    // 2. Rooms (Name)
    if (e is Autodesk.Revit.DB.Architecture.Room) return e.get_Parameter(BuiltInParameter.ROOM_NAME);

    // 3. Views (Name)
    if (e is View) return e.get_Parameter(BuiltInParameter.VIEW_NAME);

    // 4. Sheets (Name - Number is usually separate)
    if (e is ViewSheet) return e.get_Parameter(BuiltInParameter.SHEET_NAME);

    // 5. Levels (Name)
    if (e is Level) return e.get_Parameter(BuiltInParameter.DATUM_TEXT);

    // 6. Generic Fallback: Try to find a writable "Name" parameter
    return e.get_Parameter(BuiltInParameter.ALL_MODEL_TYPE_NAME) ?? e.LookupParameter("Name");
}

int changedCount = 0;
var changes = new List<object>();

Transact("Day 04 Bonus: Standardize Case", () => 
{
    foreach (var e in filteredElements)
    {
        var param = GetTargetParameter(e);
        if (param == null || param.IsReadOnly) continue;

        string originalValue = param.AsString();
        if (string.IsNullOrEmpty(originalValue)) continue;

        string newValue = Transform(originalValue);

        // Only update if actually different
        if (originalValue != newValue)
        {
            try 
            {
                param.Set(newValue);
                changedCount++;
                changes.Add(new { Id = e.Id.Value, Old = originalValue, New = newValue });
            }
            catch (Exception ex)
            {
                Println($"⚠️ Failed to update {e.Id}: {ex.Message}");
            }
        }
    }
});

// 4. Report
if (changedCount > 0)
{
    Println($"✅ Successfully standardized {changedCount} elements to {p.CaseType}.");
    Table(changes);
}
else
{
    Println($"✅ No changes needed. All {filteredElements.Count} elements are already in {p.CaseType}.");
}

// 5. Classes (Must be at bottom)
public class Params
{
    /// <summary>Where to look for elements.</summary>
    public string Scope { get; set; } = "Active View";
    
    public static List<string> Scope_Options => ["Active View", "Entire Project", "Selection"];

    /// <summary>Select categories to process.</summary>
    public List<string> SelectedCategories { get; set; } = ["Text Notes"];

    public List<string> SelectedCategories_Options()
    {
        var cats = new List<string> { "Text Notes", "Dimensions", "Rooms", "Views", "Sheets", "Levels", "Elevations", "Sections", "Generic Annotations" };
        return [.. cats.OrderBy(c => c)];
    }

    /// <summary>Choose the text case format.</summary>
    public string CaseType { get; set; } = "UPPERCASE";
    public static List<string> CaseType_Options => ["UPPERCASE", "lowercase", "Title Case"];
}