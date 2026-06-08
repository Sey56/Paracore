import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_TABLE_ROWS = 10
MAX_TEXT_LINES = 10


def _markdown_table(headers: List[str], rows: List[List[str]]) -> str:
    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---" for _ in headers]) + "|")
    for row in rows:
        cells = [str(c).replace("\n", " ").strip() for c in row]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def _parse_data(data: Any) -> Any:
    """Parse data from JSON string if needed (gRPC protobuf sends data as JSON string)."""
    if isinstance(data, str):
        try:
            return json.loads(data)
        except (json.JSONDecodeError, TypeError):
            return data
    return data


def summarize(output_raw: Dict[str, Any]) -> str:
    """
    Produces a token-efficient summary of raw REPL execution output
    for the LLM agent context. Never exposes full raw data dumps.

    Returns a compact markdown string the agent can use.
    """
    parts: List[str] = []

    structured = output_raw.get("structuredOutput", output_raw.get("structured_output", []))
    plain_output = output_raw.get("output", "")
    internal_data = output_raw.get("internal_data", output_raw.get("internalData", ""))

    # ── Structured output items (tables, charts, etc.) ──
    if isinstance(structured, list) and len(structured) > 0:
        for item in structured:
            if not isinstance(item, dict):
                continue
            item_type = (item.get("type") or "").lower()
            raw_data = item.get("data")
            data = _parse_data(raw_data)
            title = item.get("title", "")

            if item_type == "table" and isinstance(data, list) and len(data) > 0:
                total_rows = len(data)
                headers = list(data[0].keys()) if isinstance(data[0], dict) else []
                shown = data[:MAX_TABLE_ROWS]

                if headers:
                    rows = [[str(row.get(h, "")) for h in headers] for row in shown]
                    table_md = _markdown_table(headers, rows)
                    title_line = f"**{title}** " if title else ""
                    parts.append(f"{title_line}Table with {total_rows} rows (showing first {len(shown)}):\n{table_md}")
                    if total_rows > MAX_TABLE_ROWS:
                        parts.append(f"... and {total_rows - MAX_TABLE_ROWS} more rows (total: {total_rows}).")
                else:
                    parts.append(f"Table **{title}** has {total_rows} rows (data available in UI).")

            elif item_type == "table" and isinstance(data, list) and len(data) == 0:
                parts.append(f"Table **{title}** is empty (no data).")

            elif any(t in item_type for t in ("bar", "pie", "line", "graph", "chart")):
                parts.append("CHART RENDERED — visible in the Analytics tab. Tell the user to check the Analytics tab.")

            elif item_type == "image":
                parts.append(f"An image **{title}** was rendered.")

            else:
                parts.append(f"Output item '{item_type}' (title: '{title}') was produced.")

    # ── Plain text output (Println lines, etc.) ──
    if plain_output and str(plain_output).strip():
        text = str(plain_output).strip()
        lines = text.split("\n")
        total_lines = len(lines)
        shown_lines = lines[:MAX_TEXT_LINES]

        # Short conversational output (e.g. "✅ Modified 19 walls") — render as plain
        # text, NOT in a code block, so the frontend doesn't box it with a scrollbar.
        if total_lines <= 3 and not any(
            keyword in text.lower() for keyword in ("error", "exception", "traceback", "debug", "warning")
        ):
            parts.insert(0, text)
        elif total_lines <= MAX_TEXT_LINES:
            parts.insert(0, f"**Text Output** ({total_lines} lines):\n```\n{text}\n```")
        else:
            parts.insert(0, f"**Text Output** ({total_lines} lines total, showing first {MAX_TEXT_LINES}):\n```\n" + "\n".join(shown_lines) + f"\n... and {total_lines - MAX_TEXT_LINES} more lines\n```")

    # ── Internal data (debug, usually not needed) ──
    if internal_data and str(internal_data).strip():
        internal_str = str(internal_data).strip()
        if len(internal_str) > 500:
            internal_str = internal_str[:500] + "... [truncated]"
        parts.append(f"**Internal Data:** {internal_str}")

    # ── Fallback if nothing parsed ──
    if not parts:
        return "EXECUTION SUCCESSFUL — no structured output to summarize."

    return "EXECUTION SUCCESSFUL. Summarized result:\n\n" + "\n\n".join(parts)


def shield_tool_return(text: str, tool_name: str) -> str:
    """
    Compresses large tool returns during history reconstruction.
    Prevents stale execution results from inflating the context window.
    """
    if len(text) <= 1000:
        return text

    try:
        data = json.loads(text)
        if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            row_count = len(data["data"])
            return f"EXECUTION SUCCESSFUL. Returned a {data.get('type', 'table')} with {row_count} rows."
    except (json.JSONDecodeError, TypeError):
        pass

    # Plain text too large: show first 300 chars
    return text[:300] + f"\n... [TRUNCATED: {len(text)} total chars.]"
