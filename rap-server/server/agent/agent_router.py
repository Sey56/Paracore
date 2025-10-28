from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
import uuid
import os

from .graph import app

router = APIRouter()

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str

class ResumeRequest(BaseModel):
    thread_id: str

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Initiates or continues a conversation with the agent."""
    thread_id = request.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    input_message = {"messages": [HumanMessage(content=request.message)]}
    
    response_chunks = []
    async for chunk in app.astream(input_message, config=config):
        response_chunks.append(chunk)

    final_response = response_chunks[-1]

    if "agent" in final_response:
        ai_message = final_response["agent"]["messages"][-1]
        return {
            "thread_id": thread_id,
            "status": "complete",
            "message": ai_message.content
        }
    elif "tools" in final_response:
        tool_call = final_response["tools"]["messages"][-1].tool_calls[0]
        return {
            "thread_id": thread_id,
            "status": "interrupted",
            "tool_call": {
                "name": tool_call["name"],
                "arguments": tool_call["args"]
            }
        }
    else:
        return {"thread_id": thread_id, "status": "error", "message": "Invalid agent response."}
@router.post("/agent/resume")
async def resume_agent_tool_call(request: ResumeRequest):
    """Resumes the agent's execution after a tool call has been approved by the user."""
    thread_id = request.thread_id
    config = {"configurable": {"thread_id": thread_id}}

    # Passing 'None' to astream tells the graph to continue from the last interruption.
    response_chunks = []
    async for chunk in app.astream(None, config=config):
        response_chunks.append(chunk)
    
    final_response = response_chunks[-1]

    if "agent" in final_response:
        ai_message = final_response["agent"]["messages"][-1]
        return {
            "thread_id": thread_id,
            "status": "complete",
            "message": ai_message.content
        }
    else:
        return {"thread_id": thread_id, "status": "error", "message": "Invalid agent response after resume."}
