// 1. Query & Setup
var p = new Params();

// Visual Query Injection
// Filter elements using Revit Native Parameter Filters
var collector = new FilteredElementCollector(Doc).OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType();
collector.WherePasses(new LogicalAndFilter(new List<ElementFilter> { new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId((BuiltInParameter)(-1001107))), new FilterNumericEquals(), p.BaseConstraint?.Id ?? ElementId.InvalidElementId)), new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId((BuiltInParameter)(-1004005))), new FilterNumericLess(), p.Length, 1e-6)) }));
var elements = collector.Cast<Wall>().ToList();

Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
if (elements.Any()) {
    var results = elements.Select(el => new {
        Id = el.Id.Value,
        Name = el.Name,
        BaseConstraint = el.LookupParameter("Base Constraint")?.AsValueString() ?? "-",
        Length = el.LookupParameter("Length")?.AsValueString() ?? "-",
    }).ToList();
    Table(results);
}

public class Params {
    #region Generated Parameters
    public Level BaseConstraint { get; set; } = null;
    [Unit("mm")]
    public double Length { get; set; } = 2000;
    #endregion
}
