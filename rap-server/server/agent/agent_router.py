from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage
import uuid

from .simple_agent import agent_graph, AgentState # Use the new agent graph and state
from auth import get_current_user, CurrentUser

router = APIRouter()

class InvokeRequest(BaseModel):
    thread_id: str | None = None
    messages: list[dict]
    # These are not used by the simple agent, but we keep them for API compatibility
    workspace_path: str | None = None
    agent_scripts_path: str | None = None
    token: str
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key_name: str | None = None
    llm_api_key_value: str | None = None

@router.post("/agent/invoke")
async def invoke_agent(request: InvokeRequest, user: CurrentUser = Depends(get_current_user)):
    """
    This endpoint uses our new, simple agent for basic conversation.
    It establishes a clean baseline for testing performance and clarity.
    """
    thread_id = request.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # The simple agent only needs the message history.
    user_message_content = request.messages[-1]['content'] if request.messages else ""
    
    # The input to ainvoke is a dictionary containing the new message
    # and any other state values that need to be updated for this turn.
    inputs = {
        "messages": [HumanMessage(content=user_message_content)],
        "llm_provider": request.llm_provider,
        "llm_model": request.llm_model,
        "llm_api_key_name": request.llm_api_key_name,
        "llm_api_key_value": request.llm_api_key_value,
        "workspace_path": request.workspace_path,
        "agent_scripts_path": request.agent_scripts_path,
        "user_token": request.token,
    }

    try:
        # The checkpointer handles loading/saving the full message history.
        # The inputs provided here will be merged with the loaded state.
        final_state = await agent_graph.ainvoke(inputs, config=config)
        
    except Exception as e:
        print(f"Error invoking simple agent graph: {e}")
        return {
            "thread_id": thread_id,
            "new_messages": [AIMessage(content=f"An internal error occurred: {e}").dict()]
        }
        
    # Extract the last AIMessage from the result to send to the frontend.
    last_message = final_state.get("messages", [])[-1] if final_state.get("messages") else None
    response_messages = [last_message] if isinstance(last_message, AIMessage) else []

    return {
        "thread_id": thread_id,
        "new_messages": [msg.dict() for msg in response_messages]
    }