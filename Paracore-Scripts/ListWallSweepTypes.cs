using Autodesk.Revit.DB;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Structural
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, RServer.Addin

Description:
Lists all Wall Sweep Types available in the project.
These are the actual types that can be used with WallSweep.Create().

UsageExamples:
- "List all wall sweep types"
- "Show available wall sweep types"
*/

// Get all Wall Sweep Types (Cornices category)
var sweepTypes = new FilteredElementCollector(Doc)
    .WhereElementIsElementType()
    .OfCategory(BuiltInCategory.OST_Cornices)
    .Cast<ElementType>()
    .ToList();

Println($"✅ Found {sweepTypes.Count} Wall Sweep Types (OST_Cornices):");
Println("");

foreach (var sweepType in sweepTypes)
{
    Println($"Name: {sweepType.Name}");
    Println($"  Id: {sweepType.Id}");
    Println($"  Category: {sweepType.Category?.Name ?? "N/A"}");
    Println("");
}

// Get all Wall Reveal Types
var revealTypes = new FilteredElementCollector(Doc)
    .WhereElementIsElementType()
    .OfCategory(BuiltInCategory.OST_Reveals)
    .Cast<ElementType>()
    .ToList();

Println($"✅ Found {revealTypes.Count} Wall Reveal Types (OST_Reveals):");
Println("");

foreach (var revealType in revealTypes)
{
    Println($"Name: {revealType.Name}");
    Println($"  Id: {revealType.Id}");
    Println($"  Category: {revealType.Category?.Name ?? "N/A"}");
    Println("");
}

if (sweepTypes.Count == 0 && revealTypes.Count == 0)
{
    Println("! No Wall Sweep or Reveal Types found.");
    Println("! You may need to create Wall Sweep/Reveal Types in the project first.");
}
