import dataclasses
import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from mcp_core.context_manager import StatusHeader, TurnTracker, SHIELD_TOOL_RETURN_AT_CHARS, build_status_augmented_message

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, TypeAdapter
from pydantic_ai.messages import (
    ModelMessage, ModelRequest, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Models
# ═══════════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    history: List[Dict[str, Any]] | None = None
    raw_history: str | None = None  # Full JSON from PydanticAI for metadata fidelity
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


# ═══════════════════════════════════════════════════════════════════════════════
# Helper Functions (extracted from chat_with_agent to keep it focused)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_llm_model(provider: str, model_name: str, api_key: str):
    """Construct a PydanticAI model instance from provider/model/api_key.

    Extracted from chat_with_agent to keep model creation self-contained.
    """
    import os

    p_lower = provider.lower()

    if p_lower == "google":
        os.environ["GOOGLE_API_KEY"] = api_key
        from pydantic_ai.models.google import GoogleModel
        return GoogleModel(model_name)

    elif p_lower == "openrouter" or "openai" in p_lower:
        os.environ["OPENAI_API_KEY"] = api_key
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider
        if p_lower == "openrouter":
            provider_obj = OpenAIProvider(
                base_url="https://openrouter.ai/api/v1", api_key=api_key
            )
        else:
            provider_obj = OpenAIProvider(api_key=api_key)
        return OpenAIModel(model_name, provider=provider_obj)

    elif p_lower == "deepseek":
        os.environ["DEEPSEEK_API_KEY"] = api_key
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider
        provider_obj = OpenAIProvider(
            base_url="https://api.deepseek.com", api_key=api_key
        )
        return OpenAIModel(model_name, provider=provider_obj)

    # Fallback: pass the model name string directly (PydanticAI will try to resolve)
    return model_name


def _reconstruct_history(
    raw_history: str | None,
    history: List[Dict[str, Any]] | None,
) -> List[ModelMessage]:
    """Reconstruct PydanticAI high-fidelity message history.

    Prefers raw_history (full PydanticAI JSON) when available. Falls back
    to legacy history dict list. Also applies the Protocol Shield: if the
    last message ends with a ToolCallPart without a ToolReturnPart, a dummy
    return is injected to satisfy strict providers like OpenAI/Google.
    """
    pydantic_history: List[ModelMessage] = []

    # Try raw history first (highest fidelity)
    if raw_history:
        try:
            raw_msgs = json.loads(raw_history)
            ta = TypeAdapter(List[ModelMessage])
            pydantic_history = ta.validate_python(raw_msgs)
            logger.info(f"[V4] Restored full high-fidelity chain ({len(pydantic_history)} msgs).")
        except Exception as e:
            logger.warning(f"[V4] Raw history restore failed: {e}")

    # Fall back to legacy history dict list
    if not pydantic_history and history:
        call_id_to_name = {}
        for h in history:
            m_type = h.get("type")
            content = h.get("content", "")
            if isinstance(content, list):
                text = " ".join([
                    str(p.get("text", "")) if isinstance(p, dict) else str(p)
                    for p in content
                ])
            else:
                text = str(content)

            if m_type == "human":
                pydantic_history.append(ModelRequest(parts=[UserPromptPart(content=text)]))
            elif m_type == "ai":
                parts = []
                if text:
                    parts.append(TextPart(content=text))
                if h.get("tool_calls"):
                    for tc in h["tool_calls"]:
                        t_name = tc["name"]
                        c_id = tc.get("id")
                        call_id_to_name[c_id] = t_name
                        parts.append(ToolCallPart(
                            tool_name=t_name,
                            args=tc.get("args") or tc.get("arguments"),
                            tool_call_id=c_id,
                        ))
                if parts:
                    pydantic_history.append(ModelResponse(parts=parts))
            elif m_type == "tool":
                c_id = h.get("tool_call_id", "unknown")
                t_name = call_id_to_name.get(c_id, "unknown")

                # Truncate large tool returns to protect context window
                from mcp_core.summarizer import shield_tool_return
                if len(text) > 500:
                    text = shield_tool_return(text, t_name)

                pydantic_history.append(ModelRequest(parts=[
                    ToolReturnPart(tool_name=t_name, content=text, tool_call_id=c_id)
                ]))

    # ── Protocol Shield ──
    # If last message has ToolCallPart without ToolReturnPart, inject a dummy
    # so strict providers (OpenAI, Google) don't crash with HTTP 400.
    from mcp_core.context_manager import inject_protocol_shield
    inject_protocol_shield(pydantic_history)

    return pydantic_history


def _extract_csharp_from_history(pydantic_history: list) -> str:
    """Extract the most recent execute_dynamic_query C# code from agent history."""
    for msg in reversed(pydantic_history):
        parts = getattr(msg, 'parts', [])
        for p in reversed(parts):
            if hasattr(p, 'tool_name') and getattr(p, 'tool_name', '') == 'execute_dynamic_query':
                args = getattr(p, 'args', None)
                if isinstance(args, dict):
                    return args.get('csharp_code', '')
                try:
                    args_dict = json.loads(str(args)) if isinstance(args, str) else args
                    if isinstance(args_dict, dict):
                        return args_dict.get('csharp_code', '')
                except Exception:
                    pass
    return ''


async def _run_conversational_summary(
    summary_text: str,
    deps,
    model,
    user_query: str = "",
    csharp_code: str = "",
) -> str:
    """Use the LLM to produce a contextual one-sentence response that connects
    the user's query to the execution result, using the user's own terminology.

    Falls back to template logic if the LLM call fails.
    """
    # ── Chart result — template is always correct and fast ──
    if "CHART" in summary_text or "Analytics tab" in summary_text:
        return summary_text

    if not user_query:
        if "GetElements returned 0 elements" in summary_text:
            return "No matching elements found in the document."
        if "no output was produced" in summary_text.lower():
            return "The query returned no results — the document may not contain any matching elements."
        if "no results" in summary_text.lower():
            return "No matching elements found in the document."
        return summary_text

    # ── Use LLM for contextual response ──
    code_context = f'\nThe executed C# code was:\n```csharp\n{csharp_code}\n```\n' if csharp_code else ''
    prompt = (
        f'The user asked: "{user_query}"\n'
        f'{code_context}'
        f"Result summary: {summary_text}\n\n"
        f"Summarize what was found. Be specific.\n"
        f"If the result has 3+ values or rows, use bold labels on separate lines, like **Name:** value.\n"
        f"For a single value or count, one sentence is fine.\n"
        f'CRITICAL: If the result says "GetElements returned 0 elements", '
        f'look at the C# code to find what element type was queried (e.g. '
        f'GetElements("Rooms") means rooms). Say "No [that element type] '
        f'found in the document." — NOT a paraphrase of the user query.\n'
        f'Use the exact element type from the CODE or query. Never say '
        f'"items", "elements", or paraphrase the entire user request.\n'
        f"If a chart/image was produced, say so and mention the Analytics tab."
    )

    try:
        from pydantic_ai import Agent as PydanticAgent
        from pydantic_ai.usage import RunUsage
        summary_bot = PydanticAgent(
            model=model,
            system_prompt=(
                "You write concise summaries of code execution results. When listing 3+ values, use bold labels on separate lines. "
                "Always use the exact terminology from the user's query. "
                "Never use generic terms like 'items', 'elements', or 'objects'. "
                "Never mention internal details like 'Group', 'Count', or column names."
            ),
        )
        summary_usage = RunUsage()
        result = await summary_bot.run(prompt, usage=summary_usage)
        # Accumulate summary usage into deps so both agent + summary tokens are tracked
        try:
            deps.turn_usage.incr(summary_usage)
        except Exception:
            pass
        return str(result.output).strip()
    except Exception:
        logger.exception("LLM conversational summary failed, using fallback.")
        if "no output was produced" in summary_text.lower():
            return "The query returned no results — the document may not contain any matching elements."
        if "no results" in summary_text.lower():
            return "No matching elements found in the document."
        return summary_text


def _build_sovereign_handoff(
    e,
    request_message: str,
    pydantic_history: List[ModelMessage],
) -> dict:
    """Build the sovereign-handoff tool_call response dict + update history.

    When the agent calls execute_dynamic_query, this captures the ToolCall
    in raw_history_json so the next turn resumes smoothly.
    """
    import html
    csharp_code = e.csharp_code
    # Fix HTML-encoded angle brackets some LLMs emit
    csharp_code = (
        csharp_code.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&#60;", "<")
        .replace("&#62;", ">")
    )

    call_id = f"tc-{uuid.uuid4()}"
    tool_call = {
        "id": call_id,
        "name": "execute_dynamic_query",
        "arguments": {
            "csharp_code": csharp_code,
            "justification": e.justification,
        },
    }

    # Save the aborted ToolCall in history for smooth resumption
    try:
        pydantic_history.append(ModelRequest(parts=[
            UserPromptPart(content=request_message)
        ]))
        pydantic_history.append(ModelResponse(parts=[
            ToolCallPart(
                tool_name="execute_dynamic_query",
                args=tool_call["arguments"],
                tool_call_id=call_id,
            )
        ]))
        ta = TypeAdapter(List[ModelMessage])
        return tool_call, ta.dump_json(pydantic_history).decode('utf-8')
    except Exception as dump_err:
        logger.warning(f"[V4] Failed to capture pre-handoff history: {dump_err}")
        return tool_call, None


def _classify_run_error(run_err: Exception, model_name: str) -> str:
    """Classify a pydantic_ai run error into a user-friendly SYSTEM ALERT message."""
    from pydantic_ai.exceptions import ModelHTTPError, ModelAPIError

    if isinstance(run_err, ModelHTTPError):
        if run_err.status_code == 503:
            logger.warning(f"[V4] Caught 503 High Demand Error.")
            return (
                "SYSTEM ALERT: Google's free Gemini API is currently experiencing "
                "a massive global traffic spike (HTTP 503: Service Unavailable).\n\n"
                "Your code and request are perfectly fine, but Google's physical "
                "servers are rejecting free-tier requests right now.\n\n"
                "**Solutions:**\n"
                "1. Wait 5-10 minutes and try again.\n"
                "2. Go to Settings -> LLM Configuration and switch your provider "
                "to OpenRouter or Deepseek to bypass Google's network entirely."
            )
        elif run_err.status_code == 404:
            return (
                f"SYSTEM ALERT: The model you selected '{model_name}' was not found "
                f"(HTTP 404). Please go to Settings and ensure you are using the "
                f"correct string (e.g., `gemini-3-flash-preview`)."
            )
        elif run_err.status_code == 429:
            logger.warning(f"[V4] Caught 429 Quota Exceeded Error.")
            return (
                f"SYSTEM ALERT: You have exceeded your API usage quota / rate limit "
                f"(HTTP 429).\n\nIf you are using a free tier API key, you may need "
                f"to wait a minute before sending another message, or check your "
                f"billing plan."
            )

    if isinstance(run_err, ModelAPIError):
        logger.warning(f"[V4] Caught ModelAPIError: {run_err}")
        return (
            f"SYSTEM ALERT: The LLM provider returned an API error / timeout:\n\n"
            f"{run_err}\n\nPlease try sending your request again."
        )

    if "timeout" in type(run_err).__name__.lower() or "timeout" in str(run_err).lower():
        logger.warning(f"[V4] Caught timeout error: {run_err}")
        return (
            "SYSTEM ALERT: The connection to the LLM provider timed out. "
            "Please check your network and try again."
        )

    # Unknown error — re-raise to be caught by the global handler
    raise


def _serialize_history(pydantic_history: List[ModelMessage]) -> str | None:
    """Serialize PydanticAI message history to JSON string for the frontend."""
    try:
        ta = TypeAdapter(List[ModelMessage])
        raw = ta.dump_json(pydantic_history)
        return raw.decode('utf-8') if isinstance(raw, bytes) else str(raw)
    except Exception as e:
        logger.warning(f"[V4] History serialization failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# Main Agent Chat Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Orchestrate a single agent turn: history → run → classify result."""
    logger.info(f"[V4] Request (Model: {request.llm_model}, Provider: {request.llm_provider})")

    try:
        if not request.llm_api_key_value:
            raise HTTPException(status_code=400, detail="Missing API Key.")

        # ── 1. Setup ──────────────────────────────────────────────────────
        from agent.v4_repl_agent import v4_repl_agent, AgentDeps, InterruptedException
        from mcp_core.summarizer import summarize

        deps = AgentDeps(
            user_id=request.token or "unknown",
            thread_id=request.thread_id or "unknown",
        )
        model_name = request.llm_model or 'gemini-1.5-flash'
        model = _build_llm_model(
            request.llm_provider or "Google",
            model_name,
            request.llm_api_key_value,
        )

        # ── 2. Reconstruct history ────────────────────────────────────────
        pydantic_history = _reconstruct_history(request.raw_history, request.history)

        # ── 3. Base response ──────────────────────────────────────────────
        response_data = {
            "thread_id": request.thread_id or str(uuid.uuid4()),
            "status": "complete",
            "message": "",
            "tool_call": None,
            "raw_history_json": None,
            "thinking_steps": [],
        }

        # ── 4. Conversational summary (tool-result follow-up) ─────────────
        if request.raw_output_for_summary:
            try:
                summary = summarize(request.raw_output_for_summary)
            except Exception:
                summary = "Execution completed."

            logger.info(f"[V4] Script-summarized: {len(summary)} chars.")
            # Extract C# code from history for pipeline diagnostic context
            csharp_code = _extract_csharp_from_history(pydantic_history)
            # Extract topic from history (original user query may not be in request.message)
            topic_query = request.message or ""
            # Try legacy history first (human messages have type: "human")
            if request.history:
                for h in reversed(request.history):
                    if isinstance(h, dict) and h.get("type") == "human":
                        topic_query = str(h.get("content", ""))
                        break
            # Fallback: try raw_history (PydanticAI format — UserPromptPart)
            if topic_query == (request.message or "") and request.raw_history:
                try:
                    history_msgs = json.loads(request.raw_history)
                    for msg in reversed(history_msgs):
                        if isinstance(msg, dict):
                            parts = msg.get("parts", [])
                            for p in parts:
                                if isinstance(p, dict) and p.get("part_kind") == "user-prompt":
                                    topic_query = str(p.get("content", ""))
                                    break
                except Exception:
                    pass
            agent_response = await _run_conversational_summary(summary, deps, model, topic_query, csharp_code)

            # Patch Protocol Shield placeholder with real execution results
            from mcp_core.context_manager import replace_dummy_tool_return
            replace_dummy_tool_return(pydantic_history, summary)

            # Append the agent's summary response + the user message
            # so the full turn is captured.
            pydantic_history.append(ModelRequest(parts=[UserPromptPart(content=request.message)]))
            pydantic_history.append(ModelResponse(parts=[TextPart(content=agent_response)]))

            response_data["message"] = agent_response
            response_data["raw_history_json"] = _serialize_history(pydantic_history)
            return Response(content=json.dumps(response_data), media_type="application/json")

        # ── 5. Main agent run ─────────────────────────────────────────────
        try:
            from pydantic_ai.settings import ModelSettings
            from pydantic_ai.usage import RunUsage

            # Prepend status header for context efficiency (Kaizen Harness pattern)
            # Extracts goal + completed tool calls from history, replaces full recaps
            augmented_message = build_status_augmented_message(
                request.message,
                request.history,  # Legacy-format history from frontend
            )

            deps.turn_usage = RunUsage()
            result = await v4_repl_agent.run(
                augmented_message,
                message_history=pydantic_history,
                deps=deps,
                model=model,
                model_settings=ModelSettings(max_tokens=2048),
                usage=deps.turn_usage,
            )

            # Capture usage EARLY — survives sanitizer raising InterruptedException below
            try:
                response_data["usage"] = {
                    "input_tokens": deps.turn_usage.input_tokens,
                    "output_tokens": deps.turn_usage.output_tokens,
                    "total_tokens": deps.turn_usage.total_tokens,
                    "requests": deps.turn_usage.requests,
                }
            except Exception:
                pass

            raw_output = str(result.output) if isinstance(result.output, str) else ""

            # ── 5a. Response sanitizer ────────────────────────────────────
            from agent.response_sanitizer import sanitize_response
            cleaned_text, parsed_tool = sanitize_response(raw_output)

            if parsed_tool and parsed_tool.tool_name == "execute_dynamic_query":
                csharp_code = parsed_tool.arguments.get("csharp_code", "")
                justification = parsed_tool.arguments.get("justification", "Agent-generated query")
                from mcp_core.tool_helpers import sanitize_csharp_code
                csharp_code = sanitize_csharp_code(csharp_code)
                logger.info(f"[V4] Sanitizer recovered raw execute_dynamic_query — triggering handoff.")
                raise InterruptedException(csharp_code, justification)

            if parsed_tool:
                logger.warning(f"[V4] Sanitizer stripped raw {parsed_tool.tool_name} markup from response.")

            response_data["message"] = cleaned_text or "Processing complete."
            response_data["raw_history_json"] = _serialize_history(pydantic_history)
            response_data["thinking_steps"] = deps.thinking_steps
            logger.info(f"[V4] Finalizing turnaround: history preserved.")

        except InterruptedException as e:
            # ── 5b. Sovereign Handoff ─────────────────────────────────────
            # Include partial usage from the interrupted agent run
            try:
                response_data["usage"] = {
                    "input_tokens": deps.turn_usage.input_tokens,
                    "output_tokens": deps.turn_usage.output_tokens,
                    "total_tokens": deps.turn_usage.total_tokens,
                    "requests": deps.turn_usage.requests,
                }
            except Exception:
                pass

            # Block retry if results were already delivered (follow-up after execution)
            if request.raw_output_for_summary:
                logger.info(f"[V4] Blocked agent retry after results already delivered.")
                try:
                    summary = summarize(request.raw_output_for_summary)
                except Exception:
                    summary = "The results are in the Analytics tab."
                topic_query2 = request.message or ""
                if request.history:
                    for h in reversed(request.history):
                        if isinstance(h, dict) and h.get("type") == "human":
                            topic_query2 = str(h.get("content", "")); break
                response_data["message"] = await _run_conversational_summary(summary, deps, model, topic_query2, getattr(e, 'csharp_code', ''))
                return Response(content=json.dumps(response_data), media_type="application/json")

            response_data["status"] = "interrupted"
            tool_call, history_json = _build_sovereign_handoff(
                e, request.message, pydantic_history
            )
            response_data["tool_call"] = tool_call
            response_data["raw_history_json"] = history_json
            response_data["thinking_steps"] = deps.thinking_steps

        except Exception as run_err:
            # ── 5c. Classified error → user-friendly alert ────────────────
            try:
                response_data["message"] = _classify_run_error(run_err, model_name)
                response_data["thinking_steps"] = deps.thinking_steps
            except Exception:
                # Not a classified error — bubble up
                logger.exception(f"[V4] Agent Run Error: {run_err}")
                raise

        return Response(content=json.dumps(response_data), media_type="application/json")

    except Exception as e:
        logger.exception(f"[V4] Global Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Streaming Agent Chat Endpoint (SSE — Server-Sent Events)
# ═══════════════════════════════════════════════════════════════════════════════


def _format_sse(event: str, data: dict) -> str:
    """Format a dict as an SSE event string."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/agent/chat/stream")
async def chat_with_agent_stream(request: ChatRequest):
    """Stream the agent's thinking process via Server-Sent Events.

    Uses PydanticAI's event_stream_handler to capture per-tool events
    (FunctionToolCallEvent / FunctionToolResultEvent) as they happen,
    pushing them onto an asyncio.Queue that the SSE generator reads from.
    This gives true per-tool streaming — each explore/schema/read call
    appears in the UI as it starts and completes, not all at once.
    """
    import asyncio
    from agent.v4_repl_agent import v4_repl_agent, AgentDeps, InterruptedException
    from pydantic_ai.settings import ModelSettings
    from pydantic_ai.messages import FunctionToolCallEvent, FunctionToolResultEvent

    logger.info(f"[V4-Stream] Request (Model: {request.llm_model}, Provider: {request.llm_provider})")

    if not request.llm_api_key_value:
        raise HTTPException(status_code=400, detail="Missing API Key.")

    deps = AgentDeps(
        user_id=request.token or "unknown",
        thread_id=request.thread_id or "unknown",
    )
    model_name = request.llm_model or 'gemini-1.5-flash'
    model = _build_llm_model(
        request.llm_provider or "Google",
        model_name,
        request.llm_api_key_value,
    )
    pydantic_history = _reconstruct_history(request.raw_history, request.history)

    queue: asyncio.Queue = asyncio.Queue()

    async def event_generator():
        # ── Conversational summary shortcut ────────────────────────────────
        if request.raw_output_for_summary:
            from mcp_core.summarizer import summarize
            try:
                summary = summarize(request.raw_output_for_summary)
            except Exception:
                summary = "Execution completed."

            # Patch Protocol Shield placeholder with real execution results
            from mcp_core.context_manager import replace_dummy_tool_return
            replace_dummy_tool_return(pydantic_history, summary)

            # Append this turn to history so the full cycle is preserved
            pydantic_history.append(ModelRequest(parts=[UserPromptPart(content=request.message)]))
            pydantic_history.append(ModelResponse(parts=[TextPart(content=summary)]))

            yield _format_sse("complete", {
                "message": summary,
                "raw_history_json": _serialize_history(pydantic_history),
                "thinking_steps": [],
            })
            return

        # ── Per-tool event stream handler ──────────────────────────────────
        # PydanticAI calls this concurrently with the agent run. We push
        # each tool-call start/end event onto the queue so the SSE loop
        # can yield them to the client in real time.
        async def stream_handler(ctx, events):
            async for event in events:
                if isinstance(event, FunctionToolCallEvent):
                    tool_name = event.part.tool_name
                    if tool_name in ('explore_revit_data', 'search_schema', 'read_extension_methods'):
                        args = event.part.args_as_dict()
                        await queue.put({
                            "type": "tool_start",
                            "tool_name": tool_name,
                            "tool_call_id": event.part.tool_call_id,
                            "justification": args.get("justification", ""),
                            "csharp_code": args.get("csharp_code"),
                            "category_name": args.get("category_name"),
                            "query": args.get("query"),
                        })
                elif isinstance(event, FunctionToolResultEvent):
                    # Results fire for ALL tools, including execute_dynamic_query
                    pass  # handled by deps.thinking_steps inspection below

        # ── Start agent run in background ──────────────────────────────────
        from pydantic_ai.usage import RunUsage
        deps.turn_usage = RunUsage()
        agent_task = asyncio.create_task(
            v4_repl_agent.run(
                request.message,
                message_history=pydantic_history,
                deps=deps,
                model=model,
                model_settings=ModelSettings(max_tokens=2048),
                event_stream_handler=stream_handler,
                usage=deps.turn_usage,
            )
        )

        # ── Read queue and emit SSE events ─────────────────────────────────
        last_step_count = 0
        try:
            while not agent_task.done() or not queue.empty():
                flushed = False

                # Check for new thinking steps (completed/error)
                for i in range(last_step_count, len(deps.thinking_steps)):
                    step = deps.thinking_steps[i]
                    yield _format_sse("thinking_step", {
                        "step_index": i,
                        "tool_name": step.get("tool_name", ""),
                        "justification": step.get("justification", ""),
                        "status": step.get("status", "running"),
                        "csharp_code": step.get("csharp_code"),
                        "category_name": step.get("category_name"),
                        "query": step.get("query"),
                        "result_summary": step.get("result_summary"),
                    })
                    flushed = True
                last_step_count = len(deps.thinking_steps)

                # Emit pending tool-start events from the queue
                try:
                    tool_event = await asyncio.wait_for(queue.get(), timeout=0.2)
                    if tool_event["type"] == "tool_start":
                        step_index = len(deps.thinking_steps)
                        yield _format_sse("thinking_step", {
                            "step_index": step_index,
                            "tool_name": tool_event["tool_name"],
                            "justification": tool_event["justification"],
                            "status": "running",
                            "csharp_code": tool_event.get("csharp_code"),
                            "category_name": tool_event.get("category_name"),
                            "query": tool_event.get("query"),
                            "result_summary": None,
                        })
                        flushed = True
                except asyncio.TimeoutError:
                    pass  # no new tool events yet, loop back to check steps

                # Force TCP flush — give the ASGI server a chance to send the
                # chunk before the tool completes and the next event arrives.
                if flushed:
                    await asyncio.sleep(0.01)

            # ── Finalize: handle agent result ──────────────────────────────
            try:
                result = agent_task.result()
            except InterruptedException as e:
                # Tool-start events may still be in queue
                while not queue.empty():
                    tool_event = queue.get_nowait()
                    step_index = len(deps.thinking_steps)
                    yield _format_sse("thinking_step", {
                        "step_index": step_index,
                        "tool_name": tool_event["tool_name"],
                        "justification": tool_event["justification"],
                        "status": "running",
                        "csharp_code": tool_event.get("csharp_code"),
                        "category_name": tool_event.get("category_name"),
                        "query": tool_event.get("query"),
                        "result_summary": None,
                    })

                # Flush any remaining thinking steps
                for i in range(last_step_count, len(deps.thinking_steps)):
                    step = deps.thinking_steps[i]
                    yield _format_sse("thinking_step", {
                        "step_index": i,
                        "tool_name": step.get("tool_name", ""),
                        "justification": step.get("justification", ""),
                        "status": step.get("status", "running"),
                        "csharp_code": step.get("csharp_code"),
                        "category_name": step.get("category_name"),
                        "query": step.get("query"),
                        "result_summary": step.get("result_summary"),
                    })

                tool_call, history_json = _build_sovereign_handoff(
                    e, request.message, pydantic_history
                )
                usage_data_interrupted = None
                try:
                    usage_data_interrupted = {
                        "input_tokens": deps.turn_usage.input_tokens,
                        "output_tokens": deps.turn_usage.output_tokens,
                        "total_tokens": deps.turn_usage.total_tokens,
                        "requests": deps.turn_usage.requests,
                    }
                except Exception:
                    pass
                yield _format_sse("interrupted", {
                    "tool_call": tool_call,
                    "raw_history_json": history_json,
                    "thinking_steps": deps.thinking_steps,
                    "usage": usage_data_interrupted,
                })
                return

            # Normal completion
            output = str(result.output) if result and result.output else ""
            from agent.response_sanitizer import sanitize_response
            cleaned_text, _parsed_tool = sanitize_response(output)
            usage_data = None
            try:
                usage_data = {
                    "input_tokens": deps.turn_usage.input_tokens,
                    "output_tokens": deps.turn_usage.output_tokens,
                    "total_tokens": deps.turn_usage.total_tokens,
                    "requests": deps.turn_usage.requests,
                }
            except Exception:
                pass
            yield _format_sse("complete", {
                "message": cleaned_text or "Processing complete.",
                "raw_history_json": _serialize_history(pydantic_history),
                "thinking_steps": deps.thinking_steps,
                "usage": usage_data,
            })

        except Exception as e:
            yield _format_sse("error", {
                "message": str(e),
                "thinking_steps": deps.thinking_steps,
            })

    return StreamingResponse(event_generator(), media_type="text/event-stream")
