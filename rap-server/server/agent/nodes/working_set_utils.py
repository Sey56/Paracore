import re
import json
from typing import Tuple, List, Optional

def process_working_set_output(output_str: str, current_working_set: List[int]) -> Tuple[Optional[List[int]], Optional[str]]:
    """
    Parses a string to find a working_set_elements JSON blob.
    If found, it processes the operation and returns the new working set and a display message.
    
    Args:
        output_str: The string to parse (from a tool or script output).
        current_working_set: The agent's current list of element IDs.
        
    Returns:
        A tuple of (new_working_set, display_message).
        Returns (None, None) if the special JSON is not found or is invalid.
    """
    if not output_str or not isinstance(output_str, str):
        return None, None

    json_match = re.search(r'\{.*"paracore_output_type":\s*"working_set_elements".*?\}', output_str, re.DOTALL)
    
    if not json_match:
        return None, None

    json_string = json_match.group(0)
    
    try:
        data = json.loads(json_string)
        
        display_message = data.get("display_message", "Working set updated.")
        operation = data.get("operation")
        element_ids = [int(eid) for eid in data.get("element_ids", [])]

        if operation == "replace":
            new_working_set = element_ids
        elif operation == "add":
            new_working_set = list(set(current_working_set + element_ids))
        elif operation == "remove":
            new_working_set = [item for item in current_working_set if item not in element_ids]
        else: # "none" or invalid operation
            return current_working_set, display_message # Return current set and message

        return new_working_set, display_message

    except (json.JSONDecodeError, TypeError, ValueError):
        return None, None
