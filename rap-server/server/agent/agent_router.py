import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Response
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
                from agent.summarizer import shield_tool_return
                if len(text) > 1000:
                    text = shield_tool_return(text, t_name)

                pydantic_history.append(ModelRequest(parts=[
                    ToolReturnPart(tool_name=t_name, content=text, tool_call_id=c_id)
                ]))

    # ── Protocol Shield ──
    # If the last message is a ModelResponse with a ToolCallPart, inject a
    # dummy ToolReturnPart so strict providers don't crash with 400.
    if pydantic_history and isinstance(pydantic_history[-1], ModelResponse):
        for part in pydantic_history[-1].parts:
            if isinstance(part, ToolCallPart):
                pydantic_history.append(ModelRequest(parts=[
                    ToolReturnPart(
                        tool_name=part.tool_name,
                        content="Execution output provided in next system message.",
                        tool_call_id=part.tool_call_id,
                    )
                ]))
                break  # Only need one shield per response

    return pydantic_history


# ── Known Revit category patterns for extracting context from user queries ──
# Used by _extract_topic() to provide category-aware lead-in text without an LLM call.
_CATEGORY_PATTERNS = [
    "structural columns", "architectural columns", "columns",
    "structural framing", "beams", "braces", "trusses",
    "walls", "curtain walls", "wall types",
    "floors", "floor types", "ceilings", "roofs",
    "doors", "door types", "windows", "window types",
    "rooms", "spaces", "areas",
    "mechanical equipment", "electrical equipment", "plumbing equipment",
    "ducts", "pipes", "cable trays", "conduits",
    "lighting fixtures", "lighting devices", "electrical fixtures",
    "plumbing fixtures", "sprinklers", "air terminals",
    "furniture", "casework", "specialty equipment",
    "grids", "levels", "views", "sheets", "schedules",
    "family instances", "families", "family types",
    "text notes", "dimensions", "tags",
    "railings", "stairs", "ramps",
    "topography", "toposolid", "site",
    "assemblies", "groups", "parts",
]


def _extract_topic(user_query: str) -> str:
    """Extract a Revit category/element topic from the user's query.

    Uses simple substring matching against known Revit category names.
    Returns the matched category string, or empty string if no match.
    Fast — no LLM call needed.
    """
    lower = user_query.lower()
    # Sort by length descending so "structural columns" matches before "columns"
    for pattern in sorted(_CATEGORY_PATTERNS, key=len, reverse=True):
        if pattern in lower:
            return pattern
    return ""


def _format_fallback_response(summary_text: str, user_query: str = "") -> str:
    """Instant template fallback — used when the LLM call times out or fails."""
    topic = _extract_topic(user_query) if user_query else ""

    if topic:
        lead = f"Here are the **{topic}** from your query:\n\n"
    else:
        lead = "Here are the results:\n\n"

    result = lead + summary_text
    if "more rows" in summary_text.lower() or "more lines" in summary_text.lower():
        result += "\n\n*Full results are available in the **Analytics** tab.*"
    return result


async def _run_conversational_summary(
    summary_text: str,
    deps,
    model,
    user_query: str = "",
) -> str:
    """Format execution results conversationally.

    Uses template-based lead-in for reliability — the LLM formatting step
    was producing generic responses ("items", "Group") instead of using the
    actual element type from the user's query. The template is deterministic.
    """
    topic = _extract_topic(user_query) if user_query else ""

    # Build a natural lead-in from the user's query context
    if topic:
        # Strip summarizer boilerplate — we'll add our own lead-in
        body = summary_text
        for prefix in ["EXECUTION SUCCESSFUL. Summarized result:\n\n", "EXECUTION SUCCESSFUL\n\n"]:
            if body.startswith(prefix):
                body = body[len(prefix):]
                break
        # Strip "Table with N rows (showing first N):\n" line
        lines = body.split("\n")
        if lines and lines[0].startswith("Table with") and "rows" in lines[0]:
            body = "\n".join(lines[1:]).lstrip("\n")

        # Detect what kind of result this is from the body
        if "CHART" in body or "Analytics tab" in body:
            chart_type = "chart"
            if "bar" in body.lower(): chart_type = "bar chart"
            elif "pie" in body.lower(): chart_type = "pie chart"
            elif "line" in body.lower(): chart_type = "line chart"
            return f"The **{topic}** {chart_type} is ready — check the **Analytics** tab.\n\n"
        elif "| Group" in body and "| Count" in body:
            lead = f"Here's the breakdown of **{topic}** by level:\n\n"
        elif "modified" in body.lower() or "set " in body.lower():
            lead = f"Updated **{topic}** successfully.\n\n"
        elif "deleted" in body.lower():
            lead = f"Deleted **{topic}** successfully.\n\n"
        else:
            lead = f"Here are the **{topic}**:\n\n"
        return lead + body

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
        from agent.summarizer import summarize

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
        }

        # ── 4. Conversational summary (tool-result follow-up) ─────────────
        if request.raw_output_for_summary:
            try:
                summary = summarize(request.raw_output_for_summary)
            except Exception:
                summary = "Execution completed."

            logger.info(f"[V4] Script-summarized: {len(summary)} chars.")
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
            agent_response = await _run_conversational_summary(summary, deps, model, topic_query)
            response_data["message"] = agent_response

            # Inject summary into history for follow-up turns
            try:
                pydantic_history.append(ModelRequest(parts=[
                    UserPromptPart(content=f"[Execution Result]\n{summary}")
                ]))
                response_data["raw_history_json"] = _serialize_history(pydantic_history)
            except Exception as hist_err:
                logger.warning(f"[V4] History update after summary failed: {hist_err}")

            return Response(content=json.dumps(response_data), media_type="application/json")

        # ── 5. Main agent run ─────────────────────────────────────────────
        try:
            from pydantic_ai.settings import ModelSettings

            result = await v4_repl_agent.run(
                request.message,
                message_history=pydantic_history,
                deps=deps,
                model=model,
                model_settings=ModelSettings(max_tokens=2048),
            )

            raw_output = str(result.output) if isinstance(result.output, str) else ""

            # ── 5a. Response sanitizer ────────────────────────────────────
            from agent.response_sanitizer import sanitize_response
            cleaned_text, parsed_tool = sanitize_response(raw_output)

            if parsed_tool and parsed_tool.tool_name == "execute_dynamic_query":
                csharp_code = parsed_tool.arguments.get("csharp_code", "")
                justification = parsed_tool.arguments.get("justification", "Agent-generated query")
                from agent.tool_helpers import sanitize_csharp_code
                csharp_code = sanitize_csharp_code(csharp_code)
                logger.info(f"[V4] Sanitizer recovered raw execute_dynamic_query — triggering handoff.")
                raise InterruptedException(csharp_code, justification)

            if parsed_tool:
                logger.warning(f"[V4] Sanitizer stripped raw {parsed_tool.tool_name} markup from response.")

            response_data["message"] = cleaned_text or "Processing complete."
            response_data["raw_history_json"] = _serialize_history(pydantic_history)
            logger.info(f"[V4] Finalizing turnaround: history preserved.")

        except InterruptedException as e:
            # ── 5b. Sovereign Handoff ─────────────────────────────────────
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
                response_data["message"] = await _run_conversational_summary(summary, deps, model, topic_query2)
                return Response(content=json.dumps(response_data), media_type="application/json")

            response_data["status"] = "interrupted"
            tool_call, history_json = _build_sovereign_handoff(
                e, request.message, pydantic_history
            )
            response_data["tool_call"] = tool_call
            response_data["raw_history_json"] = history_json

        except Exception as run_err:
            # ── 5c. Classified error → user-friendly alert ────────────────
            try:
                response_data["message"] = _classify_run_error(run_err, model_name)
            except Exception:
                # Not a classified error — bubble up
                logger.exception(f"[V4] Agent Run Error: {run_err}")
                raise

        return Response(content=json.dumps(response_data), media_type="application/json")

    except Exception as e:
        logger.exception(f"[V4] Global Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
