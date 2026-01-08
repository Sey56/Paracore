from fastapi import APIRouter, Body, HTTPException, Response
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json
import traceback
from typing import List
import logging

from .graph import get_app
from .state import AgentState
from .tools import search_scripts_tool
from .summary_utils import generate_summary

router = APIRouter()

# Add this helper function
def serialize_message(message):
    if isinstance(message, (HumanMessage, AIMessage, ToolMessage)):
        return message.dict()
    return message

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    token: str
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None
    agent_scripts_path: str
    user_edited_parameters: dict | None = None
    execution_summary: dict | None = None
    raw_output_for_summary: dict | None = None

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """
    Initiates or continues a conversation with the agent.
    """
    logging.info(f"[agent_router] Received chat request: {request.message}")
    
    try:
        # Pre-flight check for LLM configuration
        if not request.llm_provider or not request.llm_model or not request.llm_api_key_value:
            logging.error(f"[agent_router] Missing LLM configuration: Provider={request.llm_provider}, Model={request.llm_model}, APIKeyPresent={bool(request.llm_api_key_value)}")
            raise HTTPException(status_code=400, detail="LLM configuration (Provider, Model, or API Key) is missing. Please check your settings.")

        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        logging.info(f"[agent_router] Initializing graph for thread: {thread_id}")
        # Await the async get_app to ensure DB connection is ready
        app_instance = await get_app()

        # Use aget_state for async checkpointer
        current_state = await app_instance.aget_state(config)
        is_new_thread = not current_state or not current_state.values.get("messages")

        # Prepare the input for the graph - ONLY the new message
        input_message = HumanMessage(content=request.message)

        # Generate summary from raw_output_for_summary if present
        generated_summary = None
        if request.raw_output_for_summary:
            logging.info(f"[agent_router] Generating execution summary for script output.")
            generated_summary = generate_summary(request.raw_output_for_summary)
        
        logging.info(f"[agent_router] Invoking agent graph...")
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
            "execution_summary": generated_summary,
            "raw_output_for_summary": request.raw_output_for_summary,
            "current_task_description": request.message if is_new_thread else None,
        }, config)

        logging.info(f"[agent_router] Graph invocation complete.")

        # The agent's final response is the last message in the state
        last_message = final_state.get('messages', [])[-1]

        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            # This is a tool call, likely for the HITL modal
            tool_call = last_message.tool_calls[0]
            logging.info(f"[agent_router] Agent requested tool: {tool_call['name']}")
            
            # --- Start Parameter Formatting for HITL Display ---
            if tool_call['name'] == 'run_script_by_name' and 'parameters' in tool_call['args']:
                formatted_args = tool_call['args'].copy()
                params = formatted_args.get('parameters', {})
                
                for key, value in params.items():
                    if isinstance(value, str):
                        try:
                            # Check if the string is a JSON array
                            if value.strip().startswith('[') and value.strip().endswith(']'):
                                parsed_list = json.loads(value)
                                if isinstance(parsed_list, list):
                                    # Reformat as a simple comma-separated string for display
                                    params[key] = ', '.join(map(str, parsed_list))
                        except (json.JSONDecodeError, TypeError):
                            # Not a valid JSON array string, leave it as is
                            pass
                formatted_args['parameters'] = params
                tool_call['args'] = formatted_args
            # --- End Parameter Formatting ---

            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "interrupted",
                "message": None,
                "tool_call": {
                    "name": tool_call['name'],
                    "arguments": tool_call['args']
                },
                "active_script": final_state.get('selected_script_metadata'),
                "working_set": final_state.get('working_set')
            }), media_type="application/json")

        elif isinstance(last_message, AIMessage) and not last_message.tool_calls:
            # This is a standard conversational response
            logging.info(f"[agent_router] Standard conversational response generated.")
            active_script_metadata = final_state.get('selected_script_metadata')

            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "complete",
                "message": last_message.content,
                "tool_call": None,
                "active_script": active_script_metadata,
                "working_set": final_state.get('working_set')
            }), media_type="application/json")

        else:
            # Handle other unexpected cases
            logging.warning(f"[agent_router] WARNING: Graph ended in an unexpected state. Last message: {last_message}")
            raise ValueError("Agent did not produce a final answer or a valid tool call.")

    except Exception as e:
        logging.exception(f"[agent_router] CRITICAL ERROR during agent chat processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))