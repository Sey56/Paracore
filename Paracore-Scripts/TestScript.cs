using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Testing, Debugging
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Simple test script used for validating parameter parsing and error reporting.
Deliberately includes a division-by-zero error for testing the unified stack trace viewer.

UsageExamples:
- "Run error reporting test"
- "Test wall and door type parameters"
*/

Params p = new();
int a = 5;
int b = 0;
int c = a/b;
Println($"Result: {c}");
Println($"Wall Type Name: {p.WallTypeName}");

class Params
{
    /// <summary>
    /// The name of the wall type to use.
    /// </summary>
    [RevitElements(TargetType = "WallType"), Required]
    public string? WallTypeName { get; set; } = "Generic - 200mm";

    /// <summary>
    /// The name of the door type to use.
    /// </summary>
    [RevitElements(TargetType = "FamilySymbol", Category = "Doors"), Required]
    public string? DoorTypeName { get; set; } = "Door - 200mm";


    [RevitElements(TargetType = "View", Group = "Selection")]
    public List<string> SelectedViews { get; set; }

    

    [RevitElements(TargetType = "Material", Group = "Design")]
    public string ConcreteMaterial { get; set; } = "Concrete - Cast-in-Place";

    public List<string> ConcreteMaterial_Filter()
    {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Material))
            .Cast<Material>()
            .Where(m => m.Name.Contains("Concrete"))
            .Select(m => m.Name)
            .ToList();
    }

    /// <summary>
    /// The height of the wall in meters.
    /// </summary>
    [ScriptParameter(Suffix = "m")]
    [Range(1.0, 20.0, 0.1)]
    public double WallHeight { get; set; } = 3.0;


    [RevitElements(TargetType = "Room")] // Engine uses reflection to find "Pipe" class
    public string RoomName { get; set; }
}