import json
from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..api_helpers import handle_get_script_parameters
from .select_script import select_script_node # We can reuse the logic

async def select_and_get_params_node(state: AgentState) -> dict:
    """
    Chains two mandatory tool calls together to improve performance.
    This node first performs the logic of selecting a script (updating the UI
    and state) and then immediately fetches its parameters in the same step.
    This avoids an unnecessary round-trip to the agent LLM.
    """
    print("--- select_and_get_params_node called ---")
    
    # --- Part 1: Execute select_script_tool logic ---
    # We can call the logic from the original node directly.
    # Note: This is a simplified approach. A more robust implementation might
    # refactor the core logic of select_script_node into a helper function.
    selection_result = await select_script_node(state)
    
    # Check if the selection was successful before proceeding
    if "error" in selection_result.get("messages", [{}])[0].content:
        print("--- Error during script selection part, aborting parameter fetch ---")
        return selection_result

    print("--- Script selection successful, proceeding to get parameters ---")

    # --- Part 2: Execute get_script_parameters_tool logic ---
    last_message = state["messages"][-1] # The AIMessage that called select_script_tool
    tool_call_id = last_message.tool_calls[0]['id'] if last_message.tool_calls else ""
    
    selected_script_metadata = state.get('selected_script_metadata')
    if not selected_script_metadata:
        error_msg = "Logic error: Script was selected but metadata not found in state."
        return {"messages": [ToolMessage(content=json.dumps({"error": error_msg}), tool_call_id=tool_call_id)]}

    script_name = selected_script_metadata.get("name")
    script_type = selected_script_metadata.get("type")
    script_path = selected_script_metadata.get("absolutePath")

    param_result_content = await handle_get_script_parameters(
        state, 
        {"script_name": script_name, "script_type": script_type, "script_path": script_path}
    )
    
    # Update state with the parameters
    if param_result_content.get("is_success"):
        state['script_parameters_definitions'] = param_result_content.get("parameters", [])
        state['next_conversational_action'] = "present_parameters"
    else:
        state['script_parameters_definitions'] = None
        state['next_conversational_action'] = "handle_error"

    # We return a single ToolMessage that represents the outcome of the whole chain.
    # The content can be the parameter result.
    return {
        "script_parameters_definitions": state['script_parameters_definitions'],
        "next_conversational_action": state['next_conversational_action'],
        "messages": [
            ToolMessage(
                content=json.dumps(param_result_content), 
                tool_call_id=tool_call_id
            )
        ]
    }
