from typing import List, Dict, Any, Optional
import re
import json

def generate_query_code(category_name: str, root_group: Dict[str, Any], selected_columns: Optional[List[Dict[str, Any]]] = None, scope: str = "project") -> Dict[str, Any]:
    """
    Generates high-performance C# code with prefix-aware naming and nullable optional filtering.
    Uses Smart Header Projection to ensure editability (Mass Edit) while preventing C# collisions.
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
    
    GENERIC_NAMES = {"Name", "Comments", "Mark", "Type", "Category", "Level", "Phase", "Instance", "Symbol"}
    RESERVED_PROPS = {"Id", "Name", "Document", "UIDoc", "Doc", "Element"}

    def get_singular(name: str):
        if name.endswith("ies"): return name[:-3] + "y"
        if name.endswith("s") and not name.endswith("ss"): return name[:-1]
        return name

    cast_type = CLASS_MAP.get(category_name, "Element")
    clean_cat = category_name.replace("OST_", "")
    singular_cat = get_singular(clean_cat)
    
    all_filter_rules = []
    def collect_rules(group):
        for child in group["children"]:
            if child["type"] == "rule": all_filter_rules.append(child)
            else: collect_rules(child)
    collect_rules(root_group)

    # --- PASS 1: UNIQUE IDENTITY & NAME MAPPING ---
    property_map = {} 
    param_fields = []
    used_property_names = {} 

    for idx, rule in enumerate(all_filter_rules):
        unique_id = f"rule_{idx}" 
        raw_name = rule["name"]
        clean_name = raw_name.replace(" [", "_").replace("[", "_").replace("]", "").replace(" ", "")
        clean_name = re.sub(r'[^a-zA-Z0-9_]', '', clean_name)
        
        storage = rule["storage_type"]; unit = rule.get("unit")
        csharp_type = rule.get("revit_element_type") or "ElementId"
        is_revit_type = False
        attrs = []
        if unit: attrs.append(f'Unit("{unit}")')

        if storage == "Double": csharp_type = "double"
        elif storage == "Integer": 
            csharp_type = "int"
            if "Parameter" in raw_name: csharp_type = "BuiltInParameter"
            elif "Category" in raw_name: csharp_type = "BuiltInCategory"
        elif storage == "ElementId": 
            if csharp_type != "ElementId":
                is_revit_type = True
                if rule.get("builtin_name") == "ELEM_FAMILY_PARAM":
                    csharp_type = "Family"
                    attrs.append(f'RevitElements(Category = "{clean_cat}")')
                elif csharp_type in ["ElementType", "FamilySymbol"]:
                    if category_name in SYSTEM_TYPE_MAP:
                        csharp_type = SYSTEM_TYPE_MAP[category_name]
                    else:
                        csharp_type = "FamilySymbol"
                        attrs.append(f'RevitElements(Category = "{clean_cat}")')
                elif csharp_type in ["Element", "FamilyInstance", "SpatialElement"]:
                    attrs.append(f'RevitElements(Category = "{clean_cat}")')

        # V5 IDENTIFIER: Prefix generic names to avoid C# collisions
        if clean_name in GENERIC_NAMES or clean_name.lower() in ["type", "instance", "symbol", "family"]:
            base_prop_name = singular_cat + clean_name
        else:
            base_prop_name = clean_name
        
        final_name = base_prop_name
        if final_name in used_property_names:
            counter = used_property_names[final_name] + 1
            used_property_names[final_name] = counter
            final_name = f"{final_name}{counter}"
        else:
            used_property_names[final_name] = 1
            
        property_map[unique_id] = final_name
        
        attr_prefix = f"[{', '.join(attrs)}]\n    " if attrs else ""
        param_fields.append(f"/// Filter value for {rule['name']}")
        
        val = rule.get("value")
        has_val = val is not None and str(val).strip() != ""

        if is_revit_type:
            param_fields.append(f"{attr_prefix}public {csharp_type}? {final_name} {{ get; set; }}")
        else:
            actual_type = "string?" if storage == "String" else f"{csharp_type}?"
            if has_val:
                default_expr = f'"{val}"' if storage == "String" else (str(val).lower() if isinstance(val, bool) else str(val))
                param_fields.append(f"{attr_prefix}public {actual_type} {final_name} {{ get; set; }} = {default_expr};")
            else:
                param_fields.append(f"{attr_prefix}public {actual_type} {final_name} {{ get; set; }}")

    uses_get_param_id = False
    subgroup_counter = 0

    # --- PASS 2: LOGIC GENERATION ---
    def build_filter_logic(group, is_root=True, current_rule_idx=0):
        nonlocal uses_get_param_id, subgroup_counter
        lines = []
        logical_type = "LogicalAndFilter" if group["combinator"] == "AND" else "LogicalOrFilter"
        if is_root: list_var = f"{clean_cat.lower()}Filters"; result_var = f"final{clean_cat}Filter"
        else:
            subgroup_counter += 1
            list_var = f"subFilters{subgroup_counter}"; result_var = f"groupFilter{subgroup_counter}"
        
        lines.append(f"    List<ElementFilter> {list_var} = [];")
        
        rule_pointer = current_rule_idx
        for child in group["children"]:
            if child["type"] == 'group':
                inner_lines, inner_var, next_idx = build_filter_logic(child, is_root=False, current_rule_idx=rule_pointer)
                lines.extend(inner_lines)
                lines.append(f"    if ({inner_var} != null) {list_var}.Add({inner_var});")
                rule_pointer = next_idx
            else:
                uid = f"rule_{rule_pointer}"
                prop_id = property_map.get(uid)
                rule_pointer += 1
                
                storage = child["storage_type"]; op = child["operator"]
                if child.get("is_builtin") and child.get("builtin_id"):
                    b_name = child.get('builtin_name')
                    param_id = f"new ElementId(BuiltInParameter.{b_name})" if b_name and not b_name.isdigit() and "-" not in b_name else f"new ElementId((BuiltInParameter)({child['builtin_id']}))"
                else:
                    uses_get_param_id = True; param_id = f"GetParamId(Doc, \"{child['name']}\")"

                evaluator = "new FilterNumericEquals()"
                if op == ">": evaluator = "new FilterNumericGreater()"
                elif op == "<": evaluator = "new FilterNumericLess()"
                elif op == ">=": evaluator = "new FilterNumericGreaterOrEqual()"
                elif op == "<=": evaluator = "new FilterNumericLessOrEqual()"

                rule_obj = "null"; condition = "false"
                if storage == "Double":
                    condition = f"p.{prop_id}.HasValue"
                    rule_obj = f"new FilterDoubleRule(new ParameterValueProvider({param_id}), {evaluator}, p.{prop_id}.Value, 1e-6)"
                elif storage == "Integer":
                    condition = f"p.{prop_id}.HasValue"
                    rule_obj = f"new FilterIntegerRule(new ParameterValueProvider({param_id}), {evaluator}, (int)p.{prop_id}.Value)"
                elif storage == "ElementId":
                    revit_type = child.get("revit_element_type") or "ElementId"
                    is_family_obj = (child.get("builtin_name") == "ELEM_FAMILY_PARAM" and (revit_type == "Element" or revit_type == "Family")) or revit_type == "Family"
                    is_hydrated = revit_type != "ElementId"

                    if is_family_obj:
                        condition = f"p.{prop_id} != null"
                        rule_obj = f"new FilterStringRule(new ParameterValueProvider(new ElementId(BuiltInParameter.SYMBOL_FAMILY_NAME_PARAM)), new FilterStringEquals(), p.{prop_id}.Name)"
                        inverted = "true" if op == "!=" else "false"
                        lines.append(f"    if ({condition}) {list_var}.Add(new ElementParameterFilter({rule_obj}, {inverted}));")
                        rule_obj = "null"
                    elif is_hydrated:
                        condition = f"p.{prop_id} != null"
                        rule_obj = f"new FilterElementIdRule(new ParameterValueProvider({param_id}), {evaluator}, p.{prop_id}.Id)"
                    else:
                        condition = f"p.{prop_id} != null && p.{prop_id} != ElementId.InvalidElementId"
                        rule_obj = f"new FilterElementIdRule(new ParameterValueProvider({param_id}), {evaluator}, p.{prop_id})"
                elif storage == "String":
                    condition = f"!string.IsNullOrEmpty(p.{prop_id})"
                    str_eval = "new FilterStringEquals()"
                    if op == "Contains": str_eval = "new FilterStringContains()"
                    elif op == "Starts With": str_eval = "new FilterStringBeginsWith()"
                    elif op == "Ends With": str_eval = "new FilterStringEndsWith()"
                    rule_obj = f"new FilterStringRule(new ParameterValueProvider({param_id}), {str_eval}, p.{prop_id})"

                if rule_obj != "null":
                    if child.get("builtin_name") == "ELEM_FAMILY_PARAM" and (revit_type == "Family" or revit_type == "Element"):
                        val_expr = f"p.{prop_id}.Id" if is_hydrated else f"p.{prop_id}"
                        filter_expr = f"new FamilyInstanceFilter(Doc, {val_expr})"
                        if op == "!=": filter_expr = f"new LogicalNotFilter({filter_expr})"
                        lines.append(f"    if ({condition}) {list_var}.Add({filter_expr});")
                    else:
                        inverted = "true" if op == "!=" else "false"
                        lines.append(f"    if ({condition}) {list_var}.Add(new ElementParameterFilter({rule_obj}, {inverted}));")

        lines.append(f"    ElementFilter? {result_var} = {list_var}.Count > 0 ? ({list_var}.Count == 1 ? {list_var}[0] : new {logical_type}({list_var})) : null;")
        return lines, result_var, rule_pointer

    filter_construction_lines, final_filter_var, _ = build_filter_logic(root_group)
    
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
        if uid not in seen_col_ids: 
            seen_col_ids.add(uid)
            reporting_columns.append(col)

    for col in reporting_columns:
        raw_name = col["name"]; p_name = re.sub(r'\s+\[.*?\]$', '', raw_name)
        uid = f"{col.get('builtin_id') or col['name']}_{col.get('is_type')}"
        
        # C# Local Identifier (Unique)
        clean_id_name = p_name.replace(" ", "")
        clean_id_name = re.sub(r'[^a-zA-Z0-9]', '', clean_id_name)
        p_id = singular_cat + clean_id_name
        
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

    # V5: SMART HEADER PROJECTION
    # We map unique C# identifiers back to original Revit parameter names.
    # We only include the default "Name" column if the user hasn't explicitly added a "Name" parameter.
    has_explicit_name = any(re.sub(r'\s+\[.*?\]$', '', c["name"]) == "Name" for c in reporting_columns)
    
    projection_fields = ['            ["Id"] = el.Id.Value,']
    if not has_explicit_name:
        projection_fields.append('            ["Name"] = el.Name,')
        
    used_headers = {"Id", "Name"}
    for col in reporting_columns:
        header = col["name"]
        p_name = re.sub(r'\s+\[.*?\]$', '', header)
        clean_id_name = p_name.replace(" ", "")
        clean_id_name = re.sub(r'[^a-zA-Z0-9]', '', clean_id_name)
        p_id = singular_cat + clean_id_name
        
        # Deduplicate headers (e.g. Comments on Instance vs Comments on Type)
        final_header = header
        if final_header in used_headers and not (final_header == "Name" and has_explicit_name):
            final_header = f"{header} ({'Type' if col.get('is_type') else 'Instance'})"
        used_headers.add(final_header)
        
        projection_fields.append(f'            ["{final_header}"] = {p_id}Value,')

    logic_parts.extend([
        "", "        return (object)new Dictionary<string, object> {",
        "\n".join(projection_fields),
        "        };", "    })];", "    Table(results);", "}", "\n// 3. Helpers"
    ])

    helper = f"\nstatic ElementId GetParamId(Document doc, string name) {{ Element? first = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.{category_name}).WhereElementIsNotElementType().FirstElement(); return first?.LookupParameter(name)?.Id ?? ElementId.InvalidElementId; }}" if uses_get_param_id else ""
    return {
        "logic": "\n".join([l.rstrip() for l in logic_parts if l.strip() or l == ""]),
        "helpers": helper.strip(),
        "params": "    " + "\n    ".join([l.rstrip() for l in param_fields])
    }
