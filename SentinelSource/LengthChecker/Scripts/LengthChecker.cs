// Watchdog: Sentinel for OST_Walls
// Generated from Visual Query Builder
Watchdog(() =>
{
    Params p = new();

    // __PARACORE_QUERY_DATA__{"category": "OST_Walls", "rootGroup": {"type": "group", "combinator": "AND", "children": [{"type": "rule", "name": "Base Constraint", "storage_type": "ElementId", "operator": "==", "value": "0", "unit": null, "is_builtin": true, "builtin_id": -1001107, "builtin_name": "WALL_BASE_CONSTRAINT", "revit_element_type": "Level", "spec_type_id": ""}, {"type": "rule", "name": "Length", "storage_type": "Double", "operator": "<", "value": "2000", "unit": "mm", "is_builtin": true, "builtin_id": -1004005, "builtin_name": "CURVE_ELEM_LENGTH", "revit_element_type": "", "spec_type_id": "autodesk.spec.aec:length-2.0.1"}]}, "selectedColumns": [], "scope": "project"}

    // 1. Filtering Logic (High-Performance Native Filter)
    FilteredElementCollector collector = new(Doc);
    _ = collector.OfCategory(BuiltInCategory.OST_Walls);
    _ = collector.WhereElementIsNotElementType();
    List<ElementFilter> wallsFilters = [];
    if (p.BaseConstraint != null)
    {
        wallsFilters.Add(new ElementParameterFilter(new FilterElementIdRule(new ParameterValueProvider(new ElementId(BuiltInParameter.WALL_BASE_CONSTRAINT)), new FilterNumericEquals(), p.BaseConstraint.Id)));
    }
    if (p.Length != 0)
    {
        wallsFilters.Add(new ElementParameterFilter(new FilterDoubleRule(new ParameterValueProvider(new ElementId(BuiltInParameter.CURVE_ELEM_LENGTH)), new FilterNumericLess(), p.Length, 1e-6)));
    }
    ElementFilter? finalWallsFilter = wallsFilters.Count > 0
        ? (wallsFilters.Count == 1 ? wallsFilters[0] : new LogicalAndFilter(wallsFilters))
        : null;
    if (finalWallsFilter != null)
    {
        _ = collector.WherePasses(finalWallsFilter);
    }
    List<Wall> elements = [.. collector.Cast<Wall>()];

    // --- Actions & Reporting ---
    string action = ExecutionGlobals.Get<string>("__sentinel_action__")?.ToLowerInvariant() ?? string.Empty;

    if (action == "select")
    {
        Select(elements);
    }
    else if (action == "isolate")
    {
        Transact("Isolate Sentinel Results", () => Isolate(elements));
    }
    else if (action == "table")
    {
        // 2. Output Results
        Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
        if (elements.Count > 0)
        {
            List<object> results = [.. elements.Select(el =>
            {
                object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
                object LengthValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);

                return (object)new
                {
                    Id = el.Id.Value,
                    el.Name,
                    BaseConstraint = BaseConstraintValue,
                    Length = LengthValue,
                };
            })];
            Table(results);
        }

        // 3. Interactive Actions (Removed)
    }
    else
    {
        // Background Reporting (or Manual Gallery Run)
        if (elements.Count > 0)
        {
            WatchdogReport($"Found {elements.Count} elements matching 'LengthChecker'", "warning", elements.Select(el => el.Id).ToList());
        }
        else
        {
            WatchdogReport("No elements match 'LengthChecker'", "success");
        }

        // If running manually in Gallery (no action), also show results
        if (string.IsNullOrEmpty(action))
        {
            // 2. Output Results
            Println($"Query complete. Found {elements.Count} elements in category 'Walls'.");
            if (elements.Count > 0)
            {
                List<object> results = [.. elements.Select(el =>
                {
                    object BaseConstraintValue = el.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsValueString() ?? "-";
                    object LengthValue = Math.Round(UnitUtils.ConvertFromInternalUnits(el.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Millimeters), 4);

                    return (object)new
                    {
                        Id = el.Id.Value,
                        el.Name,
                        BaseConstraint = BaseConstraintValue,
                        Length = LengthValue,
                    };
                })];
                Table(results);
            }

            // 3. Interactive Actions (Removed)
        }
    }
});



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
