// 1. Query & Setup
Params p = new();

// Visual Query Injection
// 1. Filtering Logic (High-Performance Native Filter)
FilteredElementCollector collector = new(Doc);
collector.OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType();
collector.WherePasses(new LogicalAndFilter([new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint?.Id ?? ElementId.InvalidElementId)), new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.HOST_AREA_COMPUTED)), new FilterNumericLess(), (double)p.Area, 1e-6))]));
List<Wall> elements = [.. collector.Cast<Wall>()];

// 2. Output Results
Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
if (elements.Count > 0)
{
    var results = elements.Select(el =>
    {
        object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
        object AreaValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0, UnitTypeId.SquareMeters), 4);

        return new
        {
            Id = el.Id.Value,
            el.Name,
            BaseConstraint = BaseConstraintValue,
            Area = AreaValue,
        };
    }).ToList();
    Table(results);
}

public class Params


{
    #region Generated Parameters
    /// Filter value for Base Constraint
    public Level? BaseConstraint { get; set; }
    /// Filter value for Area
    [Unit("m2")]
    public double Area { get; set; } = 6.00;
    #endregion
}
