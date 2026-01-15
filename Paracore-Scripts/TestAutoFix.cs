// File: TestAutoFix.cs
using Autodesk.Revit.DB;
using System.Collections.Generic; // Added for List
using System.Linq; // Added for .Select()

/*
** SINGLE-FILE SCRIPT **
This is a standalone script. All code, helpers, and the Params class must be in THIS file.

DocumentType: Project
Categories: Multi-Category
Author: Paracore User
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Single-file template script.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Show.

UsageExamples:
- "Run script"
*/

// Initializing 'p' outside of any method is fine for CoreScript.
var p = new Params();

// This is an empty statement, harmless but can be removed if not needed.
;

// Example of how to use a Transact block for making changes
Transact.Run("My Script Action", () =>
{
    // Your main script logic goes here
    Println($"Selected Wall Instance: {p.WallInstance}");

    // Example: Find the wall by name from the filtered list
    var selectedWall = new FilteredElementCollector(Doc)
                            .OfClass(typeof(Wall))
                            .Cast<Wall>()
                            .FirstOrDefault(w => w.Name == p.WallInstance);

    if (selectedWall != null)
    {
        Println($"Found Wall: {selectedWall.Name} (ID: {selectedWall.Id.Value})");
    }
    else
    {
        Println($"No wall found matching '{p.WallInstance}'");
    }

    // You can also print the list of available wall names for debugging:
    Println("Available Wall Names:");
    foreach (var wallName in p.WallInstance_Filter)
    {
        Println($"- {wallName}");
    }

});


class Params
{
    public string WallInstance { get; set; } = "some wall";

    // FIX: Changed .ToElements() to .ToList() because we are collecting strings (wall names), not Revit elements.
    public List<string> WallInstance_Filter =>
        new FilteredElementCollector(Doc)
            .OfClass(typeof(Wall))
            .Cast<Wall>()
            .Select(wall => wall.Name) // Get the name (string) of each wall
            .ToElements(); // Correctly converts the IEnumerable<string> to List<string>
}