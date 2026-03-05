from typing import List, Dict, Any, Optional
import re
import json

def generate_query_code(category_name: str, root_group: Dict[str, Any], selected_columns: Optional[List[Dict[str, Any]]] = None, scope: str = "project") -> Dict[str, Any]:
    """
    Generates high-performance C# code using BuiltInParameter names as the absolute unique identity.
    Category-aware type promotion and descriptive naming for both System and Loadable families.
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

    # Map System Categories to their specialized Type classes
    SYSTEM_TYPE_MAP = {
        "OST_Walls": "WallType", "OST_Floors": "FloorType", "OST_Ceilings": "CeilingType",
        "OST_Roofs": "RoofType", "OST_DuctCurves": "DuctType", "OST_PipeCurves": "PipeType",
        "OST_CableTray": "CableTrayType", "OST_Conduit": "ConduitType",
    }
    
    UNIT_MAP = {
        "mm": "UnitTypeId.Millimeters", "cm": "UnitTypeId.Centimeters", "m": "UnitTypeId.Meters",
        "in": "UnitTypeId.Inches", "m2": "UnitTypeId.SquareMeters", "sqm": "UnitTypeId.SquareMeters",
        "m3": "UnitTypeId.CubicMeters", "cum": "UnitTypeId.CubicMeters"
    }
    
    # Generic Revit containers that REQUIRE a category hint [RevitElements]
    GENERIC_CONTAINERS = {"Element", "ElementType", "FamilyInstance", "FamilySymbol", "SpatialElement"}

    cast_type = CLASS_MAP.get(category_name, "Element")
    clean_cat = category_name.replace("OST_", "")
    
    all_filter_rules = []
    def collect_rules(group):
        for child in group["children"]:
            if child["type"] == "rule": all_filter_rules.append(child)
            else: collect_rules(child)
    collect_rules(root_group)

    # --- PASS 1: UNIQUE IDENTITY & NAME MAPPING ---
    property_map = {} 
    param_fields = []
    seen_unique_ids = set()
    used_property_names = {} 

    for rule in all_filter_rules:
        unique_id = f"{rule.get('builtin_id') or rule['name']}_{rule.get('is_type')}"
        if unique_id in seen_unique_ids: continue
        seen_unique_ids.add(unique_id)
        
        # A. Resolve Precision Type
        clean_name = re.sub(r'\s+\[.*?\]$', '', rule["name"])
        storage = rule["storage_type"]; val = rule["value"]; unit = rule.get("unit")
        csharp_type = rule.get("revit_element_type") or "ElementId"
        is_revit_type = False
        attrs = []
        if unit: attrs.append(f'Unit("{unit}")')

        if storage == "Double": csharp_type = "double"
        elif storage == "Integer": 
            csharp_type = "int"
            if "Parameter" in clean_name: csharp_type = "BuiltInParameter"
            elif "Category" in clean_name: csharp_type = "BuiltInCategory"
        elif storage == "ElementId": 
            if csharp_type != "ElementId":
                is_revit_type = True
                
                # TOTAL TYPE PROMOTION
                if csharp_type in ["ElementType", "FamilySymbol"]:
                    if category_name in SYSTEM_TYPE_MAP:
                        csharp_type = SYSTEM_TYPE_MAP[category_name]
                    else:
                        csharp_type = "FamilySymbol"
                        attrs.append(f'RevitElements(Category = "{clean_cat}")')
                elif csharp_type in GENERIC_CONTAINERS:
                    attrs.append(f'RevitElements(Category = "{clean_cat}")')

        # B. Resolve Descriptive Property Name
        display_name_base = csharp_type
        if csharp_type == "FamilySymbol": display_name_base = f"{clean_cat}Symbol"
        elif csharp_type == "FamilyInstance": display_name_base = f"{clean_cat}Instance"
        
        if clean_name.lower() in ["type", "instance", "symbol", "family"]:
            base_prop_name = display_name_base
        else:
            base_prop_name = clean_name.replace(" ", "")
        
        final_name = base_prop_name
        counter = 1
        while final_name in used_property_names:
            if rule.get("builtin_name"):
                suffix = rule["builtin_name"].split('_')[-1].capitalize()
                final_name = f"{base_prop_name}_{suffix}"
                if final_name in used_property_names: final_name = f"{base_prop_name}_{suffix}{counter}"
            else:
                final_name = f"{base_prop_name}{counter}"
            counter += 1
            
        used_property_names[final_name] = True
        property_map[unique_id] = final_name

        # C. Generate C# Field
        attr_prefix = f"[{', '.join(attrs)}]\n    " if attrs else ""
        param_fields.append(f"/// Filter value for {rule['name']}")
        
        if is_revit_type:
            param_fields.append(f"{attr_prefix}public {csharp_type}? {final_name} {{ get; set; }}")
        else:
            if storage in ["Double", "Integer"]: default_val = str(val) if val else "0"
            else:
                default_val = f'"{val}"' if isinstance(val, str) else str(val)
                if isinstance(val, bool): default_val = str(val).lower()
            param_fields.append(f"{attr_prefix}public {csharp_type} {final_name} {{ get; set; }} = {default_val};")

    uses_get_param_id = False
    subgroup_counter = 0

    # --- PASS 2: LOGIC GENERATION ---
    def build_filter_logic(group, is_root=True):
        nonlocal uses_get_param_id, subgroup_counter
        lines = []
        logical_type = "LogicalAndFilter" if group["combinator"] == "AND" else "LogicalOrFilter"
        if is_root: list_var = f"{clean_cat.lower()}Filters"; result_var = f"final{clean_cat}Filter"
        else:
            subgroup_counter += 1
            list_var = f"subFilters{subgroup_counter}"; result_var = f"groupFilter{subgroup_counter}"
        
        lines.append(f"    List<ElementFilter> {list_var} = [];")
        
        for child in group["children"]:
            if child["type"] == 'group':
                inner_lines, inner_var = build_filter_logic(child, is_root=False)
                lines.extend(inner_lines)
                lines.append(f"    if ({inner_var} != null) {list_var}.Add({inner_var});")
            else:
                uid = f"{child.get('builtin_id') or child['name']}_{child.get('is_type')}"
                prop_id = property_map.get(uid, child["name"].replace(" ", ""))
                storage = child["storage_type"]; op = child["operator"]
                
                if child.get("is_builtin") and child.get("builtin_id"):
                    b_name = child.get('builtin_name')
                    param_id = f"new ElementId(BuiltInParameter.{b_name})" if b_name and not b_name.isdigit() and "-" not in b_name else f"new ElementId((BuiltInParameter)({child['builtin_id']}))"
                else:
                    uses_get_param_id = True; param_id = f"GetParamId(Doc, \"{child['name']}\")"

                evaluator = "new FilterNumericEquals()"
                if op == "!=": evaluator = "new FilterNumericEquals()"
                elif op == ">": evaluator = "new FilterNumericGreater()"
                elif op == "<": evaluator = "new FilterNumericLess()"
                elif op == ">=": evaluator = "new FilterNumericGreaterOrEqual()"
                elif op == "<=": evaluator = "new FilterNumericLessOrEqual()"

                rule_obj = "null"; condition = "true"
                if storage == "Double":
                    condition = f"p.{prop_id} != 0"
                    rule_obj = f"new FilterDoubleRule(new ParameterValueProvider({param_id}), {evaluator}, p.{prop_id}, 1e-6)"
                elif storage == "Integer":
                    condition = f"p.{prop_id} != 0"
                    rule_obj = f"new FilterIntegerRule(new ParameterValueProvider({param_id}), {evaluator}, (int)p.{prop_id})"
                elif storage == "ElementId":
                    # Precision Hydration Check: if it's promoted or specialized, it's hydrated
                    revit_type = child.get("revit_element_type") or "ElementId"
                    is_hydrated = revit_type != "ElementId"
                    
                    if is_hydrated:
                        condition = f"p.{prop_id} != null"; val_expr = f"p.{prop_id}.Id"
                    else:
                        condition = f"p.{prop_id} != ElementId.InvalidElementId"; val_expr = f"p.{prop_id}"
                    rule_obj = f"new FilterElementIdRule(new ParameterValueProvider({param_id}), {evaluator}, {val_expr})"
                elif storage == "String":
                    condition = f"!string.IsNullOrEmpty(p.{prop_id})"
                    str_eval = "new FilterStringEquals()"
                    if op == "Contains": str_eval = "new FilterStringContains()"
                    elif op == "Starts With": str_eval = "new FilterStringBeginsWith()"
                    elif op == "Ends With": str_eval = "new FilterStringEndsWith()"
                    rule_obj = f"new FilterStringRule(new ParameterValueProvider({param_id}), {str_eval}, p.{prop_id})"

                if rule_obj != "null":
                    inverted = "true" if op == "!=" else "false"
                    lines.append(f"    if ({condition}) {list_var}.Add(new ElementParameterFilter({rule_obj}, {inverted}));")

        lines.append(f"    ElementFilter? {result_var} = {list_var}.Count > 0 ? ({list_var}.Count == 1 ? {list_var}[0] : new {logical_type}({list_var})) : null;")
        return lines, result_var

    filter_construction_lines, final_filter_var = build_filter_logic(root_group)
    
    logic_parts = [
        f"// __PARACORE_QUERY_DATA__{json.dumps({'category': category_name, 'rootGroup': root_group, 'selectedColumns': selected_columns or [], 'scope': scope})}",
        "", "// 1. Filtering Logic (High-Performance Native Filter)",
        "var selection = UIDoc.Selection.GetElementIds();" if scope == "selection" else "",
        "if (selection.Count == 0) { Println(\"Nothing selected.\"); return; }" if scope == "selection" else "",
        f"FilteredElementCollector collector = new(Doc{', selection' if scope == 'selection' else ''});",
        f"_ = collector.OfCategory(BuiltInCategory.{category_name});",
        "_ = collector.WhereElementIsNotElementType();",
        "\n".join(filter_construction_lines),
        f"if ({final_filter_var} != null) _ = collector.WherePasses({final_filter_var});",
        f"List<{cast_type}> elements = [.. collector.Cast<{cast_type}>()];",
        "\n// 2. Output Results",
        f"Println($\"Query complete. Found {{elements.Count}} elements in category '{clean_cat}'.\");",
        "if (elements.Count > 0) {",
        "    List<object> results = [.. elements.Select(el => {",
    ]

    reporting_columns = []
    seen_col_ids = set()
    for col in all_filter_rules + (selected_columns or []):
        uid = f"{col.get('builtin_id') or col['name']}_{col.get('is_type')}"
        if uid not in seen_col_ids: seen_col_ids.add(uid); reporting_columns.append(col)

    for col in reporting_columns:
        raw_name = col["name"]; p_name = re.sub(r'\s+\[.*?\]$', '', raw_name)
        p_id = property_map.get(f"{col.get('builtin_id') or col['name']}_{col.get('is_type')}", p_name.replace(" ", ""))
        storage = col["storage_type"]; unit = col.get("unit")
        if p_name == "Family Name": val_expr = "el.get_Parameter(BuiltInParameter.ELEM_FAMILY_PARAM)?.AsValueString() ?? el.Name"
        elif p_name == "Type Name": val_expr = "el.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM)?.AsValueString() ?? el.Name"
        elif col.get("is_builtin") and col.get("builtin_id"):
            b_name = col.get('builtin_name')
            p_enum = f"BuiltInParameter.{b_name}" if b_name and not b_name.isdigit() else f"(BuiltInParameter)({col['builtin_id']})"
            getter = f"Doc.GetElement(el.GetTypeId())?.get_Parameter({p_enum})" if col.get("is_type") else f"el.get_Parameter({p_enum})"
            if storage == "Double":
                if unit and unit in UNIT_MAP: val_expr = f"Math.Round(UnitUtils.ConvertFromInternalUnits({getter}?.AsDouble() ?? 0, {UNIT_MAP[unit]}), 4)"
                else: val_expr = f"Math.Round({getter}?.AsDouble() ?? 0, 4)"
            elif storage == "Integer": val_expr = f"{getter}?.AsInteger() ?? 0"
            elif storage == "String": val_expr = f"{getter}?.AsString() ?? \"-\""
            else: val_expr = f"{getter}?.AsValueString() ?? \"-\""
        else:
            getter = f"Doc.GetElement(el.GetTypeId())?.LookupParameter(\"{raw_name}\")" if col.get("is_type") else f"el.LookupParameter(\"{raw_name}\")"
            val_expr = f"{getter}?.AsValueString() ?? \"-\""
        logic_parts.append(f"        object {p_id}Value = {val_expr};")

    logic_parts.extend([
        "", "        return (object)new {", "            Id = el.Id.Value, el.Name,",
        *[f"            {property_map.get(f'{c.get('builtin_id') or c['name']}_{c.get('is_type')}', re.sub(r'\\s+\\[.*?\\]$', '', c['name']).replace(' ', ''))} = {property_map.get(f'{c.get('builtin_id') or c['name']}_{c.get('is_type')}', re.sub(r'\\s+\\[.*?\\]$', '', c['name']).replace(' ', ''))}Value," for c in reporting_columns],
        "        };", "    })];", "    Table(results);", "}", "\n// 3. Interactive Actions (Removed)"
    ])

    helper = f"\nstatic ElementId GetParamId(Document doc, string name) {{ Element? first = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.{category_name}).WhereElementIsNotElementType().FirstElement(); return first?.LookupParameter(name)?.Id ?? ElementId.InvalidElementId; }}" if uses_get_param_id else ""
    return {
        "logic": "\n".join([l.rstrip() for l in logic_parts if l.strip() or l == ""]),
        "helpers": helper.strip(),
        "params": "    " + "\n    ".join([l.rstrip() for l in param_fields])
    }
