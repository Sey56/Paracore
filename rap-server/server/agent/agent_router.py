from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_openai import ChatOpenAI
import uuid
import json
import logging
from typing import List, Dict, Any, Optional

from agent.tools import get_tools
from agent.prompt import SYSTEM_PROMPT

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    history: List[Dict[str, Any]] | None = None # NEW: Full message history
    token: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key_name: str | None = None
    llm_api_key_value: str | None = None
    agent_scripts_path: str
    user_edited_parameters: dict | None = None
    tool_call_id: str | None = None
    tool_output: str | None = None
    raw_output_for_summary: dict | None = None

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """
    Operation Simple: Pure stateless chat with tools.
    """
    logger.info(f"[OperationSimple] Received request (Thread: {request.thread_id})")

    try:
        # 1. Initialize LLM
        if not request.llm_api_key_value:
            raise HTTPException(status_code=400, detail="Missing API Key.")

        if request.llm_provider == "openai":
            llm = ChatOpenAI(model=request.llm_model, api_key=request.llm_api_key_value, temperature=0.1)
        else:
            # Fallback for OpenRouter/Generic
            llm = ChatOpenAI(model=request.llm_model, api_key=request.llm_api_key_value, base_url="https://openrouter.ai/api/v1", temperature=0.1)

        # 2. Get Tools (Local + MCP)
        tools = await get_tools({"agent_scripts_path": request.agent_scripts_path})
        llm_with_tools = llm.bind_tools(tools)

        # 3. Construct Message History
        # We trust the UI to send the relevant history (Operation Simple)
        messages = [AIMessage(content=SYSTEM_PROMPT, additional_kwargs={"role": "system"})]
        
        # Add history if provided
        if request.history:
              for h in request.history:
                  if h["type"] == "human":
                      messages.append(HumanMessage(content=h["content"]))
                  elif h["type"] == "ai":
                      # Reconstruct AI message with tool calls if present
                      tc_list = []
                      if h.get("tool_calls"):
                          for tc in h["tool_calls"]:
                              tc_list.append({
                                  "id": tc.get("id"),
                                  "name": tc["name"],
                                  "args": tc.get("args") or tc.get("arguments")
                              })
                      messages.append(AIMessage(content=h["content"], tool_calls=tc_list))
                  elif h["type"] == "tool":
                      messages.append(ToolMessage(content=h["content"], tool_call_id=h["tool_call_id"]))
        
        # Prepare incoming message
        if request.tool_call_id:
            # First, check if this tool ID is already in the history (Safety check)
            history_ids = [m.tool_call_id for m in messages if isinstance(m, ToolMessage)]
            if request.tool_call_id not in history_ids:
                messages.append(ToolMessage(content=request.tool_output or "Tool executed.", tool_call_id=request.tool_call_id))
        else:
            msg_content = request.message
            if request.raw_output_for_summary:
                msg_content = f"[EXECUTION RESULT]\n{json.dumps(request.raw_output_for_summary)}\n\nUser Question: {request.message}"
            
            # If history is empty and this is a new request, append the human message
            if not request.history or (messages[-1].content != msg_content):
                messages.append(HumanMessage(content=msg_content))

        # 4. Invoke LLM
        response = await llm_with_tools.ainvoke(messages)

        # 5. Format Response with Identity Anchor
        response_data = {
            "thread_id": request.thread_id or str(uuid.uuid4()),
            "status": "complete",
            "message": response.content,
            "tool_call": None,
            "active_script": None
        }

        # RESOLVE ACTIVE SCRIPT (Identity Anchor)
        # If the AI mentioned any script tool, we resolve its metadata immediately
        # to ensure the UI can "Force Select" it even if folder-desynced.
        active_script = None
        target_tool = None
        
        if response.tool_calls:
            target_tool = response.tool_calls[0]
            t_name = target_tool["name"]
            
            # Extract tool_id from set_active_script or run_<id>
            s_id = None
            if t_name == "set_active_script":
                s_id = target_tool["args"].get("script_id")
            elif t_name.startswith("run_"):
                s_id = t_name.replace("run_", "")
            
            if s_id:
                try:
                    from agent.orchestrator.registry import ScriptRegistry
                    registry = ScriptRegistry(request.agent_scripts_path)
                    repo_script = registry.find_script_by_tool_id(s_id)
                    if repo_script:
                        active_script = json.loads(json.dumps(repo_script))
                        active_script["id"] = s_id # Ensure ID parity
                        logger.info(f"[OperationSimple] Anchored identity for {s_id}")
                except:
                    pass

        if target_tool:
            response_data["status"] = "interrupted"
            response_data["tool_call"] = {
                "id": target_tool.get("id"),
                "name": target_tool["name"],
                "arguments": target_tool["args"]
            }
        
        if active_script:
            response_data["active_script"] = active_script

        return Response(content=json.dumps(response_data), media_type="application/json")

    except Exception as e:
        logger.exception(f"[OperationSimple] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
