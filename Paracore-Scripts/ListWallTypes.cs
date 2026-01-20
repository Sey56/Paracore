using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Lists all wall types available in the current project document. 
Prints ID and Name for each type.

UsageExamples:
- "list available wall types"
- "identify all wall types in the project"
*/


List<WallType> wallTypes = [.. new FilteredElementCollector(Doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()];

// Print result FIRST for agent summary
Println($"✅ Found {wallTypes.Count} wall type(s) in the project.");

foreach (WallType wallType in wallTypes)
{
    Println($"{wallType.Id} {wallType.Name}");
}
