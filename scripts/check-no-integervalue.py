#!/usr/bin/env python3
"""GATE — no live runtime C# source may name `ElementId.IntegerValue`.

WHY THIS EXISTS (2026-11-06, Revit 2027):
  Revit 2027 REMOVED get_IntegerValue(). `ElementId.Value` (a long) is the API on
  2025, 2026 and 2027 alike. A compiled call to get_IntegerValue() throws
  MissingMethodException as soon as the CONTAINING METHOD is JIT-bound — even on
  an untaken branch. That is why `NewDemo/MassEdit` failed in 2027 with
  "Method not found: Int32 Autodesk.Revit.DB.ElementId.get_IntegerValue()"
  although the gallery script itself contained no such text: the token was in
  CoreScript.Engine.dll, inside GetNum / GetStr / _describeElement.

  Editing only the visible script therefore makes the error "keep coming back".
  This gate scans the places that actually ship or get compiled at runtime.

RULE 3 (GATE DISCIPLINE):
  * An EMPTY scan must FAIL. Every root declares a minimum file count, and a
    MISSING root is a red, never a skip.
  * `--prove-teeth` proves the detector can still see the token.
  * Historical snapshots are deliberately OUT OF SCOPE: BGR/_chk_backup_*,
    _scratch/, _probecompile/, Release-Notes-*.md and Docs/TAKEOFF_SPEC.md record
    what the code USED to be. Rewriting those would destroy the record (rule 25).
  * Prose/instruction files are OUT OF SCOPE — they must be allowed to NAME the
    forbidden API in order to forbid it (scripts.instructions.md does exactly that).
"""

import sys
from pathlib import Path

TOKEN = "IntegerValue"
WORKSPACE = Path(__file__).resolve().parents[2]  # <root>/paracore/scripts/x.py -> <root>

# (label, relative root, glob, minimum files, recursive, excluded path parts)
ROOTS = [
    ("engine",            "paracore/CoreScript.Engine",                  "*.cs",                 50, True,  ("bin", "obj")),
    ("takeoff checkers",  "paracore-takeoff/checker",                    "CHK-*.cs",              9, False, ()),
    ("checker probe",     "paracore-takeoff/checker/_chkprobe",          "Probe.cs",              1, False, ()),
    ("takeoff snapshot",  "paracore-takeoff/takeoff",                    "snapshot.cs",           1, False, ()),
    ("takeoff Docs",      "paracore-takeoff/Docs",                       "*.cs",                 10, False, ()),
    ("family template",   "paracore-family/skills/family-authoring",     "build-template.cs",     1, False, ()),
    ("gallery scripts",   "paracore-gallery",                            "*.cs",                 10, True,  ("bin", "obj")),
]


def find(root: Path, pattern: str, recursive: bool, excluded) -> list[Path]:
    it = root.rglob(pattern) if recursive else root.glob(pattern)
    return sorted(p for p in it if p.is_file() and not any(x in p.parts for x in excluded))


def hits(path: Path) -> list[tuple[int, str]]:
    out = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [(-1, "UNREADABLE: %s" % e)]
    for i, line in enumerate(text.splitlines(), 1):
        if TOKEN in line:
            out.append((i, line.strip()[:160]))
    return out


def main() -> int:
    if "--prove-teeth" in sys.argv:
        # The detector must still recognise the exact token it is named after.
        assert TOKEN in "return e.Id.IntegerValue;", "detector anchor rotted"
        assert TOKEN not in "return e.Id.Value;", "detector false-positives on .Value"
        print("teeth: detector sees the token and ignores the replacement")
        return 0

    scanned = 0
    offenders: list[str] = []
    problems: list[str] = []

    for label, rel, pattern, minimum, recursive, excluded in ROOTS:
        root = WORKSPACE / rel
        if not root.is_dir():
            problems.append("MISSING ROOT %-18s %s — cannot look, not a pass" % (label, root))
            continue
        files = find(root, pattern, recursive, excluded)
        if len(files) < minimum:
            problems.append("EMPTY/PARTIAL SCAN %-18s found %d files, need >= %d at %s"
                            % (label, len(files), minimum, root))
        scanned += len(files)
        for f in files:
            for lineno, text in hits(f):
                offenders.append("%s:%s  %s" % (f.relative_to(WORKSPACE), lineno, text))

    print("no-integervalue: scanned %d live C# files across %d roots" % (scanned, len(ROOTS)))

    if problems:
        for p in problems:
            print("  CANNOT LOOK  " + p)
        return 2
    if offenders:
        print("  FAIL — %d live source line(s) still name %s:" % (len(offenders), TOKEN))
        for o in offenders[:40]:
            print("    " + o)
        print("  Use ElementId.Value (a long); widen int containers to long.")
        return 1

    print("  PASS — zero %s in live runtime C# sources" % TOKEN)
    return 0


if __name__ == "__main__":
    sys.exit(main())
