import json
import logging
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

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
    agent_scripts_path: str | None = None
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
        from agent.v4_repl_agent import v4_repl_agent, AgentDeps, InterruptedException
        deps = AgentDeps(
            user_id=request.token or "unknown",
            thread_id=request.thread_id or "unknown"
        )

        # 2. Reconstruct High-Fidelity History (The Steel Shield)
        from pydantic import TypeAdapter
        from pydantic_ai.messages import (
            ModelMessage, ModelRequest, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart
        )
        pydantic_history: List[ModelMessage] = []

        if request.raw_history:
            try:
                raw_msgs = json.loads(request.raw_history)
                ta = TypeAdapter(List[ModelMessage])
                pydantic_history = ta.validate_python(raw_msgs)
                logger.info(f"[V4] Restored full high-fidelity chain ({len(pydantic_history)} msgs).")
            except Exception as e:
                logger.warning(f"[V4] Raw history restore failed: {e}")

        if not pydantic_history and request.history:
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
                    
                    # --- THE SHIELD LAYER ---
                    # If this is a return from our super tool, truncate it to protect context window
                    if t_name == "execute_dynamic_query" and len(text) > 1000:
                        try:
                            # Try to parse it as JSON to give a smart summary
                            data = json.loads(text)
                            if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                                text = f"Execution successful. Returned a {data.get('type', 'table')} with {len(data['data'])} rows. Tell the user to view the full result in the UI."
                            else:
                                text = f"Execution successful. Output was very large ({len(text)} chars) and has been truncated. Tell the user to check the UI."
                        except:
                            text = f"Execution successful. Output truncated due to size ({len(text)} chars)."
                            
                    pydantic_history.append(ModelRequest(parts=[ToolReturnPart(tool_name=t_name, content=text, tool_call_id=c_id)]))

        # --- THE PROTOCOL SHIELD ---
        # If raw_history ended with a ToolCallPart, we MUST supply a ToolReturnPart BEFORE the next user message,
        # or else strict providers (like OpenAI/Google API) will crash with 400 Bad Request.
        if pydantic_history and isinstance(pydantic_history[-1], ModelResponse):
            last_msg = pydantic_history[-1]
            for part in last_msg.parts:
                if isinstance(part, ToolCallPart):
                    # We inject a dummy return part. The actual context the LLM needs is in request.message anyway.
                    pydantic_history.append(ModelRequest(parts=[ToolReturnPart(tool_name=part.tool_name, content="Execution output provided in next system message.", tool_call_id=part.tool_call_id)]))

        # 3. Invoke V4 Agent
        response_data = {
            "thread_id": request.thread_id or str(uuid.uuid4()),
            "status": "complete",
            "message": "",
            "tool_call": None,
            "raw_history_json": None
        }

        try:
            # Industrial Model Factory
            model_name = request.llm_model or 'gemini-1.5-flash'
            api_key = request.llm_api_key_value
            provider = request.llm_provider or "Google"
            p_lower = provider.lower()
            
            import os
            model = None
            if p_lower == "google":
                os.environ["GOOGLE_API_KEY"] = api_key
                from pydantic_ai.models.google import GoogleModel
                model = GoogleModel(model_name)
            elif p_lower == "openrouter" or "openai" in p_lower:
                os.environ["OPENAI_API_KEY"] = api_key
                from pydantic_ai.models.openai import OpenAIModel
                from pydantic_ai.providers.openai import OpenAIProvider

                # In PydanticAI 1.47, configuration belongs to the Provider
                if p_lower == "openrouter":
                    provider_obj = OpenAIProvider(
                        base_url="https://openrouter.ai/api/v1",
                        api_key=api_key
                    )
                    model = OpenAIModel(model_name, provider=provider_obj)
                else: # plain openai
                    provider_obj = OpenAIProvider(api_key=api_key)
                    model = OpenAIModel(model_name, provider=provider_obj)
            else:
                model = model_name

            from pydantic_ai.settings import ModelSettings
            result = await v4_repl_agent.run(
                request.message,
                message_history=pydantic_history,
                deps=deps,
                model=model,
                model_settings=ModelSettings(max_tokens=2048)
            )
            
            response_data["message"] = str(result.output) if isinstance(result.output, str) else "Processing complete."
            
            try:
                raw_json = result.all_messages_json()
                response_data["raw_history_json"] = raw_json.decode('utf-8') if isinstance(raw_json, bytes) else str(raw_json)
                logger.info(f"[V4] Finalizing turnaround: history preserved.")
            except Exception as e:
                logger.warning(f"[V4] History preservation failed: {e}")

        except InterruptedException as e:
            # SOVEREIGN HANDOFF: The agent called execute_dynamic_query. 
            # We catch it here and send it to the frontend for human approval.
            response_data["status"] = "interrupted"
            
            call_id = f"tc-{uuid.uuid4()}"
            response_data["tool_call"] = {
                "id": call_id,
                "name": "execute_dynamic_query",
                "arguments": {
                    "csharp_code": e.csharp_code,
                    "justification": e.justification
                }
            }
            
            # Since the run crashed, PydanticAI threw away the LLM's tool call.
            # We aggressively save the ToolCall inside raw_history_json so the next turn remembers!
            try:
                # Add the aborted ToolCall to the history so it resumes smoothly
                pydantic_history.append(ModelRequest(parts=[UserPromptPart(content=request.message)]))
                pydantic_history.append(ModelResponse(parts=[ToolCallPart(tool_name="execute_dynamic_query", args=response_data["tool_call"]["arguments"], tool_call_id=call_id)]))
                
                from pydantic import TypeAdapter
                ta = TypeAdapter(List[ModelMessage])
                response_data["raw_history_json"] = ta.dump_json(pydantic_history).decode('utf-8')
            except Exception as dump_err:
                logger.warning(f"[V4] Failed to capture pre-handoff history: {dump_err}")

        except Exception as run_err:
            from pydantic_ai.exceptions import ModelHTTPError
            if isinstance(run_err, ModelHTTPError) and run_err.status_code == 503:
                logger.warning(f"[V4] Caught 503 High Demand Error from Google GenAI API.")
                response_data["status"] = "complete"
                response_data["message"] = "SYSTEM ALERT: Google's free Gemini API is currently experiencing a massive global traffic spike (HTTP 503: Service Unavailable). \n\nYour code and request are perfectly fine, but Google's physical servers are rejecting free-tier requests right now. \n\n**Solutions:**\n1. Wait 5-10 minutes and try again.\n2. Go to Settings -> LLM Configuration and switch your provider to OpenRouter or Deepseek to bypass Google's network entirely."
            elif isinstance(run_err, ModelHTTPError) and run_err.status_code == 404:
                response_data["status"] = "complete"
                response_data["message"] = f"SYSTEM ALERT: The model you selected '{model_name}' was not found (HTTP 404). Please go to Settings and ensure you are using the correct string (e.g., `gemini-3-flash-preview`)."
            else:
                logger.exception(f"[V4] Agent Run Error: {run_err}")
                raise

        return Response(content=json.dumps(response_data), media_type="application/json")

    except Exception as e:
        logger.exception(f"[V4] Global Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
