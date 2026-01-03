using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Management, Documentation
Author: Paracore Team
Dependencies: CoreScript.Engine, RevitAPI

Description:
Bulk toggles Crop Region and Annotation Crop visibility across multiple views.
Saves massive amounts of time when Preparing Sheets for export or printing.

UsageExamples:
- "Hide all crop regions in the current view"
- "Show all annotation crops for views on this sheet"
*/

// 1. Initialize Parameters
var p = new Params();

// 2. Resolve Target Views
List<View> targetViews = new List<View>();

switch (p.scope)
{
    case "Active View":
        targetViews.Add(ActiveView);
        break;

    case "Selected Views":
        var ids = UIDoc.Selection.GetElementIds();
        foreach (var id in ids)
        {
            if (Doc.GetElement(id) is View v && !(v is ViewSheet))
                targetViews.Add(v);
        }
        break;

    case "All Views on Sheet":
        if (ActiveView is ViewSheet sheet)
        {
            var viewIds = sheet.GetAllPlacedViews();
            foreach (var id in viewIds)
            {
                if (Doc.GetElement(id) is View v)
                    targetViews.Add(v);
            }
        }
        else
        {
            Println("⚠️ Active view is not a Sheet. Cannot find 'Views on Sheet'.");
            return;
        }
        break;

    case "All Views in Project":
        targetViews = new FilteredElementCollector(Doc)
            .OfClass(typeof(View))
            .Cast<View>()
            .Where(v => !v.IsTemplate && !(v is ViewSheet))
            .ToList();
        break;
}

if (!targetViews.Any())
{
    Println($"ℹ️ No valid views found in scope: {p.scope}");
    return;
}

// 3. Execute Toggle
int updatedCount = 0;

Transact("Bulk Crop Toggle", () => 
{
    foreach (var v in targetViews)
    {
        // Not all views support cropping (e.g. Legends or some 3D views under certain conditions)
        if (!v.CanModifyView()) continue;

        bool targetState;
        if (p.action == "Show All") targetState = true;
        else if (p.action == "Hide All") targetState = false;
        else targetState = !v.CropRegionVisible; // Toggle mode

        // Apply Crop Region Visibility
        if (v.CropRegionVisible != targetState)
        {
            v.CropRegionVisible = targetState;
            updatedCount++;
        }

        // Apply Annotation Crop if requested
        if (p.includeAnnotationCrop)
        {
            // Note: v.HasAnnotationCrop must be true to set it
            try {
                v.get_Parameter(BuiltInParameter.VIEWER_ANNOTATION_CROP_ACTIVE).Set(targetState ? 1 : 0);
            } catch { /* Some views might not support this */ }
        }
    }
});

// 4. Report
if (updatedCount > 0)
    Println($"✔️ Successfully updated {updatedCount} views in scope: {p.scope}");
else
    Println("ℹ️ All views were already in the target state.");

// --- Parameter Definitions ---
class Params {
    [ScriptParameter(Options: "Active View, Selected Views, All Views on Sheet, All Views in Project", Description: "Which views should be processed?")]
    public string scope = "Active View";

    [ScriptParameter(Options: "Toggle, Show All, Hide All", Description: "The action to perform on the crop region.")]
    public string action = "Toggle";

    [ScriptParameter(Description: "Also show/hide the Annotation Crop boundary.")]
    public bool includeAnnotationCrop = true;
}
