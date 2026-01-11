using Autodesk.Revit.DB;

// CoreScript (C# + RevitAPI) top level scripting environment.

// Doc, UIDoc, UIApp, Transact, Println, etc... are available in any scope

// Filter all walls in the document
var allWalls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .ToList();

// collect their ids for selection
var wallIds = allWalls.Select(w => w.Id).ToList();

// Select all walls in the document

UIDoc.Selection.SetElementIds(wallIds);

// zoom to the selected walls
UIDoc.ShowElements(wallIds);

Println($"Selected and zoomed to {wallIds.Count} walls in the document.");
