#!/usr/bin/env python3
"""check-memory-budget.py — FAIL when the injected MEMORY.md crosses its own stated budget.

WHY THIS EXISTS
  MEMORY.md is the memory that is INJECTED every turn. It has a hard ceiling, and crossing
  it is SILENT: the tail is dropped, so rules simply stop existing for the agent. Nothing
  errors and nothing warns — a rule that was "known" one session is gone the next, and the
  only symptom is an agent repeating a mistake the file already documented.

  Measured 2026-10-15: it sat at 9,396 chars against a 9,190 budget — 206 OVER — and nobody
  had noticed. The drift is invisible by construction, so it needs a gate rather than care.

WHAT IT ASSERTS
  1. the char count is within the budget, and
  2. the end-of-memory SENTINEL is the last non-empty line.

  (2) is the truncation detector the file's own header names: if the sentinel is absent from
  what you read, the injection was cut short.

⚠⚠ THE BUDGET IS READ FROM THE FILE, NEVER HARD-CODED HERE.
  The number lives in MEMORY.md's own header, which is the authority. A second copy in this
  script would be a rule in two places (MASTER_SYSTEM_SPEC.md §4) and the two would drift —
  the gate would then police a budget nobody uses. If the header cannot be parsed that is a
  FAILURE, not a pass: a gate that cannot see its subject must not report green.

⚠ CHARS, not bytes. The header says so explicitly and the difference is real — this file is
  full of ⚠ and box-drawing characters that cost 3 bytes but 1 char.

USAGE
  python scripts/check-memory-budget.py
  python scripts/check-memory-budget.py --verbose
  python scripts/check-memory-budget.py --repo <path>       # check a sibling repo's memory
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

BUDGET_RE = re.compile(r"stay\s*\*\*[^\d]*([\d,]+)\s*\*\*")
SENTINEL = "END-OF-MEMORY SENTINEL"

OK = "  ok      "
BAD = "  FAIL    "


def read_text(path: Path) -> str:
    """Read as text WITHOUT newline translation.

    ⚠ newline='' matters: the memory files carry a mix of line endings, and a translating
    read would silently rewrite the count. Rule 21 in the same file — a text-mode read of a
    file with lone CRs reports a length that is not the file's.
    """
    with io.open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def check(repo: Path, verbose: bool) -> int:
    memory_dir = repo / ".workbuddy-ai" / "memory"
    index = memory_dir / "MEMORY.md"
    appendix = memory_dir / "MEMORY-APPENDIX.md"

    print(f"repo      : {repo}")
    print(f"index     : {index}")

    if not index.is_file():
        print(f"{BAD}MEMORY.md not found — a gate with no subject must not report green")
        return 1

    text = read_text(index)

    # ── 1. the budget, read from the file's own header ───────────────────────
    match = BUDGET_RE.search(text)
    if not match:
        print(f"{BAD}no budget found in the header — expected 'stay **<= N**'")
        print("          a gate that cannot see its subject must not report green")
        return 1

    budget = int(match.group(1).replace(",", ""))
    size = len(text)
    headroom = budget - size
    print(f"budget    : {budget:,} chars  (read from MEMORY.md's own header)")

    failed = False

    if size > budget:
        print(f"{BAD}{size:,} chars — OVER by {abs(headroom):,}")
        print("          remedy: MOVE a section to MEMORY-APPENDIX.md — never delete a rule.")
        print("          Re-run scripts/check-memory-budget.py afterwards.")
        failed = True
    else:
        print(f"{OK}{size:,} chars — {headroom:,} headroom")

    # ── 2. the sentinel must be in the FINAL block ─────────────────────────
    # ⚠ The sentinel is a WRAPPED COMMENT BLOCK: the token sits on the FIRST of its two
    #   lines, and the file's last line is the continuation. Asserting "the token is on the
    #   last line" was this gate's own first bug — it reported a FALSE RED on a healthy
    #   file, which is the one failure mode a gate must never have. Assert the final BLOCK.
    lines = [ln for ln in text.splitlines() if ln.strip()]
    tail = lines[-3:]
    if any(SENTINEL in ln for ln in tail):
        print(f"{OK}sentinel present in the final block (last {len(tail)} non-empty line(s))")
    else:
        print(f"{BAD}sentinel is NOT in the final block — the tail would be dropped on injection")
        print(f"          last non-empty line: {(lines[-1] if lines else '')[:90]!r}")
        failed = True

    # ── 3. every appendix anchor the index cites must resolve ───────────────
    if appendix.is_file():
        appendix_text = read_text(appendix)
        anchors = sorted(set(re.findall(r"APPENDIX\s+`([^`]+)`", text)))
        missing = [a for a in anchors if a not in appendix_text]
        if missing:
            print(f"{BAD}{len(missing)} appendix anchor(s) resolve to nothing: {missing}")
            print("          an index that points at a missing section reads as documented")
            print("          while being unreadable — worse than an oversized index.")
            failed = True
        else:
            print(f"{OK}{len(anchors)} appendix anchor(s) resolve")
        if verbose:
            for a in anchors:
                print(f"            {a}")
    else:
        print(f"{BAD}MEMORY-APPENDIX.md not found — the index's pointers cannot resolve")
        failed = True

    print()
    if failed:
        print("VERDICT: FAIL")
        return 1
    print("VERDICT: PASS")
    return 0


def main() -> int:
    default_repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", default=str(default_repo),
                        help="repo whose .workbuddy-ai/memory/MEMORY.md to check")
    parser.add_argument("--verbose", action="store_true", help="list every anchor")
    args = parser.parse_args()
    return check(Path(args.repo).resolve(), args.verbose)


if __name__ == "__main__":
    sys.exit(main())
