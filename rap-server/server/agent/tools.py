from langchain_core.tools import tool

@tool
def run_script_by_name(script_name: str, parameters: dict = {}) -> str:
    """Executes a script in Revit by its name.
    - Use this tool to run any script requested by the user.
    - You must provide the exact name of the script.
    """
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def get_script_parameters_tool(script_name: str, script_type: str) -> str:
    """Retrieves the parameters for a specific script by its name and type.
    - Use this tool to understand what inputs a script requires before running it.
    - Provide the exact name of the script and its type ('single-file' or 'multi-file').
    """
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def list_available_scripts() -> str:
    """Lists all available automation scripts that can be run in Revit.
    - Use this tool to discover what scripts are available.
    - The tool returns a detailed manifest containing a list of scripts, each with metadata like name, description, categories, and usage examples.
    """
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass

@tool
def get_ui_parameters_tool() -> str:
    """Retrieves the current parameter values from the user interface.
    - Use this tool before running a script to ensure you have the latest parameter values that the user may have edited in the UI.
    """
    # This tool is handled by the frontend; the agent will pause and wait for the result.
    pass

tools = [run_script_by_name, get_script_parameters_tool, list_available_scripts, get_ui_parameters_tool]


