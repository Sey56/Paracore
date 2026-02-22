// 1. Query & Setup
Params p = new();

// Visual Query Injection
// __PARACORE_QUERY_DATA__{"category": "OST_Walls", "rootGroup": {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Base Constraint", "storage_type": "ElementId", "operator": "==", "value": "0", "unit": null, "is_builtin": true, "builtin_id": -1001107, "builtin_name": "WALL_BASE_CONSTRAINT", "revit_element_type": "Level", "spec_type_id": ""}, {"type": "rule", "name": "Length", "storage_type": "Double", "operator": "<", "value": "2000", "unit": "mm", "is_builtin": true, "builtin_id": -1004005, "builtin_name": "CURVE_ELEM_LENGTH", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:length-2.0.1"}]}, "selectedColumns": [], "scope": "project"}

// 1. Filtering Logic (High-Performance Native Filter)
FilteredElementCollector collector = new(Doc);
_ = collector.OfCategory(BuiltInCategory.OST_Walls);
_ = collector.WhereElementIsNotElementType();
List<ElementFilter> filters_1764734598080 = [];
if (p.BaseConstraint != null)
{
    filters_1764734598080.Add(new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint.Id)));
}
if (p.Length != 0)
{
    filters_1764734598080.Add(new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.CURVE_ELEM_LENGTH)), new FilterNumericLess(), p.Length, 1e-6)));
}
ElementFilter? final_1764734598080 = filters_1764734598080.Count > 0 ? (filters_1764734598080.Count == 1 ? filters_1764734598080[0] : new LogicalAndFilter(filters_1764734598080)) : null;
if (final_1764734598080 != null)
{
    _ = collector.WherePasses(final_1764734598080);
}
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

public class Params

{
    #region Generated Parameters
    /// Filter value for Base Constraint
    public Level? BaseConstraint { get; set; }
    /// Filter value for Length
    [Unit("mm")]
    public double Length { get; set; } = 2000;
    #endregion
}
