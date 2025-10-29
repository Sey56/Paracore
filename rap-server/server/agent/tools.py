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
    """Lists all available scripts in the current workspace."""
    # The actual implementation is orchestrated by the custom tool_node in the graph.
    # This function is just a definition for the LLM.
    pass


