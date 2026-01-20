using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Architectural, Cleanup
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Deletes all wall elements in the active document. Useful for prototyping resets,
batch cleanup, or preparing a fresh layout canvas. Requires confirmation.

UsageExamples:
- "Delete all walls in the current project"
- "Clear all walls for a new layout"
- "Reset project walls"
*/

// Initialize Parameters
var p = new Params();

// Filter Walls
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

if (!p.ConfirmDeletion)
{
    Println("⚠️ Deletion skipped due to 'ConfirmDeletion = false'.");
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

// V3 Simplified Parameters
public class Params
{
    /// <summary>If true, proceeds with deletion.</summary>
    public bool ConfirmDeletion { get; set; } = true;
}
