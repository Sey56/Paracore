"""
Context hygiene manager — keeps agent context windows lean.

Implements the "append-only status header" pattern (Kaizen Harness):
instead of accumulating full tool-call results in history, maintain a
compact 3-line status block that replaces verbose history recaps.

Also provides auto-compaction: after N turns, old tool results are
summarized and compressed to prevent context window inflation.
"""

from dataclasses import dataclass, field


# ── Thresholds ─────────────────────────────────────────────────────────────

AUTO_COMPACT_AFTER_TURNS = 5       # Compact after this many tool-calling turns
SHIELD_TOOL_RETURN_AT_CHARS = 500   # Shield tool returns larger than this


# ── Status Header ───────────────────────────────────────────────────────────

@dataclass
class StatusHeader:
    """
    Append-only status block that replaces full history recaps.

    Pattern:
      [GOAL] Generate concrete takeoff for Level 1
      [DONE] Searched schema for Walls, Floors, Columns
      [NEXT] Execute takeoff query
    """
    goal: str = ""
    done: list[str] = field(default_factory=list)
    next_step: str = ""

    _MAX_DONE_ITEMS = 10  # Cap to prevent header itself from bloating

    def set_goal(self, goal: str):
        self.goal = goal[:200]  # Truncate long goals

    def add_done(self, item: str):
        self.done.append(item[:120])
        # Keep only the most recent items
        if len(self.done) > self._MAX_DONE_ITEMS:
            self.done = self.done[-self._MAX_DONE_ITEMS:]

    def set_next(self, next_step: str):
        self.next_step = next_step[:200]

    def render(self) -> str:
        """Render the status header as a compact block."""
        parts = []
        if self.goal:
            parts.append(f"[GOAL] {self.goal}")
        if self.done:
            done_str = " -> ".join(self.done[-5:])  # Last 5 only
            parts.append(f"[DONE] {done_str}")
        if self.next_step:
            parts.append(f"[NEXT] {self.next_step}")
        return "\n".join(parts) if parts else ""

    @property
    def token_estimate(self) -> int:
        """Rough token count for the rendered header."""
        return len(self.render()) // 4  # ~4 chars per token


# ── Turn Counter ────────────────────────────────────────────────────────────

@dataclass
class TurnTracker:
    """Tracks agent turns for auto-compaction decisions."""
    total_turns: int = 0
    tool_calling_turns: int = 0
    last_compaction_at: int = 0

    def record_turn(self, had_tool_calls: bool = False):
        self.total_turns += 1
        if had_tool_calls:
            self.tool_calling_turns += 1

    @property
    def needs_compaction(self) -> bool:
        """Check if auto-compaction should trigger."""
        turns_since = self.tool_calling_turns - self.last_compaction_at
        return turns_since >= AUTO_COMPACT_AFTER_TURNS

    def mark_compacted(self):
        self.last_compaction_at = self.tool_calling_turns


# ── Status extraction from history ──────────────────────────────────────────

def extract_status_from_history(history: list[dict] | None, user_message: str) -> str:
    """
    Build a compact status header from existing conversation history.
    Extracts: what the user asked for (goal), what tools have been called (done),
    and hints at what should come next.

    Returns a short string to prepend to the user message, or "" if no status.
    """
    if not history:
        return ""

    tool_calls_made: list[str] = []
    last_user_query = user_message

    for msg in history[-10:]:  # Look at last 10 messages only
        if not isinstance(msg, dict):
            continue
        msg_type = msg.get("type", "")

        if msg_type == "human":
            content = str(msg.get("content", ""))
            if content and content != user_message:
                last_user_query = content

        elif msg_type == "ai":
            # Check for tool calls in AI messages
            tool_calls = msg.get("tool_calls", [])
            for tc in tool_calls:
                if isinstance(tc, dict):
                    name = tc.get("name", "")
                    if name and name not in tool_calls_made:
                        tool_calls_made.append(name)

    if not tool_calls_made:
        return ""

    header = StatusHeader()
    # Extract goal from the last user query (truncate to first sentence)
    goal = last_user_query.split("?")[0].split(".")[0].strip()
    if len(goal) > 200:
        goal = goal[:197] + "..."
    header.set_goal(goal)

    for tc in tool_calls_made[-5:]:
        header.add_done(tc)

    return header.render()


def build_status_augmented_message(user_message: str, history: list[dict] | None) -> str:
    """
    Build the final user message with a status header prepended (if available).
    This replaces the need for the LLM to scan full history to understand context.
    """
    status = extract_status_from_history(history, user_message)
    if not status:
        return user_message

    return f"{status}\n\n---\n\n{user_message}"


# ── Protocol Shield ────────────────────────────────────────────────────────

_PROTOCOL_SHIELD_PLACEHOLDER = "Execution output provided in next system message."


def inject_protocol_shield(pydantic_history: list) -> list:
    """
    If the last message is a ModelResponse with a ToolCallPart but no
    ToolReturnPart, inject a dummy return so strict providers (OpenAI, Google)
    don't crash with HTTP 400.

    Call this after reconstructing history, before the agent run.
    Returns the history (mutated in place, also returned for chaining).
    """
    if not pydantic_history:
        return pydantic_history

    # Import here to avoid circular dependency at module level
    from pydantic_ai.messages import ModelRequest, ModelResponse, ToolReturnPart, ToolCallPart

    last = pydantic_history[-1]
    if isinstance(last, ModelResponse):
        for part in last.parts:
            if isinstance(part, ToolCallPart):
                pydantic_history.append(ModelRequest(parts=[
                    ToolReturnPart(
                        tool_name=part.tool_name,
                        content=_PROTOCOL_SHIELD_PLACEHOLDER,
                        tool_call_id=part.tool_call_id,
                    )
                ]))
                break

    return pydantic_history


def replace_dummy_tool_return(pydantic_history: list, real_content: str) -> list:
    """
    After real execution completes, replace the Protocol Shield's placeholder
    ToolReturnPart with actual results so the agent remembers what its code
    produced on the next turn.

    Scans history backwards for the placeholder and replaces it.
    Returns the history (mutated in place, also returned for chaining).
    """
    from pydantic_ai.messages import ModelRequest, ToolReturnPart

    for i in range(len(pydantic_history) - 1, -1, -1):
        msg = pydantic_history[i]
        if isinstance(msg, ModelRequest):
            new_parts = []
            replaced = False
            for part in msg.parts:
                if isinstance(part, ToolReturnPart) and part.content == _PROTOCOL_SHIELD_PLACEHOLDER:
                    new_parts.append(ToolReturnPart(
                        tool_name=part.tool_name,
                        content=real_content,
                        tool_call_id=part.tool_call_id,
                    ))
                    replaced = True
                else:
                    new_parts.append(part)
            if replaced:
                pydantic_history[i] = ModelRequest(parts=new_parts)
                break

    return pydantic_history
