from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json
import traceback

from .graph import app
from .state import AgentState # Import AgentState

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
    agent_scripts_path: str | None # Path to the agent's dedicated script workspace (tools_library path)

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Initiates or continues a conversation with the agent."""
    try:
        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        # Get the current state for the thread
        current_state = app.get_state(config)
        is_new_thread = not current_state.values.get("messages")

        # Prepare the state update
        state_update = {
            "messages": [HumanMessage(content=request.message)],
            "user_token": request.token,
            "llm_provider": request.llm_provider,
            "llm_model": request.llm_model,
            "llm_api_key_name": request.llm_api_key_name,
            "llm_api_key_value": request.llm_api_key_value,
            "agent_scripts_path": request.agent_scripts_path
        }        
        # Always update the state with the latest context from the request
        app.update_state(config, state_update)

        # Invoke the agent with the new message
        # For a new thread, we set current_task_description
        if is_new_thread:
            app.update_state(config, {"current_task_description": request.message})
        
        final_response = await app.ainvoke(input=state_update, config=config)

        if not isinstance(final_response, dict):
            print(f"agent_router: WARNING: app.ainvoke returned unexpected type: {type(final_response)}. Value: {final_response}")
            raise ValueError(f"Agent invocation returned unexpected response type: {type(final_response)}")

        # Create a serializable version of final_response for logging
        serializable_final_response = final_response.copy()
        if 'messages' in serializable_final_response and isinstance(serializable_final_response['messages'], list):
            serializable_final_response['messages'] = [serialize_message(msg) for msg in serializable_final_response['messages']]

        print(f"agent_router: app.ainvoke final_response: {json.dumps(serializable_final_response, indent=2)}")

        # The agent's response is the last message in the state
        try:
            last_message = final_response.get('messages', [])[-1]
        except IndexError:
            print(f"agent_router: WARNING: final_response['messages'] is empty. final_response: {json.dumps(serializable_final_response, indent=2)}")
            raise ValueError("Agent invocation returned an empty message list.")

        # Get the final state to check for conversational actions or tool calls
        final_state = app.get_state(config)
        next_conversational_action = final_state.values.get("next_conversational_action")

        # --- Handle conversational responses ---
        if isinstance(last_message, AIMessage) and not last_message.tool_calls:
            # If the LLM generated a conversational message without tool calls
            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "complete",
                "message": last_message.content,
                "tool_call": None
            }), media_type="application/json")
        
        # --- Handle tool calls ---
        elif isinstance(last_message, AIMessage) and last_message.tool_calls:
            tool_call = last_message.tool_calls[0] # Assuming one tool call per message for now
            
            # If it's list_available_scripts, we need to summarize the results
            if tool_call["name"] == "list_available_scripts":
                scripts_for_choice = final_state.values.get("identified_scripts_for_choice", [])
                if scripts_for_choice:
                    script_summary = "I found the following scripts:\n"
                    for script in scripts_for_choice:
                        script_summary += f"- **{script.get('name', 'Unknown')}**: {script.get('metadata', {}).get('description', 'No description available.')}\n"
                    
                    # Update the agent's state to indicate a conversational action is needed
                    app.update_state(config, {"next_conversational_action": "ask_for_script_confirmation"})
                    
                    return Response(content=json.dumps({
                        "thread_id": thread_id,
                        "status": "complete",
                        "message": script_summary,
                        "tool_call": None
                    }), media_type="application/json")
                else:
                    app.update_state(config, {"next_conversational_action": "handle_error"})
                    return Response(content=json.dumps({
                        "thread_id": thread_id,
                        "status": "complete",
                        "message": "I couldn't find any scripts in the specified path.",
                        "tool_call": None
                    }), media_type="application/json")
            
            # For any other tool call, it's an interruption for the frontend
            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "interrupted",
                "tool_call": {
                    "name": tool_call["name"],
                    "arguments": tool_call["args"]
                }
            }), media_type="application/json")

        # --- Handle ToolMessage results ---
        elif isinstance(last_message, ToolMessage):
            # After a tool executes, the agent_node will be invoked again to process the result.
            # For now, we'll just return a generic message, the LLM will generate the actual response.
            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "processing_internal", # Indicate that the agent is still processing
                "message": "Tool executed. Agent is processing the result...",
                "tool_call": None
            }), media_type="application/json")

        # --- Handle other unexpected messages ---
        else:
            print(f"agent_router: WARNING: Unexpected last message type: {type(last_message)}. Content: {last_message}")
            return Response(content=json.dumps({
                "thread_id": thread_id,
                "status": "error",
                "message": "Agent returned an unexpected message type.",
                "tool_call": None
            }), media_type="application/json", status_code=500)

    except Exception as e:
        print(f"An error occurred: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))