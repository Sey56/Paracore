// 1. Query & Setup
Params p = new();

// Visual Query Injection
// __PARACORE_QUERY_DATA__{"category": "OST_Walls", "rootGroup": {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Length", "storage_type": "Double", "operator": ">", "value": "3000", "unit": "mm", "is_builtin": true, "builtin_id": -1004005, "builtin_name": "CURVE_ELEM_LENGTH", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:length-2.0.1"}, {"type": "group", "combinator": "OR", "children": [{"type": "rule", "name": "Unconnected Height", "storage_type": "Double", "operator": ">", "value": "2500", "unit": "mm", "is_builtin": true, "builtin_id": -1001105, "builtin_name": "WALL_USER_HEIGHT_PARAM", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:length-2.0.1"}, {"type": "rule", "name": "Base Constraint", "storage_type": "ElementId", "operator": "==", "value": "0", "unit": null, "is_builtin": true, "builtin_id": -1001107, "builtin_name": "WALL_BASE_CONSTRAINT", "revit_element_type": "Level", "spec_type_id": ""}, {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Comments", "storage_type": "String", "operator": "Contains", "value": "External", "unit": null, "is_builtin": true, "builtin_id": -1010106, "builtin_name": "ALL_MODEL_INSTANCE_COMMENTS", "revit_element_type": "", "spec_type_id": "autodesk.spec:spec.string-2.0.0"}, {"type": "rule", "name": "Mark", "storage_type": "String", "operator": "!=", "value": "X", "unit": null, "is_builtin": true, "builtin_id": -1001203, "builtin_name": "ALL_MODEL_MARK", "revit_element_type": "", "spec_type_id": "autodesk.spec:spec.string-2.0.0"}]}]}]}, "selectedColumns": [{"type": "rule", "name": "Area", "storage_type": "Double", "operator": "==", "value": "", "unit": "m2", "is_builtin": true, "builtin_id": -1012805, "builtin_name": "HOST_AREA_COMPUTED", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:area-2.0.0"}, {"type": "rule", "name": "Volume", "storage_type": "Double", "operator": "==", "value": "", "unit": "m3", "is_builtin": true, "builtin_id": -1012806, "builtin_name": "HOST_VOLUME_COMPUTED", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:volume-2.0.0"}, {"type": "rule", "name": "Family Name", "storage_type": "String", "operator": "==", "value": "", "unit": null, "is_builtin": true, "builtin_id": -1002002, "builtin_name": "SYMBOL_FAMILY_NAME_PARAM", "revit_element_type": "", "spec_type_id": "autodesk.spec:spec.string-2.0.0"}], "scope": "project"}

// 1. Filtering Logic (High-Performance Native Filter)
FilteredElementCollector collector = new(Doc);
collector.OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType();
collector.WherePasses(new LogicalAndFilter([new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.CURVE_ELEM_LENGTH)), new FilterNumericGreater(), (double)p.Length, 1e-6)), new LogicalOrFilter([new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_USER_HEIGHT_PARAM)), new FilterNumericGreater(), (double)p.UnconnectedHeight, 1e-6)), new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint?.Id ?? ElementId.InvalidElementId)), new LogicalAndFilter([new ElementParameterFilter(new FilterStringRule(new ParameterValueProvider(new ElementId(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)), new FilterStringContains(), p.Comments)), new ElementParameterFilter(new FilterStringRule(new ParameterValueProvider(new ElementId(BuiltInParameter.ALL_MODEL_MARK)), new FilterStringEquals(), p.Mark))])])]));
List<Wall> elements = [.. collector.Cast<Wall>()];

// 2. Output Results
Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
if (elements.Count > 0)
{
    var results = elements.Select(el =>
    {
        object LengthValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);
        object UnconnectedHeightValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);
        object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
        object CommentsValue = el.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.AsString() ?? "-";
        object MarkValue = el.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString() ?? "-";
        object AreaValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0, UnitTypeId.SquareMeters), 4);
        object VolumeValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.HOST_VOLUME_COMPUTED)?.AsDouble() ?? 0, UnitTypeId.CubicMeters), 4);
        object FamilyNameValue = el.get_Parameter(BuiltInParameter.ELEM_FAMILY_PARAM)?.AsValueString() ?? el.Name;

        return new
        {
            Id = el.Id.Value,
            el.Name,
            Length = LengthValue,
            UnconnectedHeight = UnconnectedHeightValue,
            BaseConstraint = BaseConstraintValue,
            Comments = CommentsValue,
            Mark = MarkValue,
            Area = AreaValue,
            Volume = VolumeValue,
            FamilyName = FamilyNameValue,
        };
    }).ToList();
    Table(results);
}

public class Params

{
    #region Generated Parameters
    /// Filter value for Length
    [Unit("mm")]
    public double Length { get; set; } = 3000;
    /// Filter value for Unconnected Height
    [Unit("mm")]
    public double UnconnectedHeight { get; set; } = 2500;
    /// Filter value for Base Constraint
    public Level? BaseConstraint { get; set; }
    /// Filter value for Comments
    public string Comments { get; set; } = "External";
    /// Filter value for Mark
    public string Mark { get; set; } = "X";
    #endregion
}
