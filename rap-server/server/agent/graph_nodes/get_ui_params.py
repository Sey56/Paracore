import json
from langchain_core.messages import ToolMessage
from ..state import AgentState
# No direct API helper call here, as this tool's result comes from the frontend

async def get_ui_params_node(state: AgentState) -> dict:
    """
    Executes the 'get_ui_parameters_tool'.
    This node acts as a trigger for the frontend to send the current UI parameters.
    The actual parameters will be received by the agent_node as a ToolMessage from the frontend.
    """
    print("--- get_ui_params_node called ---")
    results = []
    last_message = state["messages"][-1]

    # This node is primarily a signal to the frontend.
    # The frontend will respond with a ToolMessage containing the UI parameters.
    # The agent_node will then process that ToolMessage.
    
    # For now, we just return a success message. The actual parameters will be in the subsequent ToolMessage.
    results.append(ToolMessage(content=json.dumps({"status": "triggered_ui_param_fetch", "is_success": True}), tool_call_id=last_message.tool_calls[0]['id']))
    
    # The agent_node will handle the merging and setting of final_parameters_for_execution
    # after receiving the ToolMessage from the frontend.
    state['next_conversational_action'] = None # Clear, agent_node will decide next based on incoming ToolMessage

    return {"messages": results, "next_conversational_action": state['next_conversational_action']}