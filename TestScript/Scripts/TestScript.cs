using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using CoreScript.Engine.Attributes;

/// <summary>
/// DisplayName: TestScript
/// Description: Custom C# automation script.
/// </summary>
public class Script : ICoreScript
{
    public Document Doc { get; set; }
    public UIDocument Uidoc { get; set; }

    public void Run(Params p)
    {
        // Visual Query Injection
// __PARACORE_QUERY_DATA__{"category": "OST_Walls", "rootGroup": {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Base Constraint", "storage_type": "ElementId", "operator": "==", "value": "0", "unit": null, "is_builtin": true, "builtin_id": -1001107, "builtin_name": "WALL_BASE_CONSTRAINT", "revit_element_type": "Level"}, {"type": "rule", "name": "Length", "storage_type": "Double", "operator": "<", "value": "2000", "unit": "mm", "is_builtin": true, "builtin_id": -1004005, "builtin_name": "CURVE_ELEM_LENGTH", "revit_element_type": ""}]}, "selectedColumns": [{"type": "rule", "name": "Area", "storage_type": "Double", "operator": "==", "value": "", "unit": "m2", "is_builtin": true, "builtin_id": -1012805, "builtin_name": "HOST_AREA_COMPUTED", "revit_element_type": ""}], "scope": "project"}

// 1. Filtering Logic (High-Performance Native Filter)
FilteredElementCollector collector = new(Doc);
collector.OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType();
collector.WherePasses(new LogicalAndFilter([new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint?.Id ?? ElementId.InvalidElementId)), new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.CURVE_ELEM_LENGTH)), new FilterNumericLess(), (double)p.Length, 1e-6))]));
List<Wall> elements = [.. collector.Cast<Wall>()];

// 2. Output Results
Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
if (elements.Count > 0)
{
    var results = elements.Select(el =>
    {
        object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
        object LengthValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);
        object AreaValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0, UnitTypeId.SquareMeters), 4);

        return new
        {
            Id = el.Id.Value,
            el.Name,
            BaseConstraint = BaseConstraintValue,
            Length = LengthValue,
            Area = AreaValue,
        };
    }).ToList();
    Table(results);
}

public class Params

{
    #region Generated Parameters
    /// <summary>Filter value for Base Constraint</summary>
    public Level? BaseConstraint { get; set; }
    /// <summary>Filter value for Length</summary>
    [Unit("mm")]
    public double Length { get; set; } = 2000;
    #endregion
}
