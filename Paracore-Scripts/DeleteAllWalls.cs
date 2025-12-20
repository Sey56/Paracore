using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Cleanup
Author: Paracore Team
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin

Description:
Deletes all wall elements in the active document. Useful for prototyping resets,
batch cleanup, or preparing a fresh layout canvas.

UsageExamples:
- "Delete all walls in the current project":
  
*/


// [Parameter]
bool confirmDeletion = true;

// Other Top-Level Statements
FilteredElementCollector wallCollector = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .WhereElementIsNotElementType();

ICollection<ElementId> wallIds = [.. wallCollector.Select(w => w.Id)];

int wallCount = wallIds.Count;

if (wallCount == 0)
{
    Println("ℹ️ No walls found to delete.");
    return;
}

if (!confirmDeletion)
{
    Println("⚠️ Deletion skipped due to 'confirmDeletion = false'.");
    Println($"Found {wallCount} wall(s) that could be deleted.");
    return;
}

// Write operations inside a transaction
Transact("Delete All Walls", () =>
{
    Doc.Delete(wallIds);
});

// Print result FIRST for agent summary
Println($"✅ Deleted {wallCount} wall(s).");
Println($"SUMMARY: Deleted {wallCount} wall(s).");

