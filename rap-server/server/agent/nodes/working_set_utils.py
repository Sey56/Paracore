import re
import json
from typing import Tuple, List, Optional

def process_working_set_output(output_str: str, current_working_set: dict[str, List[int]]) -> Tuple[Optional[dict[str, List[int]]], Optional[str]]:
    """
    Parses a string to find a working_set_elements JSON blob.
    If found, it processes the operation and returns the new working set and a display message.
    
    Args:
        output_str: The string to parse (from a tool or script output).
        current_working_set: The agent's current working set (Category -> List[ID]).
        
    Returns:
        A tuple of (new_working_set, display_message).
        Returns (None, None) if the special JSON is not found or is invalid.
    """
    if not output_str or not isinstance(output_str, str):
        return None, None

    # Find the start of the JSON blob
    print(f"DEBUG: process_working_set_output called with length: {len(output_str)}")
    match = re.search(r'\{.*"paracore_output_type":\s*"working_set_elements"', output_str, re.DOTALL)
    if not match:
        print("DEBUG: No working_set_elements JSON found in output.")
        return None, None
    print("DEBUG: Found working_set_elements JSON match.")

    start_index = match.start()
    
    # Simple brace counting to find the end of the JSON object
    brace_count = 0
    json_string = ""
    found_start = False
    
    for i in range(start_index, len(output_str)):
        char = output_str[i]
        if char == '{':
            brace_count += 1
            found_start = True
        elif char == '}':
            brace_count -= 1
        
import re
import json
from typing import Tuple, List, Optional

def process_working_set_output(output_str: str, current_working_set: dict[str, List[int]]) -> Tuple[Optional[dict[str, List[int]]], Optional[str]]:
    """
    Parses a string to find one or more working_set_elements JSON blobs.
    If found, it processes the operations sequentially and returns the new working set and a display message.
    
    Args:
        output_str: The string to parse (from a tool or script output).
        current_working_set: The agent's current working set (Category -> List[ID]).
        
    Returns:
        A tuple of (new_working_set, display_message).
        Returns (None, None) if no special JSON is found or is invalid.
    """
    if not output_str or not isinstance(output_str, str):
        return None, None

    print(f"DEBUG: process_working_set_output called with length: {len(output_str)}")
    
    # Find all start indices of the JSON blob
    matches = [m.start() for m in re.finditer(r'\{.*"paracore_output_type":\s*"working_set_elements"', output_str, re.DOTALL)]
    
    if not matches:
        print("DEBUG: No working_set_elements JSON found in output.")
        return None, None
        
    print(f"DEBUG: Found {len(matches)} working_set_elements JSON match(es).")

    # Initialize working set for processing
    if current_working_set is None:
        working_set_state = {}
    elif isinstance(current_working_set, list):
        working_set_state = {"Unknown": current_working_set}
    else:
        working_set_state = current_working_set.copy()

    last_display_message = None
    processed_any = False

    for start_index in matches:
        # Simple brace counting to find the end of the JSON object
        brace_count = 0
        json_string = ""
        found_start = False
        
        for i in range(start_index, len(output_str)):
            char = output_str[i]
            if char == '{':
                brace_count += 1
                found_start = True
            elif char == '}':
                brace_count -= 1
            
            json_string += char
            
            if found_start and brace_count == 0:
                break
        
        if brace_count != 0:
            print(f"DEBUG: Brace count mismatch at index {start_index}: {brace_count}")
            continue
        
        print(f"DEBUG: Extracted JSON string: {json_string}")

        try:
            data = json.loads(json_string)
            print(f"DEBUG: Successfully parsed JSON data: {data.keys()}")
            
            processed_any = True
            last_display_message = data.get("display_message", "Working set updated.")
            operation = data.get("operation")
            
            # New structure: elements_by_category
            raw_elements_by_category = data.get("elements_by_category", {})
            elements_by_category = {}
            for cat, ids in raw_elements_by_category.items():
                # Ensure all IDs are integers
                elements_by_category[cat] = [int(eid) for eid in ids]
            
            # Legacy/Manual structure: element_ids
            element_ids = [int(eid) for eid in data.get("element_ids", [])]
            
            # Only assign to "Unknown" for add/replace operations if not present in elements_by_category
            if operation in ["add", "replace"] and element_ids:
                if "Unknown" not in elements_by_category:
                    elements_by_category["Unknown"] = []
                elements_by_category["Unknown"].extend(element_ids)

            if operation == "replace":
                working_set_state = elements_by_category
            elif operation == "add":
                for category, ids in elements_by_category.items():
                    if category not in working_set_state:
                        working_set_state[category] = []
                    # Add unique IDs
                    current_ids = set(working_set_state[category])
                    for eid in ids:
                        if eid not in current_ids:
                            working_set_state[category].append(eid)
                            current_ids.add(eid)
                            
            elif operation == "remove":
                for category, ids in elements_by_category.items():
                    if category in working_set_state:
                        working_set_state[category] = [eid for eid in working_set_state[category] if eid not in ids]
                        if not working_set_state[category]:
                            del working_set_state[category]
                
                # Also handle removal by ID if only IDs are provided (e.g. from tools)
                if element_ids:
                    ids_to_remove = set(element_ids)
                    for category in list(working_set_state.keys()):
                        working_set_state[category] = [eid for eid in working_set_state[category] if eid not in ids_to_remove]
                        if not working_set_state[category]:
                            del working_set_state[category]

            else: # "none" or invalid operation
                print(f"DEBUG: Invalid or 'none' operation: {operation}")
                
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            print(f"DEBUG: JSON parsing error: {e}")
            continue

    if not processed_any:
        return None, None

    print(f"DEBUG: Calculated final new_working_set: {working_set_state}")
    return working_set_state, last_display_message

def validate_working_set(working_set: dict[str, List[int]]) -> dict[str, List[int]]:
    """
    Validates the current working set against the active Revit document by running a dynamic script.
    Removes any element IDs that no longer exist in the document.
    """
    if not working_set:
        return {}

    all_ids = []
    for ids in working_set.values():
        all_ids.extend(ids)
    
    if not all_ids:
        return {}

    # Create a dynamic C# script to check for element existence
    # We use a simple script that iterates and checks doc.GetElement
    script_content = f"""
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

var idsToCheck = new List<long> {{ {', '.join(map(str, all_ids))} }};

return string.Join(",", validIds);
"""

    try:
        # Import from the root server package
        import sys
        import os
        # Ensure server directory is in path
        current_dir = os.path.dirname(os.path.abspath(__file__))
        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
        if server_dir not in sys.path:
            sys.path.append(server_dir)

        from grpc_client import execute_script
        print("DEBUG: Executing validation script...")
        result = execute_script(script_content, "{}")
        
        if result.get("is_success"):
            output = result.get("output", "")
            print(f"DEBUG: Validation script output: {output}")
            
            if not output:
                return {}
                
            valid_ids_set = set()
            try:
                # Output should be comma-separated string of IDs
                valid_ids_set = set(map(int, output.split(',')))
            except ValueError:
                print("DEBUG: Failed to parse validation output")
                return working_set # Fallback to original if parse fails

            # Reconstruct working set with only valid IDs
            new_working_set = {}
            for category, ids in working_set.items():
                valid_category_ids = [eid for eid in ids if eid in valid_ids_set]
                if valid_category_ids:
                    new_working_set[category] = valid_category_ids
            
            return new_working_set
        else:
            print(f"DEBUG: Validation script failed: {result.get('error_message')}")
            return working_set # Fallback
            
    except Exception as e:
        print(f"DEBUG: Validation failed with exception: {e}")
        return working_set # Fallback
