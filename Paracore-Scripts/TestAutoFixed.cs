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

Println($"Selected Wall Instance: {p.WallInstance}");



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