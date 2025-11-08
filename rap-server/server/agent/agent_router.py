from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
import uuid
import os
import json
import traceback

from .graph import app

from auth import get_current_user, CurrentUser
import corescript_pb2
import corescript_pb2_grpc
import grpc
from google.protobuf.json_format import MessageToDict

router = APIRouter()

class ScriptManifestRequest(BaseModel):
    agent_scripts_path: str

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    workspace_path: str | None = None
    agent_scripts_path: str | None = None
    token: str # Add token to the request
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key_name: str | None = None
    llm_api_key_value: str | None = None

class ResumeRequest(BaseModel):
    thread_id: str
    token: str # Add token to the request
    workspace_path: str | None = None # Add workspace_path
    agent_scripts_path: str | None = None # Add agent_scripts_path
    tool_result: str | None = None # Add tool_result for UI parameters
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key_name: str | None = None
    llm_api_key_value: str | None = None

@router.post("/agent/script_manifest")
async def get_script_manifest(request: ScriptManifestRequest):
    """Fetches the script manifest from the RServer C# backend."""
    try:
        with grpc.insecure_channel('localhost:50052') as channel:
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(channel)
            grpc_request = corescript_pb2.GetScriptManifestRequest(agent_scripts_path=request.agent_scripts_path)
            
            response = stub.GetScriptManifest(grpc_request)

            if response.error_message:
                raise HTTPException(status_code=500, detail=f"RServer failed to get manifest: {response.error_message}")

            # Convert the protobuf message to a dictionary for JSON response
            response_dict = MessageToDict(response, preserving_proto_field_name=True)
            return response_dict

    except grpc.RpcError as e:
        # Handle cases where the gRPC server is unavailable or throws an error
        raise HTTPException(status_code=503, detail=f"Failed to connect to RServer: {e.details()}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Initiates or continues a conversation with the agent."""
    try:
        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        # Explicitly update the state with context
        app.update_state(config, {
            "workspace_path": request.workspace_path or "",
            "agent_scripts_path": request.agent_scripts_path or "",
            "user_token": request.token,
            "llm_provider": request.llm_provider,
            "llm_model": request.llm_model,
            "llm_api_key_name": request.llm_api_key_name,
            "llm_api_key_value": request.llm_api_key_value,
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
                script_info_from_state = last_message.additional_kwargs['selected_script_info']
                
                # Retrieve the full manifest from the agent's state (now from file)
                current_state = app.get_state(config)
                agent_scripts_path = current_state.values.get('agent_scripts_path')
                manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
                
                manifest = []
                if os.path.exists(manifest_path):
                    with open(manifest_path, 'r', encoding='utf-8') as f:
                        manifest = json.load(f)
                else:
                    print(f"Warning: Manifest file not found at {manifest_path} when trying to get full script object.")

                full_script_object = next(
                    (s for s in manifest if s.get('absolutePath') == script_info_from_state['absolutePath']),
                    None
                )

                if full_script_object:
                    print(f"agent_router: full_script_object found in manifest: {full_script_object}")
                    response_data['selected_script_info'] = full_script_object
                else:
                    # Fallback to partial info if full script not found in manifest (should not happen if flow is correct)
                    print(f"agent_router: full_script_object NOT found in manifest, falling back to partial info: {script_info_from_state}")
                    response_data['selected_script_info'] = {
                        "id": script_info_from_state['absolutePath'],
                        "absolutePath": script_info_from_state['absolutePath'],
                        "type": script_info_from_state['type']
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
        "agent_scripts_path": request.agent_scripts_path or "", # Add agent_scripts_path
        "user_token": request.token,
        "llm_provider": request.llm_provider,
        "llm_model": request.llm_model,
        "llm_api_key_name": request.llm_api_key_name,
        "llm_api_key_value": request.llm_api_key_value,
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
