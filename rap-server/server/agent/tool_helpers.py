"""
Shared helper functions used by both PydanticAI agent tools (v4_repl_agent.py)
and MCP server tools (mcp_server.py).

Extracted to eliminate ~45 lines of duplicated search logic and ~20 lines
of duplicated result-wrapping logic.
"""

from typing import Any, Dict


def search_extension_methods(query: str, doc: str) -> str:
    """
    Search the EXTENSION_METHODS.md content for a specific method or topic.

    Two-pass search:
      1. Match section headers (## or #) containing any query word.
      2. Keyword search with ±2 line context, grouped into contiguous blocks.

    Args:
        query: Space-separated search terms (e.g. "GetStr", "WhereParam Table").
        doc: The full EXTENSION_METHODS.md content as a string.

    Returns:
        Relevant section of the doc, or a "no matches" message with the first
        3000 chars as fallback.
    """
    words = [w.strip().lower() for w in query.split() if len(w.strip()) > 1]
    lines = doc.split("\n")
    results = []

    # Try 1: match section headers containing any word
    for word in words:
        in_section = False
        for line in lines:
            if line.startswith("## ") or line.startswith("# "):
                in_section = word in line.lower()
            if in_section:
                results.append(line)
                if len(results) > 200:
                    break
        if results:
            return "\n".join(results)

    # Try 2: keyword search with context
    match_indices = {i for i, line in enumerate(lines) if any(word in line.lower() for word in words)}
    if match_indices:
        # Expand to include surrounding context (±2 lines)
        expanded = set()
        for i in match_indices:
            for j in range(max(0, i - 2), min(len(lines), i + 3)):
                expanded.add(j)
        # Group into contiguous blocks
        blocks = []
        block = []
        for i in sorted(expanded):
            if block and i > block[-1] + 1:
                blocks.append(block)
                block = []
            block.append(i)
        if block:
            blocks.append(block)
        # Build output with separators between blocks
        out = []
        for b in blocks:
            if out:
                out.append("---")
            for i in b:
                out.append(lines[i])
            if len(out) > 80:
                break
        return f"Found references to '{query}':\n" + "\n".join(out)
    return f"No matches for '{query}'. Full reference start:\n\n{doc[:3000]}"


def summarize_execution_result(result: Dict[str, Any]) -> str:
    """
    Wraps a raw gRPC execution result for the summarizer.

    Handles both camelCase (from JSON serialization) and snake_case
    (from protobuf) key conventions.

    Args:
        result: Dict from execute_script / execute_repl with keys like
                'structured_output', 'output', 'internal_data' (or camelCase).

    Returns:
        Summarized markdown string (via agent.summarizer.summarize).
    """
    from agent.summarizer import summarize
    output_raw = {
        "structuredOutput": result.get("structured_output", result.get("structuredOutput", [])),
        "output": result.get("output", ""),
        "internal_data": result.get("internal_data", result.get("internalData", "")),
    }
    return summarize(output_raw)


def format_execution_error(result: Dict[str, Any]) -> str:
    """
    Format a failed execution result as a user-facing error string.

    Args:
        result: Dict from execute_script / execute_repl with 'error_message'
                and optional 'error_details'.

    Returns:
        Formatted error string.
    """
    err_msg = result.get("error_message", "Unknown error")
    err_detail = result.get("error_details", "")
    return f"Execution Failed: {err_msg}" + (f"\nDetails: {err_detail}" if err_detail else "")
