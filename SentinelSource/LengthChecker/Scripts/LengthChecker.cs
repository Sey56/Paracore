using Autodesk.Revit.DB;
using System.Linq;
using System.Collections.Generic;

// Watchdog: Sentinel for OST_Walls
// Generated from Visual Query Builder
Watchdog(() => 
{
    Params p = new();
    
    // __PARACORE_QUERY_DATA__{"category": "OST_Walls", "rootGroup": {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Base Constraint", "storage_type": "ElementId", "operator": "==", "value": "0", "unit": null, "is_builtin": true, "builtin_id": -1001107, "builtin_name": "WALL_BASE_CONSTRAINT", "revit_element_type": "Level", "spec_type_id": ""}, {"type": "rule", "name": "Length", "storage_type": "Double", "operator": "<", "value": "2000", "unit": "mm", "is_builtin": true, "builtin_id": -1004005, "builtin_name": "CURVE_ELEM_LENGTH", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:length-2.0.1"}]}, "selectedColumns": [], "scope": "project"}

// 1. Filtering Logic (High-Performance Native Filter)
FilteredElementCollector collector = new(Doc);
collector.OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType();
List<ElementFilter> filters_2249724957568 = new();
if (p.BaseConstraint != null) filters_2249724957568.Add(new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint.Id)));
if (p.Length != 0) filters_2249724957568.Add(new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.CURVE_ELEM_LENGTH)), new FilterNumericLess(), p.Length, 1e-6)));
ElementFilter final_2249724957568 = filters_2249724957568.Count > 0 ? (filters_2249724957568.Count == 1 ? filters_2249724957568[0] : new LogicalAndFilter(filters_2249724957568)) : null;
if (final_2249724957568 != null) collector.WherePasses(final_2249724957568);
List<Wall> elements = [.. collector.Cast<Wall>()];

// 2. Output Results
Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
if (elements.Count > 0)
{
    var results = elements.Select(el =>
    {
        object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
        object LengthValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);

        return new
        {
            Id = el.Id.Value,
            el.Name,
            BaseConstraint = BaseConstraintValue,
            Length = LengthValue,
        };
    }).ToList();
    Table(results);
}
    
    // --- Background Watchdog Reporting ---
    // (This part handles the persistent dashboard reporting)
    if (elements.Count > 0)
    {
        WatchdogReport($"Found {elements.Count} elements matching 'LengthChecker'", "warning", elements.Select(el => el.Id).ToList());
    }
    else
    {
        WatchdogReport("No elements match 'LengthChecker'", "success");
    }
});


// Helper to resolve parameter ID for shared/project params
ElementId GetParamId(Document doc, string name)
{
    Element? first = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType().FirstElement();
    return first?.LookupParameter(name)?.Id ?? ElementId.InvalidElementId;
}


public class Params
{
/// Filter value for Base Constraint
public Level? BaseConstraint { get; set; } = null;
/// Filter value for Length
[Unit("mm")]
public double Length { get; set; } = 2000;
}
