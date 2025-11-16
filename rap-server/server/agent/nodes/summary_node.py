import json
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END

from ..state import AgentState
from .utils import get_llm

def summary_node(state: AgentState):
    script_execution_result = state.get('script_execution_result')

    if not script_execution_result:
        return {"messages": [AIMessage(content="Error: No script execution result found.")], "next_conversational_action": END}

    if script_execution_result.get("is_success"):
        response_content = "The script ran successfully. See the Console and Table tabs for the full output."
    else:
        response_content = f"The script failed: {script_execution_result.get('error_message', 'Unknown error')}. See the Console tab for details."

    return {
        "messages": [AIMessage(content=response_content)],
        "next_conversational_action": END # Signal to end the conversation
    }
