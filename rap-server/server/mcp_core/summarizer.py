import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_TABLE_ROWS = 200          # Cap for raw element dumps (100K+ rows). CombinedParams max ~200.
MAX_TEXT_LINES = 30           # Cap for verbose text output
SHOW_ALL_TABLE_THRESHOLD = 200 # Show ALL rows if total ≤ this — covers CombinedParams (up to ~200 rows)
SHOW_ALL_TEXT_THRESHOLD = 40   # Show ALL lines if total ≤ this


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

                if total_rows <= SHOW_ALL_TABLE_THRESHOLD:
                    # Small table — show all rows, no truncation
                    shown = data
                else:
                    # Large table — show first N-2 rows + last 2 rows.
                    # The last rows often contain totals/summaries that must
                    # survive truncation (e.g. formwork grand total).
                    head = data[:MAX_TABLE_ROWS - 2]
                    tail = data[-2:]
                    shown = head + tail

                if headers:
                    rows = [[str(row.get(h, "")) for h in headers] for row in shown]
                    table_md = _markdown_table(headers, rows)
                    title_line = f"**{title}** " if title else ""
                    if total_rows <= SHOW_ALL_TABLE_THRESHOLD:
                        parts.append(f"{title_line}Table ({total_rows} rows):\n{table_md}")
                    else:
                        parts.append(f"{title_line}Table — {total_rows} rows total (showing first {len(shown)}):\n{table_md}")
                        parts.append(f"↳ {total_rows - MAX_TABLE_ROWS} more rows not shown (last 2 rows preserved). Narrow your query with .WhereParam() or .GroupByParam() for focused results.")
                else:
                    parts.append(f"Table **{title}** has {total_rows} rows (data available in UI).")

            elif item_type == "table" and isinstance(data, list) and len(data) == 0:
                label = f"**{title}**" if title else "The query"
                parts.append(f"{label} returned no results.")

            elif any(t in item_type for t in ("bar", "pie", "line", "graph", "chart")):
                parts.append("Chart rendered — check the Analytics tab.")

            elif item_type == "image":
                parts.append(f"An image **{title}** was rendered.")

            else:
                parts.append(f"Output item '{item_type}' (title: '{title}') was produced.")

    # ── Plain text output (Println lines, etc.) ──
    if plain_output and str(plain_output).strip():
        text = str(plain_output).strip()
        # Strip pipeline diagnostic lines — they're for the History tab, not the agent
        text = "\n".join(l for l in text.split("\n") if not l.startswith("Pipeline: [")).strip()
        if not text:
            plain_output = ""
            text = ""
        lines = text.split("\n") if text else []
        total_lines = len(lines)

        # Short conversational output — render as plain text, no code block
        if total_lines <= 3 and not any(
            keyword in text.lower() for keyword in ("error", "exception", "traceback", "debug", "warning")
        ):
            parts.insert(0, text)
        elif total_lines <= SHOW_ALL_TEXT_THRESHOLD:
            # Small output — show all lines
            parts.insert(0, f"**Text Output** ({total_lines} lines):\n```\n{text}\n```")
        else:
            # Large output — cap to prevent context bloat
            shown_lines = lines[:MAX_TEXT_LINES]
            parts.insert(0,
                f"**Text Output** — {total_lines} lines total (showing first {MAX_TEXT_LINES}):\n```\n"
                + "\n".join(shown_lines)
                + f"\n↳ {total_lines - MAX_TEXT_LINES} more lines not shown. Refine your query for focused output.\n```"
            )

    # ── Internal data (debug, usually not needed) ──
    if internal_data and str(internal_data).strip():
        internal_str = str(internal_data).strip()
        if len(internal_str) > 500:
            internal_str = internal_str[:500] + "... [truncated]"
        parts.append(f"**Internal Data:** {internal_str}")

    # ── Pipeline diagnostics (precise stage-by-stage info) ──
    diags = output_raw.get("pipeline_diagnostics", [])
    if not parts and diags:
        parts.append(_decode_pipeline(diags))
    elif not parts:
        return "No output was produced."

    return "\n\n".join(parts)


def _decode_pipeline(diags: List[int]) -> str:
    """Decode a pipeline diagnostics array into a human-readable stage summary.

    Encoding:
      > 0 = item count at this stage
        0 = empty result
       -1 = chart rendered
       -2 = table rendered
       -3 = write succeeded (✓)
       -4 = write failed (✗)
    """
    tokens: List[str] = []
    for d in diags:
        if d > 0:
            tokens.append(str(d))
        elif d == 0:
            tokens.append("0")
        elif d == _PIPE_CHART:
            tokens.append("chart rendered")
        elif d == _PIPE_TABLE:
            tokens.append("table rendered")
        elif d == _PIPE_WRITE_OK:
            tokens.append("✓")
        elif d == _PIPE_WRITE_FAIL:
            tokens.append("✗")
        else:
            tokens.append(str(d))

    if not tokens:
        return "No output was produced."

    stages = " → ".join(tokens)

    # Produce a narrative based on the first stage (GetElements)
    if len(diags) >= 1 and diags[0] == 0:
        return f"Pipeline [0]: GetElements returned 0 elements — no matching items exist in the document."
    elif len(diags) >= 2 and diags[0] > 0 and diags[1] == 0:
        return f"Pipeline [{stages}]: found {diags[0]} elements, but the next stage returned 0."
    elif any(d < 0 for d in diags):
        return f"Pipeline [{stages}] completed."
    else:
        return f"Pipeline stages: {stages}"


# ── Pipeline diagnostic constants ─────────────────────────────────────────
_PIPE_CHART = -1
_PIPE_TABLE = -2
_PIPE_WRITE_OK = -3
_PIPE_WRITE_FAIL = -4


def shield_tool_return(text: str, tool_name: str) -> str:
    """
    Compresses large tool returns during history reconstruction.
    Prevents stale execution results from inflating the context window.

    Handles multiple output shapes:
      - JSON arrays → "Returned N items"
      - JSON dicts with "data" key → "Returned a table with N rows"
      - JSON dicts with "error" key → "Error: <message>"
      - Plain text over 1000 chars → first 300 chars + truncation note
      - Already-short text (< 1000 chars) → pass through unchanged
    """
    if len(text) <= 500:
        return text

    # Try JSON parsing for structured compression
    try:
        data = json.loads(text)

        # Case 1: JSON array → count items
        if isinstance(data, list):
            return f"[{tool_name}] Returned {len(data)} items."

        # Case 2: Dict with "data" key (table output)
        if isinstance(data, dict):
            if "data" in data and isinstance(data["data"], list):
                row_count = len(data["data"])
                item_type = data.get("type", "table")
                return f"[{tool_name}] Returned a {item_type} with {row_count} rows."

            # Case 3: Error dict
            if "error" in data:
                error_msg = str(data["error"])[:200]
                return f"[{tool_name}] Error: {error_msg}"

            # Case 4: Schema response (parameter definitions)
            if "parameters" in data or "params" in data:
                param_count = len(data.get("parameters", data.get("params", [])))
                return f"[{tool_name}] Returned schema with {param_count} parameters."

            # Case 5: Generic dict → summarize keys
            keys = list(data.keys())[:5]
            return f"[{tool_name}] Returned dict with keys: {', '.join(keys)}... ({len(text)} chars)"

    except (json.JSONDecodeError, TypeError):
        pass

    # Plain text: preserve first 300 chars, note truncation
    return text[:300] + f"\n... [{tool_name}: {len(text)} total chars, truncated]"
