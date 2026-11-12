#!/usr/bin/env python3
"""GATE — the two-channel Revit warning rule reaches EVERY write-capable MCP.

Why this exists
---------------
A Revit failure arrives on one of two channels:

  1. a BLOCKING modal dialog, answered and reported by the Dialog Watcher;
  2. a PERSISTENT (reviewable) warning, stored in the document and read with
     `Doc.GetWarnings()`. It can be a NON-BLOCKING panel or appear with NO DIALOG
     AT ALL, so no dialog detector can ever be a complete answer.

The agent's awareness of both is ONE existing feature. The rule is delivered on
two channels too, because Forge builds its own `FastMCP` and does not take the
shared core's `COMMON_RULES`:

  * `paracore-mcp-core/mcp_core/server.py` COMMON_RULES -> gen / model / family
    (all three call `create_server`);
  * `paracore-forge/forge_server.py` `instructions=` literal + the verification
    prompt/skill -> forge.

`paracore-takeoff` is deliberately EXCLUDED: it is a deterministic, read-only
quantity server with no code execution, builds its own `FastMCP`, and takes
neither COMMON_RULES nor the shared skills. This gate asserts that exclusion so
the rule cannot be copied into it by accident.

⚠ An EMPTY or MISSING scan FAILS. `--prove-teeth` runs the same evaluator over
mutated in-memory copies (no file is touched) to prove each anchor can bite.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent.parent

REQUIRED = {
    "core": "paracore-mcp-core/mcp_core/server.py",
    "gen": "paracore-gen/mcp_server.py",
    "model": "paracore-model/mcp_server.py",
    "family": "paracore-family/mcp_server.py",
    "forge": "paracore-forge/forge_server.py",
    "forge_prompt": "paracore-forge/forge_core/prompts/verification.md",
    "forge_skill": "paracore-forge/skills/verification/SKILL.md",
    "takeoff": "paracore-takeoff/takeoff/takeoff_server.py",
}

# The rule ITSELF, not just a heading: a rewrite that keeps the heading but drops
# the recipe must fail. Anchors are matched against whitespace-normalised text.
COMMON_ANCHORS = (
    "TWO CHANNELS FOR A REVIT FAILURE",
    "BLOCKING MODAL DIALOG",
    "PERSISTENT (REVIEWABLE) WARNING",
    "NON-BLOCKING",
    "NO DIALOG AT ALL",
    "REVIT SHOWED A DIALOG WHILE THIS CALL RAN",
    "WARNINGS ARE DOCUMENT DATA",
    "Doc.GetWarnings()",
    "GetDescriptionText()",
    "GetFailingElements()",
    "e.Value",
    "BEFORE the first",
    "COUNTS PER DESCRIPTION",
    "ADJUST AND RE-RUN",
    "IFailuresPreprocessor",
    "NEVER suppress a failure",
)

FORGE_INSTRUCTION_ANCHORS = (
    "CHECK WARNINGS AFTER EVERY WRITE",
    "PERSISTENT (REVIEWABLE)",
    "NON-BLOCKING",
    "NO DIALOG AT ALL",
    "Doc.GetWarnings()",
    "GetDescriptionText()",
    "GetFailingElements()",
    "BEFORE the first",
    "COUNTS PER",
    "ADJUST AND RE-RUN",
    "IFailuresPreprocessor",
)

FORGE_PROMPT_ANCHORS = (
    "PERSISTENT (REVIEWABLE) WARNING",
    "NON-BLOCKING",
    "NO DIALOG AT ALL",
    "Doc.GetWarnings()",
    "COUNTS PER",
    "GetDescriptionText()",
    "GetFailingElements()",
    "e.Value",
    "BEFORE the first",
    "ADJUST AND RE-RUN",
    "IFailuresPreprocessor",
    "NEVER suppress a failure",
)


def flat(text: str) -> str:
    return " ".join(text.split())


def collect() -> dict[str, str]:
    texts: dict[str, str] = {}
    for key, rel in REQUIRED.items():
        path = WORKSPACE / rel
        texts[key] = path.read_text(encoding="utf-8") if path.is_file() else ""
    return texts


def forge_instructions_literal(text: str) -> str:
    """Only the guaranteed channel, not the comments around it."""
    m = re.search(r'instructions="""(.*?)"""', text, re.S)
    return m.group(1) if m else ""


def skill_body(text: str) -> str:
    """Strip the YAML frontmatter from a skill mirror."""
    parts = text.split("---", 2)
    return parts[-1] if len(parts) == 3 else ""


def evaluate(texts: dict[str, str]) -> list[str]:
    problems: list[str] = []

    # ⚠ An empty scan must FAIL — a missing file is not "no violation".
    for key, rel in REQUIRED.items():
        if len(texts.get(key, "").strip()) < 200:
            problems.append(f"EMPTY/MISSING subject: {rel} — cannot prove anything")

    core = flat(texts.get("core", ""))
    for anchor in COMMON_ANCHORS:
        if anchor not in core:
            problems.append(f"COMMON_RULES lost the warning rule: {anchor!r}")

    # gen / model / family take COMMON_RULES through create_server. A server that
    # silently stops calling it drops the whole rule without editing the core.
    for key in ("gen", "model", "family"):
        if "create_server(DOMAIN)" not in texts.get(key, ""):
            problems.append(f"{key}: no longer calls create_server — COMMON_RULES not delivered")

    instr = flat(forge_instructions_literal(texts.get("forge", "")))
    if not instr:
        problems.append("forge: instructions= literal not found — the guaranteed channel is gone")
    for anchor in FORGE_INSTRUCTION_ANCHORS:
        if anchor not in instr:
            problems.append(f"forge instructions lost the warning rule: {anchor!r}")

    prompt = flat(texts.get("forge_prompt", ""))
    for anchor in FORGE_PROMPT_ANCHORS:
        if anchor not in prompt:
            problems.append(f"forge verification prompt lost the warning rule: {anchor!r}")

    # `GetFailingElements()` returns IList<ElementId>, NOT Element. `.Id.Value`
    # does not compile; the recipe must teach `e.Value`.
    for key in ("core", "forge_prompt"):
        if ".Id.Value" in texts.get(key, ""):
            problems.append(f"{key}: teaches .Id.Value on a GetFailingElements() ElementId")

    # The on-demand skill is a manual mirror; a divergence teaches two loops.
    if skill_body(texts.get("forge_skill", "")).strip() != texts.get("forge_prompt", "").strip():
        problems.append("forge: verification skill no longer mirrors the prompt section")

    # TakeOff is EXCLUDED by construction. Assert the exclusion, not just its absence.
    takeoff = texts.get("takeoff", "")
    if "create_server(" in takeoff:
        problems.append("takeoff: now calls create_server — would inherit a write-rule it does not need")
    if "build_instructions(" in takeoff:
        problems.append("takeoff: now uses build_instructions — would inherit COMMON_RULES")
    if "CHECK WARNINGS AFTER EVERY WRITE" in takeoff:
        problems.append("takeoff: the write-only warning rule was copied into a read-only server")

    return problems


def prove_teeth(texts: dict[str, str]) -> list[str]:
    """Run the SAME evaluator on mutated in-memory copies. No file is touched."""
    failures: list[str] = []
    for label, key, old, new in (
        ("COMMON_RULES rule", "core", "WARNINGS ARE DOCUMENT DATA", "REMOVED"),
        ("forge instructions", "forge", "CHECK WARNINGS AFTER EVERY WRITE", "REMOVED"),
        ("forge prompt", "forge_prompt", "Doc.GetWarnings()", "REMOVED"),
        ("skill mirror", "forge_skill", "the six checks", "REMOVED"),
        ("create_server wiring", "gen", "create_server(DOMAIN)", "REMOVED"),
        ("takeoff exclusion", "takeoff", "TAKEOFF_SYSTEM_PROMPT",
         "CHECK WARNINGS AFTER EVERY WRITE\nTAKEOFF_SYSTEM_PROMPT"),
    ):
        mutated = dict(texts)
        mutated[key] = texts.get(key, "").replace(old, new, 1)
        if not evaluate(mutated):
            failures.append(f"teeth: {label} mutation was NOT detected")
    # A missing subject must fail too.
    mutated = dict(texts)
    mutated["core"] = ""
    if not evaluate(mutated):
        failures.append("teeth: an EMPTY scan was NOT detected")
    return failures


def main() -> int:
    texts = collect()
    if "--prove-teeth" in sys.argv:
        failures = prove_teeth(texts)
        for f in failures:
            print("  FAIL", f)
        print(f"\n{'FAIL' if failures else 'PASS'} — teeth prover: "
              f"{len(failures)} blind spot(s)")
        return 1 if failures else 0

    problems = evaluate(texts)
    for p in problems:
        print("  FAIL", p)
    print(f"\n{'FAIL' if problems else 'PASS'} — warning-awareness: "
          f"{len(REQUIRED)} subjects, {len(COMMON_ANCHORS) + len(FORGE_INSTRUCTION_ANCHORS) + len(FORGE_PROMPT_ANCHORS)} "
          f"anchors, 3 create_server consumers, takeoff excluded, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
