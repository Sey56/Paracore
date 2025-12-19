using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
Lists all wall types (WallType) available in the current Revit project document.

UsageExamples:
- "list available wall types":
- "List all wall types in the current project":'":
- "list wall types":
    
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