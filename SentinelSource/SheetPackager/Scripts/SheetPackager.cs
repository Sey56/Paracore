/*
DocumentType: Project
Categories: Automation, Sheets, Views
Description: 
Batch creates Floor Plans, RCPs, and Sheets for selected Levels.
Automatically places views on sheets using standard Viewports.
*/

var p = new Params();

// 1. Validation
if (p.TargetLevels == null || p.TargetLevels.Count == 0) {
    Println("🚫 Please select at least one Level to process.");
    return;
}

// 2. Main Logic
Transact("Sheet & View Packager", () => {
    // A. Discover necessary Types
    var floorPlanType = new FilteredElementCollector(Doc)
        .OfClass(typeof(ViewFamilyType))
        .Cast<ViewFamilyType>()
        .FirstOrDefault(t => t.ViewFamily == ViewFamily.FloorPlan);

    var rcpType = new FilteredElementCollector(Doc)
        .OfClass(typeof(ViewFamilyType))
        .Cast<ViewFamilyType>()
        .FirstOrDefault(t => t.ViewFamily == ViewFamily.CeilingPlan);

    var titleBlockType = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_TitleBlocks)
        .WhereElementIsElementType()
        .FirstOrDefault();

    if (floorPlanType == null || rcpType == null) {
        Println("❌ Could not find required ViewFamilyTypes (Floor Plan/RCP) in this project.");
        return;
    }

    if (p.CreateSheets && titleBlockType == null) {
        Println("⚠️ No Titleblock types found. Sheets will be created without titleblocks.");
    }

    int sheetsCreated = 0;
    int viewsCreated = 0;

    foreach (var level in p.TargetLevels) {
        Println($"📦 Processing: {level.Name}");

        try {
            // I. Create Views
            View? floorPlan = null;
            if (p.CreateFloorPlans) {
                floorPlan = ViewPlan.Create(Doc, floorPlanType.Id, level.Id);
                floorPlan.Name = $"{p.SheetNamePrefix}_Floor_{level.Name}";
                viewsCreated++;
            }

            View? rcp = null;
            if (p.CreateRCPs) {
                rcp = ViewPlan.Create(Doc, rcpType.Id, level.Id);
                rcp.Name = $"{p.SheetNamePrefix}_RCP_{level.Name}";
                viewsCreated++;
            }

            // II. Create Sheet & Assemble
            if (p.CreateSheets) {
                // If titleBlockType is null, we create it with invalid element id for a "blank" sheet
                var tbId = titleBlockType?.Id ?? ElementId.InvalidElementId;
                var sheet = ViewSheet.Create(Doc, tbId);
                
                sheet.Name = $"{p.SheetNamePrefix}_{level.Name}";
                // Basic numbering logic: A100 series
                sheet.SheetNumber = $"A1{sheetsCreated:D2}"; 

                // III. Place Viewports (Roughly centered on a 30x42 sheet)
                if (floorPlan != null && Viewport.CanAddViewToSheet(Doc, sheet.Id, floorPlan.Id)) {
                    Viewport.Create(Doc, sheet.Id, floorPlan.Id, new XYZ(1.5, 1.2, 0));
                }

                if (rcp != null && Viewport.CanAddViewToSheet(Doc, sheet.Id, rcp.Id)) {
                    Viewport.Create(Doc, sheet.Id, rcp.Id, new XYZ(0.5, 1.2, 0));
                }

                sheetsCreated++;
            }
        }
        catch (Exception ex) {
            Println($"  ⚠️ Failed to process {level.Name}: {ex.Message}");
        }
    }

    Println($"\n🏁 Batch Operation Complete!");
    Println($"   Views Created: {viewsCreated}");
    Println($"   Sheets Created: {sheetsCreated}");
});

public class Params {
    #region Settings
    [Mandatory, Description("Levels to generate packages for.")]
    public List<Level> TargetLevels { get; set; } = [];

    // Provider: Sorted list of all levels in the project
    public List<Level> TargetLevels_Options => 
        [.. new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .OrderBy(l => l.Elevation)];

    [Description("Prefix for all generated views and sheets.")]
    public string SheetNamePrefix { get; set; } = "PACK";

    public bool CreateFloorPlans { get; set; } = true;
    public bool CreateRCPs { get; set; } = true;
    public bool CreateSheets { get; set; } = true;
    #endregion
}
