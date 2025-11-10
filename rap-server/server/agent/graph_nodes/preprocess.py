from ..state import AgentState # Corrected import path
from langchain_core.messages import HumanMessage

async def preprocess_node(state: AgentState) -> dict:
    """
    This node runs before the main agent logic to preprocess the user's request.
    It extracts the user's task description from the last HumanMessage and
    populates 'current_task_description' in the state.
    This ensures the agent has the necessary context before it acts.
    """
    print("--- preprocess_node called ---")
    
    task_description = ""
    if "messages" in state and state["messages"]:
        # Iterate backwards to find the most recent HumanMessage
        for message in reversed(state["messages"]):
            if isinstance(message, HumanMessage):
                task_description = message.content
                break
    
    print(f"--- Preprocess found task: {task_description} ---")
    
    return {
        "current_task_description": task_description
    }