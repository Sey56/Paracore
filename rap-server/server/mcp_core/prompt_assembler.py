"""
Prompt Assembler — builds agent and MCP prompts from composable markdown files.

Single source of truth. All prompt content lives in agent/prompts/*.md.
The assembler reads these at import time and caches them in memory.

Two consumers:
  - "agent": In-app agent (PydanticAI). Gets identity, workflow, response-style, redundancy.
  - "mcp":  MCP server (FastMCP). Gets identity + catalog. No workflow/response/redundancy.
"""

import os
from typing import Literal

Consumer = Literal["agent", "mcp"]

_PROMPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
_cache: dict[str, str] = {}
_full_prompt_cache: dict[Consumer, str] = {}


def _read(filename: str) -> str:
    """Read a prompt file from the prompts directory, with caching."""
    if filename in _cache:
        return _cache[filename]
    path = os.path.join(_PROMPTS_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        _cache[filename] = content
        return content
    except FileNotFoundError:
        return f"[Prompt file not found: {filename}]"


# ── Shared sections (both agent and MCP) ──────────────────────────────────

_SHARED_SECTIONS = [
    "identity.md",
    "globals.md",
    "script-rules.md",
    "retrieval.md",
    "linq-rules.md",
    "parameter-discovery.md",
    "catalog.md",
    "critical-rules.md",
    "verification.md",
    "common-patterns.md",
]

# ── Agent-only sections ───────────────────────────────────────────────────

_AGENT_ONLY_SECTIONS = [
    "redundancy.md",
    "workflow.md",
    "response-style.md",
]


def build_prompt(consumer: Consumer) -> str:
    """Build the full system prompt for the given consumer type."""
    if consumer in _full_prompt_cache:
        return _full_prompt_cache[consumer]

    sections = list(_SHARED_SECTIONS)

    if consumer == "agent":
        sections.extend(_AGENT_ONLY_SECTIONS)

    parts = [_read(f) for f in sections]
    prompt = "\n\n".join(parts)
    _full_prompt_cache[consumer] = prompt
    return prompt


def build_extension_reference() -> str:
    """Build the extension methods reference (catalog only, used by read_extension_methods)."""
    return _read("catalog.md")


def get_section(name: str) -> str:
    """Get a single section by filename (e.g., 'parameter-discovery.md')."""
    return _read(name)


def reload():
    """Clear caches so files are re-read on next access (useful for hot-reload)."""
    _cache.clear()
    _full_prompt_cache.clear()
