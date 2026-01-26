from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
import os

from agent.prompt import SYSTEM_PROMPT

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    history: List[Dict[str, Any]] | None = None
    raw_history: str | None = None # Full JSON from PydanticAI for 100% metadata fidelity
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
    Operation Simple: V3 Solid Steel (PydanticAI Integration)
    """
    logger.info(f"[V3] Request (Model: {request.llm_model}, Provider: {request.llm_provider})")

    try:
        if not request.llm_api_key_value:
            raise HTTPException(status_code=400, detail="Missing API Key.")

        # 1. Setup Dependencies
        from agent.v3_agent import RevitDeps, run_v3_chat
        deps = RevitDeps(
            agent_scripts_path=request.agent_scripts_path,
            cloud_token=request.token
        )

        # 2. Reconstruct High-Fidelity History (The Steel Shield)
        from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, UserPromptPart, TextPart, ToolCallPart, ToolReturnPart
        from pydantic import TypeAdapter
        pydantic_history: List[ModelMessage] = []
        
        if request.raw_history:
            # OPTION A: Industrial Fidelity Restore
            try:
                raw_msgs = json.loads(request.raw_history)
                ta = TypeAdapter(List[ModelMessage])
                pydantic_history = ta.validate_python(raw_msgs)
                logger.info(f"[V3] Restored full high-fidelity chain ({len(pydantic_history)} msgs).")
            except Exception as e:
                logger.warning(f"[V3] Raw history restore failed: {e}")

        if not pydantic_history and request.history:
            # OPTION B: Manual Reconstruction (Fall-back/Turn 1)
            call_id_to_name = {}
            for h in request.history:
                m_type = h.get("type")
                content = h.get("content", "")
                text = " ".join([str(p.get("text", "")) if isinstance(p, dict) else str(p) for p in content]) if isinstance(content, list) else str(content)

                if m_type == "human":
                    pydantic_history.append(ModelRequest(parts=[UserPromptPart(content=text)]))
                elif m_type == "ai":
                    parts = []
                    if text: parts.append(TextPart(content=text))
                    if h.get("tool_calls"):
                        for tc in h["tool_calls"]:
                            t_name = tc["name"]
                            c_id = tc.get("id")
                            call_id_to_name[c_id] = t_name
                            parts.append(ToolCallPart(tool_name=t_name, args=tc.get("args") or tc.get("arguments"), tool_call_id=c_id))
                    if parts: pydantic_history.append(ModelResponse(parts=parts))
                elif m_type == "tool":
                    c_id = h.get("tool_call_id", "unknown")
                    t_name = call_id_to_name.get(c_id, "unknown")
                    pydantic_history.append(ModelRequest(parts=[ToolReturnPart(tool_name=t_name, content=text, tool_call_id=c_id)]))

        # 3. Invoke V3 Agent
        result = await run_v3_chat(
            message=request.message,
            history=pydantic_history,
            deps=deps,
            model_name=request.llm_model or "gemini-1.5-flash",
            api_key=request.llm_api_key_value,
            provider=request.llm_provider or "Google"
        )


        # 4. Process Result
        # confirmed: PydanticAI 1.47 uses '.output'
        final_message = result.output if isinstance(result.output, str) else "Processing complete."
        
        response_data = {
            "thread_id": request.thread_id or str(uuid.uuid4()),
            "status": "complete",
            "message": final_message,
            "tool_call": None,
            "active_script": None,
            "current_plan": None
        }

        # 5. Extract Tools for Sovereign Handoff
        if result.all_messages():
            from pydantic_ai.messages import ModelResponse, ToolCallPart
            for msg in result.all_messages():
                if isinstance(msg, ModelResponse):
                    for part in msg.parts:
                        if isinstance(part, ToolCallPart):
                            t_name = part.tool_name
                            t_args = part.args
                            
                            is_selection = t_name == "set_active_script"
                            is_run_call = t_name.startswith("run_") and t_name != "run_script_by_name"
                            
                            if is_selection or is_run_call:
                                response_data["status"] = "interrupted"
                                response_data["tool_call"] = {
                                    "id": part.tool_call_id or f"tc-{uuid.uuid4()}",
                                    "name": t_name,
                                    "arguments": t_args
                                }
                                s_id = t_args.get("script_id") if is_selection else t_name.replace("run_", "")
                                try:
                                    from agent.orchestrator.registry import ScriptRegistry
                                    registry = ScriptRegistry(request.agent_scripts_path)
                                    repo_script = registry.find_script_by_tool_id(s_id)
                                    if repo_script:
                                        active_script = json.loads(json.dumps(repo_script))
                                        active_script["id"] = s_id
                                        response_data["active_script"] = active_script
                                except: pass
                            
                            if t_name == "propose_automation_plan":
                                response_data["current_plan"] = t_args

        # 6. HIGH FIDELITY PERSISTENCE (The Memory Shield)
        # Use 'all_messages_json' to capture the entire chain including reasoning tokens
        try:
            response_data["raw_history_json"] = result.all_messages_json().decode('utf-8')
            logger.info(f"[V3] Finalizing turnaround: {len(result.all_messages())} messages preserved.")
        except Exception as e: 
            logger.warning(f"[V3] History preservation failed: {e}")

        return Response(content=json.dumps(response_data), media_type="application/json")

    except Exception as e:
        logger.exception(f"[V3] Global Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
