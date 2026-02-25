/*
DocumentType: Project
Categories: Template
Author: Paracore Team
Dependencies: RevitAPI 2025+, Paracore.Addin

Description:
A template sentinel script structure
*/
Watchdog(() =>
{
    Params p = new();

    // Sentinel Logic here
    IList<Element> elements = new FilteredElementCollector(Doc)
        .OfCategory(p.SelectedCategory)
        .WhereElementIsNotElementType()
        .ToElements();

    WatchdogReport($"Found {elements.Count} elements", "success");
    
    Println($"Found {elements.Count} elements");
});

public class Params
{
    #region Generated Parameters

    [Segmented]
    public BuiltInCategory SelectedCategory { get; set; } = BuiltInCategory.OST_Walls; // default selection
    public List<BuiltInCategory> SelectedCategory_Options => 
     [
        BuiltInCategory.OST_Walls,
        BuiltInCategory.OST_Windows,
        BuiltInCategory.OST_Doors,
        BuiltInCategory.OST_Rooms,
    ];

    #endregion
}
