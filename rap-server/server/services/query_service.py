from typing import List, Dict, Any
import re

def generate_query_code(category_name: str, root_group: Dict[str, Any]) -> Dict[str, str]:
    """
    Generates high-performance C# code for a FilteredElementCollector using ElementParameterFilters.
    """
    
    # 1. Clean up category name for casting
    clean_cat = category_name.replace("OST_", "")
    if clean_cat.endswith("s") and not clean_cat.endswith("ss"):
        cast_type = clean_cat[:-1]
    else:
        cast_type = "Element"

    all_rules = []
    def collect_rules(group):
        for child in group["children"]:
            if child["type"] == "rule":
                all_rules.append(child)
            else:
                collect_rules(child)
    collect_rules(root_group)

    # --- Params Generation ---
    params_lines = []
    seen_props = set()
    for rule in all_rules:
        prop_id = rule["name"].replace(" ", "")
        if prop_id in seen_props: continue
        seen_props.add(prop_id)
        storage = rule["storage_type"]
        val = rule["value"]
        unit = rule.get("unit")
        attr = f'[Unit("{unit}")]\\n    ' if unit else ""
        csharp_type = "string"
        if storage == "Double": csharp_type = "double"
        elif storage == "Integer": csharp_type = "int"
        elif storage == "ElementId": csharp_type = rule.get("revit_element_type") or "ElementId"
        
        default_val = f'"{val}"' if isinstance(val, str) else str(val)
        if isinstance(val, bool): default_val = str(val).lower()
        if storage == "ElementId" and csharp_type != "ElementId": default_val = "null"
        params_lines.append(f"{attr}public {csharp_type} {prop_id} {{ get; set; }} = {default_val};")

    # --- ElementParameterFilter Recursive Generation ---
    def build_filter_logic(group):
        child_filters = []
        for child in group["children"]:
            if child["type"] == "group":
                inner = build_filter_logic(child)
                if inner: child_filters.append(inner)
            else:
                # Generate a FilterRule
                storage = child["storage_type"]
                op = child["operator"]
                prop_id = child["name"].replace(" ", "")
                
                # Identify Parameter Identifier
                if child.get("is_builtin") and child.get("builtin_id"):
                    param_id = f"new ElementId(BuiltInParameter.{re.sub(r'^BuiltInParameter\.', '', str(child.get('builtin_id'))) if not str(child.get('builtin_id')).isdigit() else '(BuiltInParameter)' + str(child.get('builtin_id'))})"
                    # Fallback for raw IDs
                    if "(BuiltInParameter)" in param_id:
                         param_id = f"new ElementId({child['builtin_id']})"
                else:
                    # For shared/project params, we need to find the ID at runtime or use a slow rule.
                    # We'll use a helper to find it.
                    param_id = f"GetParamId(Doc, \"{child['name']}\")"

                # Map Operators to Revit FilterNumericRuleEvaluators
                evaluator = "FilterNumericEquals()"
                if op == "!=": evaluator = "FilterNumericGreater()" # Not directly supported, usually needs inversion
                elif op == ">": evaluator = "FilterNumericGreater()"
                elif op == "<": evaluator = "FilterNumericLess()"
                elif op == ">=": evaluator = "FilterNumericGreaterGreaterEqual()"
                elif op == "<=": evaluator = "FilterNumericLessLessEqual()"

                rule_obj = "null"
                if storage == "Double":
                    rule_obj = f"new FilterDoubleRule(new ParameterValueProvider({param_id}), new {evaluator}, p.{prop_id}, 1e-6)"
                elif storage == "Integer":
                    rule_obj = f"new FilterIntegerRule(new ParameterValueProvider({param_id}), new {evaluator}, p.{prop_id})"
                elif storage == "ElementId":
                    val_expr = f"p.{prop_id}" if child.get("revit_element_type") == "ElementId" else f"p.{prop_id}?.Id ?? ElementId.InvalidElementId"
                    rule_obj = f"new FilterElementIdRule(new ParameterValueProvider({param_id}), new {evaluator}, {val_expr})"
                elif storage == "String":
                    str_eval = "FilterStringEquals()"
                    if op == "Contains": str_eval = "FilterStringContains()"
                    elif op == "Starts With": str_eval = "FilterStringBeginsWith()"
                    elif op == "Ends With": str_eval = "FilterStringEndsWith()"
                    rule_obj = f"new FilterStringRule(new ParameterValueProvider({param_id}), new {str_eval}, p.{prop_id})"

                if rule_obj != "null":
                    child_filters.append(f"new ElementParameterFilter({rule_obj})")

        if not child_filters: return "null"
        if len(child_filters) == 1: return child_filters[0]
        
        # Combine filters
        logical_type = "LogicalAndFilter" if group["combinator"] == "AND" else "LogicalOrFilter"
        return f"new {logical_type}(new List<ElementFilter> {{ {', '.join(child_filters)} }})"

    revit_filter = build_filter_logic(root_group)

    logic_parts = []
    logic_parts.append("// High-Performance Revit Native Filter")
    logic_parts.append(f"var collector = new FilteredElementCollector(Doc)")
    logic_parts.append(f"    .OfCategory(BuiltInCategory.{category_name})")
    logic_parts.append(f"    .WhereElementIsNotElementType();")
    
    if revit_filter != "null":
        logic_parts.append(f"var filter = {revit_filter};")
        logic_parts.append(f"collector.WherePasses(filter);")
    
    logic_parts.append(f"var elements = collector.Cast<{cast_type}>().ToList();")

    # --- Helper Method (Internal to the script logic scope) ---
    helper = """
    // Helper to find Parameter ID at runtime
    ElementId GetParamId(Document doc, string name) {
        var first = new FilteredElementCollector(doc)
            .OfCategory(BuiltInCategory.""" + category_name + """)
            .WhereElementIsNotElementType()
            .FirstElement();
        
        if (first != null) {
            var p = first.LookupParameter(name);
            if (p != null) return p.Id;
        }
        return ElementId.InvalidElementId;
    }
    """
    logic_parts.append(helper)

    return {
        "logic": "\n".join(logic_parts),
        "params": "\n    ".join(params_lines)
    }
