from fastapi import APIRouter, Body, HTTPException, Response # Ensure Response is here
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json
import traceback

from .graph import get_app
from .state import AgentState
from .tools import search_scripts_tool
router = APIRouter()

# Add this helper function (copied from previous version)
def serialize_message(message):
    if isinstance(message, (HumanMessage, AIMessage, ToolMessage)):
        # Langchain messages have a .dict() method for serialization
        return message.dict()
    return message

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    token: str # Change from user_token to token
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None
    agent_scripts_path: str # Path to the agent's dedicated script workspace (tools_library path)
    user_edited_parameters: dict | None = None
    execution_summary: dict | None = None # New field for the summary
    raw_output_for_summary: dict | None = None # New field for small raw outputs

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """
    Initiates or continues a conversation with the agent, allowing the agent
    to run to completion without interruption.
    """
    try:
        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        app_instance = get_app()

        # Determine if this is the first message in the thread
        current_state = app_instance.get_state(config)
        is_new_thread = not current_state or not current_state.values.get("messages")

        # Prepare the input for the graph - ONLY the new message
        input_message = HumanMessage(content=request.message)

        # Update the state with configuration parameters and current_task_description
        # This is done *before* ainvoke, and the checkpointer will merge it.
        config_update = {
            "user_token": request.token,
            "llm_provider": request.llm_provider,
            "llm_model": request.llm_model,
            "llm_api_key_name": request.llm_api_key_name,
            "llm_api_key_value": request.llm_api_key_value,
            "agent_scripts_path": request.agent_scripts_path,
            "ui_parameters": request.user_edited_parameters,
            "execution_summary": request.execution_summary, # Pass summary to state
        }
        if is_new_thread:
            config_update["current_task_description"] = request.message
        
        # The `ainvoke` call should receive the new message and any state updates.
        final_state = await app_instance.ainvoke({
            "messages": [input_message],
            "user_token": request.token,
            "llm_provider": request.llm_provider,
            "llm_model": request.llm_model,
            "llm_api_key_name": request.llm_api_key_name,
            "llm_api_key_value": request.llm_api_key_value,
            "agent_scripts_path": request.agent_scripts_path,
            "ui_parameters": request.user_edited_parameters,
            "execution_summary": request.execution_summary,
            "raw_output_for_summary": request.raw_output_for_summary,
            "current_task_description": request.message if is_new_thread else None,
        }, config)

        # The agent's final response is the last message in the state
        last_message = final_state.get('messages', [])[-1]

        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            # This is a tool call, likely for the HITL modal
            tool_call = last_message.tool_calls[0]
            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "interrupted", # Signal to frontend to handle the tool call
                "message": None,
                "tool_call": {
                    "name": tool_call['name'],
                    "arguments": tool_call['args']
                },
                "active_script": final_state.get('selected_script_metadata')
            }), media_type="application/json")

        elif isinstance(last_message, AIMessage) and not last_message.tool_calls:
            # This is a standard conversational response
            active_script_metadata = None
            if final_state.get('next_conversational_action') == "confirm_execution" and final_state.get('selected_script_metadata'):
                active_script_metadata = final_state.get('selected_script_metadata')

            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "complete",
                "message": last_message.content,
                "tool_call": None,
                "active_script": active_script_metadata
            }), media_type="application/json")

        else:
            # Handle other unexpected cases
            print(f"agent_router: WARNING: Graph ended in an unexpected state. Last message: {last_message}")
            raise ValueError("Agent did not produce a final answer or a valid tool call.")

    except Exception as e:
        print(f"An error occurred: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
