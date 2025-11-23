import os
import glob
import grpc
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import List

# Local imports
from grpc_client import get_script_parameters
from utils import resolve_script_path


class SearchScriptsArgs(BaseModel):
    query: str = Field(..., description="The user's task description or query to find relevant scripts.")
    agent_scripts_path: str = Field(..., description="The absolute path to the directory containing agent scripts.")

@tool(args_schema=SearchScriptsArgs)
def search_scripts_tool(query: str, agent_scripts_path: str) -> list:
    """
    Searches for relevant C# Revit automation scripts based on a user query within the specified agent scripts path.
    """
    from .api_helpers import read_local_script_manifest
    full_manifest = read_local_script_manifest(agent_scripts_path=agent_scripts_path)
    return full_manifest

class GetScriptParametersArgs(BaseModel):
    script_path: str = Field(..., description="The absolute path of the script for which to retrieve parameters.")
    script_type: str = Field(..., description="The type of the script, e.g., 'single-file' or 'multi-file'.")

@tool(args_schema=GetScriptParametersArgs)
def get_script_parameters_tool(script_path: str, script_type: str) -> list:
    """
    Retrieves the UI parameters for a specified C# Revit script by reading the script
    file(s) and calling the gRPC service directly.
    """
    try:
        absolute_path = resolve_script_path(script_path)
        
        # Auto-detect type to be robust against agent errors
        script_files = []
        if os.path.isdir(absolute_path):
            files = glob.glob(os.path.join(absolute_path, "*.cs"))
            for file_path in files:
                try:
                    with open(file_path, 'r', encoding='utf-8-sig') as f:
                        source_code = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            source_code = f.read()
                    except Exception:
                        continue
                except Exception:
                    continue
                script_files.append({"file_name": os.path.basename(file_path), "content": source_code})
        
        elif os.path.isfile(absolute_path):
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        
        else:
            return []
        
        if not script_files:
            return []

        response = get_script_parameters(script_files)
        return response.get("parameters", [])
        
    except (FileNotFoundError, grpc.RpcError, Exception) as e:
        print(f"DEBUG: get_script_parameters_tool failed: {e}")
        import traceback
        traceback.print_exc()
        return []

class SetActiveScriptArgs(BaseModel):
    script_metadata: dict = Field(..., description="The full metadata object of the script to be set as active in the UI.")

@tool(args_schema=SetActiveScriptArgs)
def set_active_script_tool(script_metadata: dict) -> str:
    """
    Informs the frontend to set a specific script as the 'active' or 'selected' one.
    This allows the UI, like the ScriptInspector, to update and display the correct script information.
    This tool does not return a value, it only triggers a side effect in the UI.
    """
    return f"Successfully signaled UI to set {script_metadata.get('name')} as the active script."

class RunScriptByNameArgs(BaseModel):
    script_name: str = Field(..., description="The name of the script to run.")
    parameters: dict = Field(..., description="A dictionary of parameter names and their values.")
    is_final_approval: bool = Field(False, description="A flag to indicate if this is the final approval step before execution.")

@tool(args_schema=RunScriptByNameArgs)
def run_script_by_name(script_name: str, parameters: dict, is_final_approval: bool = False) -> dict:
    """
    Executes a C# Revit script by its name with the provided parameters.
    This tool should only be called when the user has confirmed all parameters and is ready to run the script.
    """
    # This tool is primarily for triggering the HITL modal in the frontend.
    # The actual execution happens when the user approves the modal.
    # We return a dictionary that can be interpreted by the frontend.
    return {
        "tool": "run_script_by_name",
        "script_name": script_name,
        "parameters": parameters,
        "is_final_approval": is_final_approval
    }

# --- Working Set Management Tools ---

@tool
def clear_working_set() -> str:
    """
    Clears the current working set of elements. Use this when the user wants to start fresh.
    """
    import json
    return json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "replace",
        "elements_by_category": {},
        "display_message": "Working set has been cleared."
    })

class SetWorkingSetArgs(BaseModel):
    element_ids: List[int] = Field(default=[], description="NOT RECOMMENDED. List of element IDs (will be categorized as 'Unknown'). Use 'elements_by_category' instead.")
    elements_by_category: dict = Field(default={}, description="PREFERRED. Dictionary of category names to lists of element IDs (e.g., {'Walls': [1, 2]}).")
    reason: str = Field(..., description="A brief, user-facing explanation for why the working set is being changed.")

@tool(args_schema=SetWorkingSetArgs)
def set_working_set(element_ids: List[int] = [], elements_by_category: dict = {}, reason: str = "") -> str:
    """
    Replaces the current working set with a new set of elements.
    ALWAYS use 'elements_by_category' to maintain category information. Using 'element_ids' will result in 'Unknown' categories.
    """
    import json
    return json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "replace",
        "element_ids": element_ids,
        "elements_by_category": elements_by_category,
        "display_message": reason
    })

class AddToWorkingSetArgs(BaseModel):
    element_ids: List[int] = Field(default=[], description="NOT RECOMMENDED. List of element IDs (will be categorized as 'Unknown'). Use 'elements_by_category' instead.")
    elements_by_category: dict = Field(default={}, description="PREFERRED. Dictionary of category names to lists of element IDs (e.g., {'Walls': [1, 2]}).")
    reason: str = Field(..., description="A brief, user-facing explanation for why the elements are being added.")

@tool(args_schema=AddToWorkingSetArgs)
def add_to_working_set(element_ids: List[int] = [], elements_by_category: dict = {}, reason: str = "") -> str:
    """
    Adds elements to the current working set, ensuring no duplicates.
    ALWAYS use 'elements_by_category' to maintain category information. Using 'element_ids' will result in 'Unknown' categories.
    """
    import json
    return json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "add",
        "element_ids": element_ids,
        "elements_by_category": elements_by_category,
        "display_message": reason
    })

class RemoveFromWorkingSetArgs(BaseModel):
    element_ids: List[int] = Field(default=[], description="The list of element IDs to remove from the current working set.")
    elements_by_category: dict = Field(default={}, description="Dictionary of category names to lists of element IDs to remove.")
    reason: str = Field(..., description="A brief, user-facing explanation for why the elements are being removed.")

@tool(args_schema=RemoveFromWorkingSetArgs)
def remove_from_working_set(element_ids: List[int] = [], elements_by_category: dict = {}, reason: str = "") -> str:
    """
    Removes elements from the current working set.
    """
    import json
    return json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "remove",
        "element_ids": element_ids,
        "elements_by_category": elements_by_category,
        "display_message": reason
    })

@tool
def get_working_set_details() -> str:
    """
    Retrieves the details of the current working set, such as the element IDs it contains.
    Use this tool if the user asks what is in the working set or asks for the IDs of the current elements.
    """
    # The implementation of this tool is handled directly in the tool_node
    # as it needs access to the agent's state.
    pass


@tool
def get_revit_context_tool() -> dict:
    """
    Retrieves the current Revit context, including the active view name, the number of selected elements,
    their IDs, and project information.
    Use this tool when the user asks about the current selection or the active view.
    """
    print("DEBUG: get_revit_context_tool called")
    from grpc_client import get_context
    try:
        context = get_context()
        
        # Pre-calculate elements_by_category for the agent's convenience
        elements_by_category = {}
        if context.get("selected_elements"):
            for item in context["selected_elements"]:
                cat = item.get("category", "Unknown")
                eid = item.get("id")
                if cat not in elements_by_category:
                    elements_by_category[cat] = []
                elements_by_category[cat].append(eid)
        
        context["elements_by_category"] = elements_by_category
        
        # print(f"DEBUG: get_context returned: {context}")
        return context
    except Exception as e:
        print(f"DEBUG: get_revit_context_tool failed with error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


tools = [
    search_scripts_tool, 
    get_script_parameters_tool, 
    set_active_script_tool, 
    run_script_by_name,
    clear_working_set,
    set_working_set,
    add_to_working_set,
    remove_from_working_set,
    get_working_set_details,
    get_revit_context_tool
]
