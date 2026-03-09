/*
DocumentType: Project
Categories: Automation, Parameters, Selection
Description: 
Synchronizes selected parameter values from one source element 
to multiple target elements of the same category.
*/

var p = new Params();

try {
    // 1. Validation
    if (p.Source == null) {
        Println("🚫 Please select a Source Element.");
        return;
    }

    if (p.ParameterNames == null || p.ParameterNames.Count == 0) {
        Println("🚫 Please select at least one Parameter to synchronize.");
        return;
    }

    if (p.Targets == null || p.Targets.Count == 0) {
        Println("🚫 Please select at least one Target Element.");
        return;
    }

    // 2. Synchronization
    Transact("Sync Parameters", () => {
        int totalSuccess = 0;
        int totalFail = 0;

        foreach (var paramName in p.ParameterNames) {
            var sourceParam = p.Source.LookupParameter(paramName);
            if (sourceParam == null) {
                Println($"❌ Parameter '{paramName}' not found on Source. Skipping.");
                continue;
            }

            int successCount = 0;
            int failCount = 0;

            foreach (var target in p.Targets) {
                var targetParam = target.LookupParameter(paramName);
                if (targetParam == null || targetParam.IsReadOnly) {
                    failCount++;
                    continue;
                }

                bool success = false;
                switch (sourceParam.StorageType) {
                    case StorageType.String:
                        success = targetParam.Set(sourceParam.AsString() ?? "");
                        break;
                    case StorageType.Double:
                        success = targetParam.Set(sourceParam.AsDouble());
                        break;
                    case StorageType.Integer:
                        success = targetParam.Set(sourceParam.AsInteger());
                        break;
                    case StorageType.ElementId:
                        success = targetParam.Set(sourceParam.AsElementId());
                        break;
                }

                if (success) successCount++;
                else failCount++;
            }

            if (successCount > 0) Println($"✅ Synchronized '{paramName}' to {successCount} elements.");
            if (failCount > 0) Println($"⚠️ Failed to sync '{paramName}' to {failCount} elements.");
            
            totalSuccess += successCount;
            totalFail += failCount;
        }

        Println($"\n🏁 Done! Total operations: {totalSuccess} success, {totalFail} failure.");
    });
}
catch (Exception ex) {
    Println($"💥 CRITICAL ERROR: {ex.Message}");
}

public class Params {
    #region Configuration
    /// <summary>The element to copy values FROM.</summary>
    [Select(SelectionType.Element), Mandatory]
    public Element? Source { get; set; }

    /// <summary>Selected parameters to synchronize.</summary>
    public List<string> ParameterNames { get; set; } = [];
    
    // Dynamic provider: Lists searchable parameters from the source element
    public List<string> ParameterNames_Options => 
        Source == null ? [] :
        [.. Source.Parameters
            .Cast<Autodesk.Revit.DB.Parameter>()
            .Where(p => !p.IsReadOnly)
            .Select(p => p.Definition.Name)
            .OrderBy(n => n)];
    #endregion

    #region Targets
    /// <summary>Elements to copy values TO.</summary>
    public List<Element> Targets { get; set; } = [];

    // Dynamic provider: Lists elements of the same category as Source
    public List<Element> Targets_Options => 
        Source == null || Source.Category == null ? [] :
        [.. new FilteredElementCollector(Doc)
            .OfCategoryId(Source.Category.Id)
            .WhereElementIsNotElementType()
            .Where(e => e.Id != Source.Id)
            .Cast<Element>()];
    #endregion
}
