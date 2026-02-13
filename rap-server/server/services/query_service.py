from typing import List, Dict, Any
import re

def generate_query_code(category_name: str, rules: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Generates C# code for a FilteredElementCollector and the corresponding Params class.
    """
    
    # 1. Clean up category name
    clean_cat = category_name.replace("OST_", "")
    if clean_cat.endswith("s"):
        cast_type = clean_cat[:-1]
    else:
        cast_type = "Element"

    params_lines = []
    filter_conditions = []
    
    for i, rule in enumerate(rules):
        # Use actual parameter name for better readability
        param_name_raw = rule["name"].replace(" ", "")
        prop_id = f"{param_name_raw}"
        storage = rule["storage_type"]
        op = rule["operator"]
        val = rule["value"]
        unit = rule.get("unit")
        
        # --- Params Generation ---
        attr = ""
        if unit:
            attr = f'[Unit("{unit}")]\\n    '
        
        csharp_type = "string"
        if storage == "Double": csharp_type = "double"
        elif storage == "Integer": csharp_type = "int"
        elif storage == "ElementId": 
            csharp_type = rule.get("revit_element_type") or "ElementId"
        
        default_val = f'"{val}"' if isinstance(val, str) else str(val)
        if isinstance(val, bool): default_val = str(val).lower()
        if storage == "ElementId" and csharp_type != "ElementId":
            default_val = "null"
        
        params_lines.append(f"{attr}public {csharp_type} {prop_id} {{ get; set; }} = {default_val};")
        
        # --- LINQ Logic Generation ---
        if rule.get("is_builtin") and rule.get("builtin_id"):
            # Use fully qualified name to avoid ambiguity and ensure correct casting
            getter = f"el.get_Parameter((Autodesk.Revit.DB.BuiltInParameter)({rule['builtin_id']}))"
        else:
            getter = f'el.LookupParameter("{rule["name"]}")'

        condition = "false"
        if storage == "Double":
            condition = f"p{i} != null && p{i}.AsDouble() {op} p.{prop_id}"
        elif storage == "Integer":
            condition = f"p{i} != null && p{i}.AsInteger() {op} p.{prop_id}"
        elif storage == "ElementId":
            if csharp_type != "ElementId":
                # For hydrated objects (Level, Material, etc.), compare against .Id
                condition = f"p{i} != null && p.{prop_id} != null && p{i}.AsElementId() == p.{prop_id}.Id"
            else:
                condition = f"p{i} != null && p{i}.AsElementId().Value == p.{prop_id}.Value"
        elif storage == "String":
            if op == "==": condition = f'p{i} != null && p{i}.AsString() == p.{prop_id}'
            elif op == "Contains": condition = f'p{i} != null && (p{i}.AsString()?.Contains(p.{prop_id}) ?? false)'
            elif op == "Starts With": condition = f'p{i} != null && (p{i}.AsString()?.StartsWith(p.{prop_id}) ?? false)'
            elif op == "Ends With": condition = f'p{i} != null && (p{i}.AsString()?.EndsWith(p.{prop_id}) ?? false)'
            else: condition = f'p{i} != null && p{i}.AsString() {op} p.{prop_id}'
        
        filter_conditions.append((i, getter, condition))

    logic_parts = []
    logic_parts.append(f"var elements = new FilteredElementCollector(Doc)")
    logic_parts.append(f"    .OfCategory(BuiltInCategory.{category_name})")
    logic_parts.append(f"    .WhereElementIsNotElementType()")
    logic_parts.append(f"    .Cast<{cast_type}>()")
    logic_parts.append(f"    .Where(el => {{")
    
    for idx, getter, cond in filter_conditions:
        logic_parts.append(f"        var p{idx} = {getter};")
        logic_parts.append(f"        bool r{idx} = {cond};")
    
    result_line = " && ".join([f"r{idx}" for idx in range(len(rules))])
    logic_parts.append(f"        return {result_line};")
    logic_parts.append(f"    }}).ToList();")

    return {
        "logic": "\n".join(logic_parts),
        "params": "\n    ".join(params_lines)
    }
