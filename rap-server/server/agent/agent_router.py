from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json
import traceback

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
    workspace_path: str | None = None # Add workspace_path
    tool_result: str | None = None # Add tool_result for UI parameters

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
            response_data = {
                "thread_id": thread_id,
                "status": "complete",
                "message": last_message.content
            }
            if last_message.additional_kwargs.get('selected_script_info'):
                script_info = last_message.additional_kwargs['selected_script_info']
                response_data['tool_call'] = {
                    "name": "set_active_script_source_tool",
                    "arguments": {
                        "absolutePath": script_info['absolutePath'],
                        "type": script_info['type']
                    }
                }
            return response_data
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

def _process_agent_response(thread_id: str, final_response: dict):
    last_message = final_response.get('messages', [])[-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
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
        return {
            "thread_id": thread_id,
            "status": "complete",
            "message": last_message.content
        }
    elif isinstance(last_message, ToolMessage):
        return {"thread_id": thread_id, "status": "processing_internal"}
    else:
        return {"thread_id": thread_id, "status": "error", "message": "Invalid agent response after resume."}

@router.post("/agent/resume")
async def resume_agent_tool_call(request: ResumeRequest):
    """Resumes the agent's execution after a tool call has been approved by the user."""
    thread_id = request.thread_id
    config = {"configurable": {"thread_id": thread_id}}

    # Update state before resuming
    app.update_state(config, {
        "workspace_path": request.workspace_path or "",
        "user_token": request.token
    })

    if request.tool_result:
        # Get the last state to find the tool_call_id
        last_state = app.get_state(config)
        last_ai_message = next((msg for msg in reversed(last_state.values.get('messages', [])) if isinstance(msg, AIMessage) and msg.tool_calls), None)
        
        if last_ai_message:
            tool_call_id = last_ai_message.tool_calls[0]['id']
            tool_message = ToolMessage(content=request.tool_result, tool_call_id=tool_call_id)
            final_response = await app.ainvoke({"messages": [tool_message]}, config=config)
            return _process_agent_response(thread_id, final_response)
        else:
            # Handle the case where no pending tool call was found
            return {"thread_id": thread_id, "status": "error", "message": "No pending tool call found to resume with result."}
    else:
        # Original flow for HITL approval (no tool result)
        final_response = await app.ainvoke(None, config=config)
        return _process_agent_response(thread_id, final_response)
