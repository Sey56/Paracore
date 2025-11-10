import json
from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..api_helpers import handle_get_script_parameters

async def get_params_node(state: AgentState) -> dict:
    """
    Executes the 'get_script_parameters_tool'.
    This node retrieves the parameter definitions for a selected script
    and returns them as a ToolMessage to the agent.
    """
    print("--- get_params_node called ---")
    results = []
    last_message = state["messages"][-1]
    
    selected_script_metadata = state.get('selected_script_metadata')
    if not selected_script_metadata:
        error_msg = "No script metadata found in state for parameter retrieval."
        results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id="get_params_error"))
        state['script_selected_for_params'] = None
        state['selected_script_metadata'] = None
        state['next_conversational_action'] = "handle_error"
        return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "next_conversational_action": state['next_conversational_action']}

    for tool_call in last_message.tool_calls: 
        script_name = selected_script_metadata.get("name") # Use name from stored metadata
        script_type = selected_script_metadata.get("type")
        script_path = selected_script_metadata.get("absolutePath")

        if not script_name or not script_type or not script_path:
            error_msg = "Incomplete script metadata found in state for parameter retrieval."
            results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id=tool_call["id"]))
            state['script_selected_for_params'] = None
            state['selected_script_metadata'] = None
            state['next_conversational_action'] = "handle_error"
            return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "next_conversational_action": state['next_conversational_action']}

        print(f"--- get_params_node processing script: {script_name} ---")
        result_content = await handle_get_script_parameters(
            state, 
            {"script_name": script_name, "script_type": script_type, "script_path": script_path} # Pass necessary info
        )
        results.append(ToolMessage(content=json.dumps(result_content), tool_call_id=tool_call["id"]))
        
        if result_content.get("is_success"):
            state['script_parameters_definitions'] = result_content.get("parameters", [])
            state['next_conversational_action'] = "present_parameters"
        else:
            state['script_parameters_definitions'] = None
            state['next_conversational_action'] = "handle_error"

        # Clear the state variables after parameters have been retrieved
        state['script_selected_for_params'] = None
        state['selected_script_metadata'] = None
        print(f"--- State updated: script_selected_for_params and selected_script_metadata cleared ---")

    return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "script_parameters_definitions": state['script_parameters_definitions'], "next_conversational_action": state['next_conversational_action']}
