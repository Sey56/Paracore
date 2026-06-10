"""
Universal Response Sanitizer for Paracore Agent.

Some LLMs (notably DeepSeek) emit raw tool-calling markup as plain text
instead of using the structured tool_calls JSON format that PydanticAI expects.
This module detects, parses, and cleans that markup so the agent works
correctly regardless of which LLM provider is being used.

Supported markup formats:
- DeepSeek DSML: <｜｜DSML｜｜tool_calls>...<｜｜DSML｜｜invoke>...
- Generic XML:  <tool_call>{"name": "...", "arguments": {...}}</tool_call>
- JSON in code fence: ```tool_call\n{...}\n```
"""

import re
import json
import logging
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)

# ── Regex patterns ──────────────────────────────────────────────────────────────

# Matches either fullwidth ｜ (U+FF5C) or regular | (U+007C)
_P = r'[\uff5c|]'

# Full DSML tool_calls block
_DSML_BLOCK_RE = re.compile(
    rf'<{_P}{{2}}DSML{_P}{{2}}\s*tool_calls\s*>'
    rf'.*?'
    rf'</{_P}{{2}}DSML{_P}{{2}}\s*tool_calls\s*>',
    re.DOTALL
)

# Individual invoke block inside DSML
_DSML_INVOKE_RE = re.compile(
    rf'<{_P}{{2}}DSML{_P}{{2}}\s*invoke\s+name="([^"]+)"\s*>'
    rf'(.*?)'
    rf'</{_P}{{2}}DSML{_P}{{2}}\s*invoke\s*>',
    re.DOTALL
)

# Parameter inside an invoke block
_DSML_PARAM_RE = re.compile(
    rf'<{_P}{{2}}DSML{_P}{{2}}\s*parameter\s+name="([^"]+)"[^>]*>'
    rf'(.*?)'
    rf'</{_P}{{2}}DSML{_P}{{2}}\s*parameter\s*>',
    re.DOTALL
)

# Any stray DSML tag (for final cleanup)
_DSML_ANY_TAG_RE = re.compile(
    rf'</?{_P}{{2}}DSML{_P}{{2}}\s*\w+[^>]*>'
)

# Generic <tool_call>JSON</tool_call> pattern (used by some models)
_XML_TOOL_CALL_RE = re.compile(
    r'<tool_call>\s*(.*?)\s*</tool_call>',
    re.DOTALL
)

# JSON tool call in code fence: ```tool_call\n{...}\n``` or ```tool_use\n{...}\n```
_JSON_FENCE_RE = re.compile(
    r'```(?:tool_call|tool_use)\s*\n(\{.*?\})\s*\n```',
    re.DOTALL
)


@dataclass
class ParsedToolCall:
    """A tool call parsed from raw LLM markup."""
    tool_name: str
    arguments: Dict[str, Any]
    raw_match: str  # The full raw text that was matched (for logging)


def sanitize_response(text: str) -> Tuple[str, Optional[ParsedToolCall]]:
    """
    Scans agent text output for raw tool-call markup from various LLMs.

    Returns:
        (cleaned_text, parsed_tool_call_or_None)

    If a tool call is found, it is extracted and returned separately.
    The cleaned_text has all markup removed.
    """
    if not text:
        return text, None

    parsed_tool: Optional[ParsedToolCall] = None

    # ── 1. Try DeepSeek DSML ────────────────────────────────────────────────
    dsml_match = _DSML_BLOCK_RE.search(text)
    if dsml_match:
        raw_block = dsml_match.group(0)
        logger.info(f"[Sanitizer] Detected DeepSeek DSML tool-call markup ({len(raw_block)} chars)")

        invoke_match = _DSML_INVOKE_RE.search(raw_block)
        if invoke_match:
            tool_name = invoke_match.group(1).strip()
            invoke_body = invoke_match.group(2)

            # Parse all parameters from the invoke body
            args: Dict[str, Any] = {}
            for param_match in _DSML_PARAM_RE.finditer(invoke_body):
                param_name = param_match.group(1).strip()
                param_value = param_match.group(2).strip()
                args[param_name] = param_value

            if tool_name and args:
                parsed_tool = ParsedToolCall(
                    tool_name=tool_name,
                    arguments=args,
                    raw_match=raw_block
                )
                logger.info(f"[Sanitizer] Parsed DSML → {tool_name}({list(args.keys())})")

        # Remove the DSML block from text
        text = text[:dsml_match.start()] + text[dsml_match.end():]

    # ── 2. Try generic XML <tool_call> ──────────────────────────────────────
    if not parsed_tool:
        xml_match = _XML_TOOL_CALL_RE.search(text)
        if xml_match:
            raw_block = xml_match.group(0)
            logger.info(f"[Sanitizer] Detected XML <tool_call> markup")
            try:
                payload = json.loads(xml_match.group(1))
                tool_name = payload.get("name") or payload.get("function", "")
                args = payload.get("arguments") or payload.get("parameters") or {}
                if isinstance(args, str):
                    args = json.loads(args)
                if tool_name:
                    parsed_tool = ParsedToolCall(
                        tool_name=tool_name, arguments=args, raw_match=raw_block
                    )
                    logger.info(f"[Sanitizer] Parsed XML → {tool_name}")
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning(f"[Sanitizer] Failed to parse XML tool_call JSON: {e}")
            text = text[:xml_match.start()] + text[xml_match.end():]

    # ── 3. Try JSON in code fence ───────────────────────────────────────────
    if not parsed_tool:
        fence_match = _JSON_FENCE_RE.search(text)
        if fence_match:
            raw_block = fence_match.group(0)
            logger.info(f"[Sanitizer] Detected fenced tool_call JSON")
            try:
                payload = json.loads(fence_match.group(1))
                tool_name = payload.get("name") or payload.get("function", "")
                args = payload.get("arguments") or payload.get("parameters") or {}
                if isinstance(args, str):
                    args = json.loads(args)
                if tool_name:
                    parsed_tool = ParsedToolCall(
                        tool_name=tool_name, arguments=args, raw_match=raw_block
                    )
                    logger.info(f"[Sanitizer] Parsed fenced JSON → {tool_name}")
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning(f"[Sanitizer] Failed to parse fenced tool_call JSON: {e}")
            text = text[:fence_match.start()] + text[fence_match.end():]

    # ── 4. Final cleanup — strip any stray/partial tags ─────────────────────
    text = _strip_stray_markup(text)

    return text, parsed_tool


def _strip_stray_markup(text: str) -> str:
    """Remove any partial/stray LLM markup fragments that survived parsing."""
    # Remove stray DSML tags
    text = _DSML_ANY_TAG_RE.sub('', text)
    # Remove stray <tool_call> / </tool_call> tags
    text = re.sub(r'</?tool_call>', '', text)
    # Remove stray <tool_use> / </tool_use> tags
    text = re.sub(r'</?tool_use>', '', text)
    # Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
