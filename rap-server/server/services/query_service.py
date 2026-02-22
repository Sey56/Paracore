from typing import List, Dict, Any, Optional
import re
import json

def generate_query_code(category_name: str, root_group: Dict[str, Any], selected_columns: Optional[List[Dict[str, Any]]] = None, scope: str = "project") -> Dict[str, Any]:
    """
    Generates high-performance C# code for a FilteredElementCollector.
    Pure Top-Level Scripting Format.
    """
    
    CLASS_MAP = {
        "OST_Walls": "Wall", "OST_Doors": "FamilyInstance", "OST_Windows": "FamilyInstance",
        "OST_Rooms": "Room", "OST_Furniture": "FamilyInstance", "OST_Sheets": "ViewSheet",
        "OST_Views": "View", "OST_Levels": "Level", "OST_Floors": "Floor",
        "OST_Columns": "FamilyInstance", "OST_StructuralColumns": "FamilyInstance",
        "OST_StructuralFraming": "FamilyInstance", "OST_StructuralFoundation": "Element",
        "OST_Ceilings": "Ceiling", "OST_Roofs": "FootPrintRoof", "OST_GenericModel": "GenericModels",
        "OST_MechanicalEquipment": "FamilyInstance", "OST_DuctCurves": "Duct", "OST_PipeCurves": "Pipe",
        "OST_CableTray": "CableTray", "OST_Conduit": "Conduit", "OST_LightingFixtures": "FamilyInstance",
        "OST_ElectricalEquipment": "FamilyInstance", "OST_PlumbingFixtures": "FamilyInstance",
    }
    
    UNIT_MAP = {
        "mm": "UnitTypeId.Millimeters", "cm": "UnitTypeId.Centimeters", "m": "UnitTypeId.Meters",
        "in": "UnitTypeId.Inches", "m2": "UnitTypeId.SquareMeters", "sqm": "UnitTypeId.SquareMeters",
        "m3": "UnitTypeId.CubicMeters", "cum": "UnitTypeId.CubicMeters"
    }
    
    cast_type = CLASS_MAP.get(category_name, "Element")
    clean_cat = category_name.replace("OST_", "")
    
    SYSTEM_TYPES = {
        "Level", "Wall", "Floor", "Ceiling", "Roof", "FootPrintRoof", 
        "Room", "View", "ViewSheet", "Duct", "Pipe", "CableTray", "Conduit",
        "Phase", "DesignOption", "Material"
    }

    all_filter_rules = []
    def collect_rules(group):
        for child in group["children"]:
            if child["type"] == "rule": all_filter_rules.append(child)
            else: collect_rules(child)
    collect_rules(root_group)

    param_fields = []
    seen_props = set()
    for rule in all_filter_rules:
        prop_name = rule["name"]
        prop_id = prop_name.replace(" ", "")
        if prop_id in seen_props: continue
        seen_props.add(prop_id)
        
        storage = rule["storage_type"]
        val = rule["value"]
        unit = rule.get("unit")
        
        attrs = []
        if unit: attrs.append(f'Unit("{unit}")')
        
        csharp_type = "string"
        is_revit_type = False
        
        if storage == "Double": 
            csharp_type = "double"
        elif storage == "Integer": 
            csharp_type = "int"
            if "Parameter" in prop_name: csharp_type = "BuiltInParameter"
            elif "Category" in prop_name: csharp_type = "BuiltInCategory"
        elif storage == "ElementId": 
            csharp_type = rule.get("revit_element_type") or "ElementId"
            if csharp_type != "ElementId":
                is_revit_type = True
                if csharp_type not in SYSTEM_TYPES:
                    attrs.append(f'RevitElements(Category = "{clean_cat}")')
        
        attr_prefix = f"[{', '.join(attrs)}]\n" if attrs else ""
        # Indent once (4 spaces)
        param_fields.append(f"/// Filter value for {prop_name}")
        
        if is_revit_type:
            param_fields.append(f"{attr_prefix}public {csharp_type}? {prop_id} {{ get; set; }}")
        else:
            if storage in ["Double", "Integer"]:
                default_val = str(val)
            else:
                default_val = f'"{val}"' if isinstance(val, str) else str(val)
                if isinstance(val, bool): default_val = str(val).lower()
            param_fields.append(f"{attr_prefix}public {csharp_type} {prop_id} {{ get; set; }} = {default_val};")

    uses_get_param_id = False

    def build_filter_logic(group):
        nonlocal uses_get_param_id
        lines = []
        logical_type = "LogicalAndFilter" if group["combinator"] == "AND" else "LogicalOrFilter"
        list_var = f"filters_{id(group)}"
        
        lines.append(f"List<ElementFilter> {list_var} = [];")
        
        for child in group["children"]:
            if child["type"] == "group":
                inner_lines, inner_var = build_filter_logic(child)
                lines.extend(inner_lines)
                lines.append(f"if ({inner_var} != null)")
                lines.append(f"{{")
                lines.append(f"    {list_var}.Add({inner_var});")
                lines.append(f"}}")
            else:
                storage = child["storage_type"]
                op = child["operator"]
                prop_name = child["name"]
                prop_id = prop_name.replace(" ", "")
                
                if child.get("is_builtin") and child.get("builtin_id"):
                    b_name = child.get('builtin_name')
                    if b_name and not b_name.isdigit() and "-" not in b_name:
                        param_id = f"new ElementId(BuiltInParameter.{b_name})"
                    else:
                        param_id = f"new ElementId((BuiltInParameter)({child['builtin_id']}))"
                else:
                    uses_get_param_id = True
                    param_id = f"GetParamId(Doc, \"{prop_name}\")"

                evaluator = "new FilterNumericEquals()"
                if op == "!=": evaluator = "new FilterNumericGreater()" 
                elif op == ">": evaluator = "new FilterNumericGreater()"
                elif op == "<": evaluator = "new FilterNumericLess()"
                elif op == ">=": evaluator = "new FilterNumericGreaterGreaterEqual()"
                elif op == "<=": evaluator = "new FilterNumericLessLessEqual()"

                rule_obj = "null"
                condition = "true"
                
                if storage == "Double":
                    condition = f"p.{prop_id} != 0"
                    rule_obj = f"new FilterDoubleRule(new ParameterValueProvider({param_id}), {evaluator}, p.{prop_id}, 1e-6)"
                elif storage == "Integer":
                    condition = f"p.{prop_id} != 0"
                    rule_obj = f"new FilterIntegerRule(new ParameterValueProvider({param_id}), {evaluator}, (int)p.{prop_id})"
                elif storage == "ElementId":
                    is_hydrated = (child.get("revit_element_type") or "ElementId") != "ElementId"
                    if is_hydrated:
                        condition = f"p.{prop_id} != null"
                        val_expr = f"p.{prop_id}.Id"
                    else:
                        condition = f"p.{prop_id} != ElementId.InvalidElementId"
                        val_expr = f"p.{prop_id}"
                    rule_obj = f"new FilterElementIdRule(new ParameterValueProvider({param_id}), {evaluator}, {val_expr})"
                elif storage == "String":
                    condition = f"!string.IsNullOrEmpty(p.{prop_id})"
                    str_eval = "new FilterStringEquals()"
                    if op == "Contains": str_eval = "new FilterStringContains()"
                    elif op == "Starts With": str_eval = "new FilterStringBeginsWith()"
                    elif op == "Ends With": str_eval = "new FilterStringEndsWith()"
                    rule_obj = f"new FilterStringRule(new ParameterValueProvider({param_id}), {str_eval}, p.{prop_id})"

                if rule_obj != "null":
                    lines.append(f"if ({condition})")
                    lines.append(f"{{")
                    lines.append(f"    {list_var}.Add(new ElementParameterFilter({rule_obj}));")
                    lines.append(f"}}")

        result_var = f"final_{id(group)}"
        lines.append(f"ElementFilter? {result_var} = {list_var}.Count > 0 ? ({list_var}.Count == 1 ? {list_var}[0] : new {logical_type}({list_var})) : null;")
        
        return lines, result_var

    filter_construction_lines, final_filter_var = build_filter_logic(root_group)
    filter_construction_code = "\n".join(filter_construction_lines)

    query_metadata = {
        "category": category_name, "rootGroup": root_group,
        "selectedColumns": selected_columns or [], "scope": scope
    }
    metadata_json = json.dumps(query_metadata)
    
    logic_parts = []
    logic_parts.append(f"// __PARACORE_QUERY_DATA__{metadata_json}")
    logic_parts.append("")
    logic_parts.append("// 1. Filtering Logic (High-Performance Native Filter)")
    
    if scope == "selection":
        logic_parts.append("var selection = Uidoc.Selection.GetElementIds();")
        logic_parts.append("if (selection.Count == 0)")
        logic_parts.append("{")
        logic_parts.append("    Println(\"Nothing selected. Please select elements in Revit.\");")
        logic_parts.append("    return;")
        logic_parts.append("}")
        logic_parts.append(f"FilteredElementCollector collector = new(Doc, selection);")
    else:
        logic_parts.append(f"FilteredElementCollector collector = new(Doc);")
        
    logic_parts.append(f"_ = collector.OfCategory(BuiltInCategory.{category_name});")
    logic_parts.append(f"_ = collector.WhereElementIsNotElementType();")
    
    # Inject the dynamic filter construction
    logic_parts.append(filter_construction_code)
    logic_parts.append(f"if ({final_filter_var} != null)")
    logic_parts.append("{")
    logic_parts.append(f"    _ = collector.WherePasses({final_filter_var});")
    logic_parts.append("}")
    
    logic_parts.append(f"List<{cast_type}> elements = [.. collector.Cast<{cast_type}>()];")
    
    logic_parts.append(f"\n// 2. Output Results")
    logic_parts.append(f"Println($\"Query complete. Found {{elements.Count}} elements in category '{clean_cat}'.\");")
    logic_parts.append("if (elements.Count > 0)")
    logic_parts.append("{")
    logic_parts.append("    var results = elements.Select(el =>")
    logic_parts.append("    {")
    
    reporting_columns = []
    seen_col_ids = set()
    for rule in all_filter_rules:
        if rule["name"] in seen_col_ids: continue
        seen_col_ids.add(rule["name"])
        reporting_columns.append(rule)
    if selected_columns:
        for col in selected_columns:
            if col["name"] in seen_col_ids: continue
            seen_col_ids.add(col["name"])
            reporting_columns.append(col)

    for col in reporting_columns:
        p_name = col["name"]; p_id = p_name.replace(" ", ""); storage = col["storage_type"]; unit = col.get("unit")
        if p_name == "Family Name": val_expr = "el.get_Parameter(BuiltInParameter.ELEM_FAMILY_PARAM)?.AsValueString() ?? el.Name"
        elif p_name == "Type Name": val_expr = "el.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM)?.AsValueString() ?? el.Name"
        elif col.get("is_builtin") and col.get("builtin_id"):
            b_name = col.get('builtin_name')
            getter = f"el.get_Parameter(BuiltInParameter.{b_name})" if b_name and not b_name.isdigit() else f"el.get_Parameter((BuiltInParameter)({col['builtin_id']}))"
            if storage == "Double":
                if unit and unit in UNIT_MAP: val_expr = f"Math.Round(UnitUtils.ConvertFromInternalUnits({getter}?.AsDouble() ?? 0, {UNIT_MAP[unit]}), 4)"
                else: val_expr = f"Math.Round({getter}?.AsDouble() ?? 0, 4)"
            elif storage == "Integer": val_expr = f"{getter}?.AsInteger() ?? 0"
            elif storage == "String": val_expr = f"{getter}?.AsString() ?? \"-\""
            else: val_expr = f"{getter}?.AsValueString() ?? \"-\""
        else:
            getter = f"el.LookupParameter(\"{p_name}\")"
            val_expr = f"{getter}?.AsValueString() ?? \"-\""
        logic_parts.append(f"        object {p_id}Value = {val_expr};")

    logic_parts.append("")
    logic_parts.append("        return new")
    logic_parts.append("        {")
    logic_parts.append("            Id = el.Id.Value,")
    logic_parts.append("            el.Name,")
    for col in reporting_columns:
        p_id = col["name"].replace(" ", "")
        logic_parts.append(f"            {p_id} = {p_id}Value,")
    logic_parts.append("        };")
    logic_parts.append("    }).ToList();")
    logic_parts.append("    Table(results);")
    logic_parts.append("}")

    helper = ""
    if uses_get_param_id:
        helper = f"""
// Helper to resolve parameter ID for shared/project params
static ElementId GetParamId(Document doc, string name)
{{
    Element? first = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.{category_name}).WhereElementIsNotElementType().FirstElement();
    return first?.LookupParameter(name)?.Id ?? ElementId.InvalidElementId;
}}
"""
    return {
        "logic": "\n".join([line.rstrip() for line in logic_parts]),
        "helpers": helper.rstrip() if helper else "",
        "params": "\n".join([line.rstrip() for line in param_fields])
    }
