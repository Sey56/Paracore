from langchain_core.tools import tool

@tool
def run_script_by_name(script_name: str, is_final_approval: bool = False) -> str:
    """Executes a script in Revit by its name.
    - Use this tool to run any script requested by the user.
    - You must provide the exact name of the script.
    - `is_final_approval` should be set to `True` when the user has given final confirmation to execute the script.
    """
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def list_available_scripts(agent_scripts_path: str) -> str:
    """Lists all available scripts in the current workspace by fetching the script manifest."""
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def select_script_tool(script_name: str) -> str:
    """Selects a script by its name for further parameter inspection or execution.
    - Use this tool after the user has confirmed which script they want to use from a list of identified scripts.
    - Provide the exact name of the script to be selected.
    """
    # The actual implementation is orchestrated by the custom select_script_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def get_ui_parameters_tool() -> str:
    """Retrieves the current parameter values from the user interface.
    - Use this tool before running a script to ensure you have the latest parameter values that the user may have edited in the UI.
    """
    # This tool is handled by the frontend; the agent will pause and wait for the result.
    pass

tools = [run_script_by_name, list_available_scripts, select_script_tool, get_ui_parameters_tool]