"""
System prompt for the Paracore agent.

Single source of truth: all prompt content lives in agent/prompts/*.md.
The assembler reads those files and builds the prompt for each consumer type.

To modify the prompt, edit the .md files in agent/prompts/ — not this file.
"""

from mcp_core.prompt_assembler import build_prompt

SYSTEM_PROMPT = build_prompt("agent")
