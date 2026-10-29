"""Does the compiler-error annotator put each diagnostic on the RIGHT user line?

WHY THIS EXISTS (2026-10-29)
    A reviewer sent this snippet, whose real errors are on lines 5 and 6:

        1  // identity / orientation
        2  GetElements<FamilyInstance>("Doors").Select(d => new { d.Id, Family = ... }).Table();
        3  // grouping / aggregation
        4  GetElements<Wall>().GroupByParam("Type Name").Table();
        5  GetElements<Wall>().SumParam("Area", "m2").ToString().Println();
        6  GetElements<Wall>().SumParam("Volume", "m3").ToString().Println();
        7  // filter
        8  Println("x");

    The engine reported 7 and 8, and the "your line 7" excerpt quoted `// filter`.

    ROOT CAUSE, measured: `PipelineTrackingRewriter` built the wrapped call from
    `node.ToFullString()` — which ALREADY contains the node's leading trivia — and then
    re-applied `.WithLeadingTrivia(node.GetLeadingTrivia())`, so a comment above a wrapped
    call was emitted TWICE. Each duplicate adds a newline, and the REPL renumbers with a
    SINGLE `#line 1 "script"` anchor, so every later diagnostic shifted by one per comment.
    Dose-response, live against TestModel: 1 comment -> +1, 2 comments -> +2, 0 -> +0.
    Fixed in the rewriter; this gate protects the OTHER half — the Python annotator that
    renders the snippet back to the agent.

⚠ TWO-SIDED BY CONSTRUCTION. A mapper that "corrects" a batch that was already right is a
  new defect, not a fix. Every shifted case is paired with an unshifted one that must be
  left alone.

⚠ OFFLINE AND DETERMINISTIC — no Revit, no exe, no network. It imports the annotator and
  feeds it the exact strings the engine produced.

USAGE
    python scripts/check-diag-mapper.py          exit 0 = all cases behave
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MCP = os.path.join(os.path.dirname(HERE), "mcp")
sys.path.insert(0, MCP)

from mcp_core.tool_helpers import _annotate_compile_errors  # noqa: E402

MSG = ("'string' does not contain a definition for 'Println' and no accessible extension "
       "method 'Println' accepting a first argument of type 'string' could be found")

REVIEWER_SRC = """// identity / orientation
GetElements<FamilyInstance>("Doors").Select(d => new { d.Id, Family = d.FamilyName() }).Table();
// grouping / aggregation
GetElements<Wall>().GroupByParam("Type Name").Table();
GetElements<Wall>().SumParam("Area", "m2").ToString().Println();
GetElements<Wall>().SumParam("Volume", "m3").ToString().Println();
// filter
Println("x");"""

# (label, diagnostic text, source, lines that MUST be named, lines that must NOT be)
CASES = [
    (
        "the reviewer's case: shifted +2, both lines IN range",
        "script(7,56): error CS1061: %s\nscript(8,58): error CS1061: %s" % (MSG, MSG),
        REVIEWER_SRC,
        ["your line 5:", "your line 6:"],
        ["your line 7:", "your line 8:"],
    ),
    (
        "already correct: a +0 batch must NOT be moved",
        "script(5,56): error CS1061: %s" % MSG,
        REVIEWER_SRC,
        ["your line 5:"],
        ["your line 3:", "your line 7:"],
    ),
    (
        "legacy engine: no filename, +2 prelude",
        "(7,5): error CS0103: The name 'foo' does not exist",
        "a\nb\nc\nd\ne",
        ["your line 5:"],
        ["your line 7:"],
    ),
    (
        "past the end of the snippet: +2",
        "script(10,3): error CS1002: ; expected",
        REVIEWER_SRC,
        ["your line 8:"],
        ["your line 10:"],
    ),
    (
        "a caret past the end of the line is impossible, so the batch is shifted",
        "script(6,58): error CS1061: %s" % MSG,
        'x\ny\nz\nGetElements<Wall>().SumParam("Area", "m2").ToString().Println();\n'
        '// note\nPrintln("b");',
        ["your line 4:"],
        ["your line 6:"],
    ),
]


def main() -> int:
    if not CASES:
        # An empty case list cannot fail, so it must not pass.
        print("GATE FAILED: no cases — this gate has lost its subject")
        return 1

    failures = 0
    for label, err, src, want, forbid in CASES:
        out = _annotate_compile_errors(err, src) or ""
        missing = [w for w in want if w not in out]
        leaked = [f for f in forbid if f in out]
        if missing or leaked:
            failures += 1
            print("  FAIL %s" % label)
            if missing:
                print("       missing %r" % missing)
            if leaked:
                print("       must not name %r" % leaked)
            for line in out.splitlines():
                print("       | %s" % line)
        else:
            print("  ok   %s" % label)

    # The annotator must also stay quiet when there is nothing to annotate — a stray
    # header on a successful run would be noise on every call.
    if _annotate_compile_errors("", REVIEWER_SRC) is not None:
        failures += 1
        print("  FAIL empty diagnostic text produced a header")

    print()
    if failures:
        print("%d case(s) wrong — the agent would be pointed at the wrong source line" % failures)
        return 1
    print("all %d cases map to the right line" % len(CASES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
