from langchain_core.messages import AIMessage

from ..state import AgentState
from ..tools import get_script_parameters_tool, set_active_script_tool

def get_parameters_node(state: AgentState):
    selected_script = state.get('selected_script_metadata')
    user_token = state.get('user_token')
    if not selected_script or not user_token:
        return {"messages": [AIMessage(content="Error: Script not selected or user not authenticated.")]}
    parameters = get_script_parameters_tool.invoke({
        "script_path": selected_script.get('absolutePath'),
        "script_type": selected_script.get('type'),
    })
    import uuid
    
    # Construct a tool call message so the frontend sees it and updates the UI
    tool_call = {
        "name": "set_active_script_tool",
        "args": {"script_metadata": selected_script},
        "id": f"tool_call_{uuid.uuid4()}"
    }
    
    return {
        "messages": [AIMessage(content="", tool_calls=[tool_call])],
        "script_parameters_definitions": parameters,
        "next_conversational_action": "present_parameters"
    }
