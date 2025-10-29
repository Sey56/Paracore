from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json

from .graph import app

from ..auth import get_current_user, CurrentUser

router = APIRouter()

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    workspace_path: str | None = None
    token: str # Add token to the request

class ResumeRequest(BaseModel):
    thread_id: str
    token: str # Add token to the request

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Initiates or continues a conversation with the agent."""
    try:
        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        # Explicitly update the state with context
        app.update_state(config, {
            "workspace_path": request.workspace_path or "",
            "user_token": request.token
        })
        
        if request.message == "INTERNAL_CONTINUE_PROCESSING":
            # This is an internal message to continue processing, do not add to history
            input_message = None # Do not add to history
            final_response = await app.ainvoke(None, config=config) # Re-invoke to get next step
        else:
            input_message = {"messages": [HumanMessage(content=request.message)]}
            final_response = await app.ainvoke(input_message, config=config)

        # The agent's response is the last message in the state
        last_message = final_response.get('messages', [])[-1]

        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            # The agent (LLM) decided to call a tool and is awaiting human approval
            tool_call = last_message.tool_calls[0]
            return {
                "thread_id": thread_id,
                "status": "interrupted",
                "tool_call": {
                    "name": tool_call["name"],
                    "arguments": tool_call["args"]
                }
            }
        elif isinstance(last_message, AIMessage):
            # It's a final answer from the agent (LLM)
            return {
                "thread_id": thread_id,
                "status": "complete",
                "message": last_message.content
            }
        elif isinstance(last_message, HumanMessage) and last_message.content == "INTERRUPT_FOR_APPROVAL":
            # This is a forced interruption for HITL approval
            # The actual tool call is in the previous AIMessage
            tool_call = final_response.get('messages', [])[-2].tool_calls[0]
            return {
                "thread_id": thread_id,
                "status": "interrupted",
                "tool_call": {
                    "name": tool_call["name"],
                    "arguments": tool_call["args"]
                }
            }
        elif isinstance(last_message, HumanMessage):
            # This is a HumanMessage returned by agent_node (e.g., asking for parameters)
            return {
                "thread_id": thread_id,
                "status": "complete", # Treat as complete for now, frontend will display it
                "message": last_message.content
            }
        elif isinstance(last_message, ToolMessage):
            # This is a ToolMessage returned by tool_node (e.g., result of get_script_parameters_tool)
            # The agent should continue processing internally, so we return a special status
            return {"thread_id": thread_id, "status": "processing_internal"}
        else:
            return {"thread_id": thread_id, "status": "error", "message": "Invalid agent response."}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise

@router.post("/agent/resume")
async def resume_agent_tool_call(request: ResumeRequest):
    """Resumes the agent's execution after a tool call has been approved by the user."""
    thread_id = request.thread_id
    config = {"configurable": {"thread_id": thread_id}}

    # Passing 'None' to ainvoke tells the graph to continue from the last interruption.
    final_response = await app.ainvoke(None, config=config)

    # The agent's response is the last message in the state
    last_message = final_response.get('messages', [])[-1]

    if last_message and isinstance(last_message, AIMessage):
        # It's a final answer from the agent
        return {
            "thread_id": thread_id,
            "status": "complete",
            "message": last_message.content
        }
    else:
        return {"thread_id": thread_id, "status": "error", "message": "Invalid agent response after resume."}