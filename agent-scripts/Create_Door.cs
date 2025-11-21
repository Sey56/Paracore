
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
Creates a door on a selected wall in the Revit project. The script checks for a valid wall selection, 
retrieves the appropriate door family symbol, and places the door at the midpoint of the wall.

UsageExamples:
- "Create a door on a selected wall in the project."
*/


try
{
    var selectedElement = UIDoc.Selection.GetElementIds().FirstOrDefault();
    if (selectedElement == ElementId.InvalidElementId)
    {
        Println("Please select a wall to place the door on.");
    }

    Wall? wall = Doc.GetElement(selectedElement) as Wall;
    if (wall == null)
    {
        Println("The selected element is not a wall. Please select a valid wall.");
    }

    ElementId? levelId = wall.LevelId;
    var level = Doc.GetElement(levelId) as Level;

    if (level == null)
    {
        Println("Could not determine the level of the selected wall.");
    }

    var doorSymbol = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Doors)
        .OfClass(typeof(FamilySymbol))
        .Cast<FamilySymbol>()
        .FirstOrDefault();

    if (doorSymbol == null)
    {
        Println("No door family symbol found in the document.");
    }

    Transact("Create Door", () =>
    {
        if (doorSymbol != null)
        {
            if (!doorSymbol.IsActive)
            {
                doorSymbol.Activate();
                Doc.Regenerate();
            }

            var curve = ((wall.Location as LocationCurve)?.Curve) ?? throw new Exception("Could not get the curve from the wall location.");
            var midpoint = curve.Evaluate(0.5, true);

            Doc.Create.NewFamilyInstance(midpoint, doorSymbol, wall, level, StructuralType.NonStructural);
        }

    });

    Println("Door created successfully on the selected wall.");
}
catch (Exception ex)
{
    Println($"Error: {ex.Message}");
}
