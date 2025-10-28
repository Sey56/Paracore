import json
from langchain_core.tools import tool
from .. import grpc_client

@tool
def execute_revit_script(script_content: str, parameters: dict) -> str:
    """Executes a C# script in Revit and returns the result.
    
    Args:
        script_content: The full C# code of the script to execute.
        parameters: A dictionary of parameters to pass to the script.
        
    Returns:
        A JSON string containing the execution result, including success status, output, and any errors.
    """ 
    try:
        parameters_json = json.dumps(parameters)
        result = grpc_client.execute_script(script_content, parameters_json)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({"is_success": False, "error_message": f"Failed to execute script: {str(e)}"})
