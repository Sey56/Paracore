#!/usr/bin/env python3
"""check-skill-snippets.py - compile-gate every ```csharp fence in EVERY MCP's skill tree.

WHY THIS EXISTS
  A skill `.md` is PROSE. Nothing compiles it, nothing type-checks it, no test can fail on
  it. So a recipe can carry C# that does not compile - indefinitely, silently - and every
  agent that follows it pays the same error, forever. Found 2026-10-11 by executing the
  recipes end to end on a real drawing:

    * annotations-dimensions  `t.TagOrientation = TagOrientation.Vertical` on a RoomTag
        -> CS0266. TWO enums share the member name `TagOrientation`:
             SpatialElementTag.TagOrientation  -> SpatialElementTagOrientation
                                                  (Horizontal | Model | Vertical)
             IndependentTag.TagOrientation     -> TagOrientation
                                                  (Horizontal | Vertical | AnyModelDirection)
           The skill cited a reflection proof on `IndependentTag` and applied it to RoomTag.
    * project-modeling  `w.Description` on a FailureMessage -> CS1061 (`GetDescriptionText()`).
    * project-modeling  `scope.StartTransaction(...)` -> does not exist (`Start(...)`).
    * project-modeling  `bb.Min.OutputUnit("mm")` -> CS1929 (`Min` is an XYZ, not a double).
    * parameter-access  `el.Location.Point` -> CS1061 (`Point` is on `LocationPoint`).
    * identity-orientation  `door.IsHandFlipped` -> a METHOD, not a property.
    * display-visualize  fences whose bodies are chain SUFFIXES (`.WhereParam(...).Table()`)
        and elisions (`new { ... }`) - not C# at all, but tagged ```csharp.
    * family-authoring / massing-forms  fences that are SIGNATURE TABLES
        (`void Set(FamilyParameter p, double value);`) - also not C#.

WHY IT IS CROSS-REPO (and not a per-repo gate)
  The nine shared skills live ONCE, in the shared MCP core (`paracore/mcp/mcp_core/skills/`),
  and every specialist carries its own domain skills alongside them. A gate installed in one
  specialist sees one copy of the shared set - the other repos keep the defect, which is
  exactly how the eight defects above survived. One gate, all repos.
  Authority: MASTER_SYSTEM_SPEC.md §3.

WHY THE ERROR CODES ARE SPLIT (the soundness argument)
  A fence is usually a FRAGMENT: it mentions `wall`, `refs`, `d` that the surrounding prose
  implies but the fence never declares. Compiled alone those are CS0103 - an artefact of
  extraction, not a defect - so CS0103 is TOLERATED.

  A real API defect is different: it fires only where the receiver's TYPE is known.
  `foreach (var t in GetElements<RoomTag>()) t.TagOrientation = ...` declares `t` as
  `RoomTag` from the engine signature (PipelineEnumerable<T> : IEnumerable<T>), so the
  CS0266 fires. Roslyn SUPPRESSES member errors on unresolved receivers, so a tolerated
  CS0103 can never mask a CS1061 / CS0266 / CS0019 - the two sets are disjoint. That is what
  makes this gate sound rather than merely noisy.

  ⚠⚠ A NON-C# BLOCK IS THE OTHER FAILURE MODE — a TAGGING defect, not an API defect. A fence
  whose every line is a member declaration (`void Set(FamilyParameter p, double value);`,
  `int ProfileCount { get; }`) is a SIGNATURE TABLE quoted from the vendor doc, not a runnable
  snippet. It can never compile, so the remedy is to RE-TAG it ```text — never to widen
  TOLERATED. Measured 2026-10-11: 14 such tables in paracore-family's two domain skills.
  ⚠ The gate reported only 10 of them, because a table written as PROPERTIES emits CS1002
  alone (see the CS1002 note in TOLERATED). So do not wait for this gate to find a signature
  table: tag it `text` when you write it.

  ⚠⚠ THE HOST IS NOT ALWAYS A METHOD BODY. A fence is compiled in the ONE legal host its shape
  needs — `usings` / `script` / `member` / `method`, decided by `host_for`. `using X;` is legal
  only at the top of a compilation unit, `public class Params { … }` only at the top level, and
  `public double X { get; }` only as a class member. Every one of those is VALID C# that is
  ILLEGAL inside a method, so emitting them all as method bodies made the gate report its OWN
  limitation as a product defect — measured 2026-10-14, that was ALL 15 of `paracore-forge`'s
  findings. See `host_for` for the full argument.

  ⚠ A TOOTHLESS GATE IS WORSE THAN NO GATE. If the engine prelude fails to resolve
  (`GetElements` unresolved -> `RoomTag` becomes an error type -> the CS0266 is SUPPRESSED),
  the gate would go GREEN on the very defect it was built for. Guards:
    (a) diagnostics that land BEFORE the first fence are a HARNESS error, never a pass;
    (b) `--selftest` compiles each KNOWN-BAD fence against its KNOWN-GOOD control and asserts
        the classifier splits them - a gate that cannot reproduce the known defect FAILS;
    (c) `--selftest` also asserts the NORMALIZER's invariants (see below);
    (d) an EMPTY scan FAILS - a gate that silently finds nothing is not a gate.

  ⚠ SYNTAX ERRORS CORRUPT THEIR NEIGHBOURS. One unbalanced brace (or one pseudo-code fence)
  makes Roslyn absorb every fence after it, so diagnostics land on the wrong fence. When any
  syntax-class error (CS1xxx / CS8xxx) is seen, the gate re-compiles EVERY fence in isolation
  so attribution is exact. A clean tree stays at one build — plus one build per fence whose host
  is the COMPILATION UNIT (`usings` / `script`): a `using` directive is file-wide and cannot be
  scoped, and two whole programs cannot share a unit. See `host_for` and `collect`.

  ⚠⚠ THE NORMALIZER IS THE HARD PART, and it was wrong FOUR times - each time the gate's own
  output caught it. It turns a fragment into a method body by terminating statements, so:
    * a line followed by `.` must NOT be terminated (a fluent chain split across lines);
    * a line followed by `{` must NOT be terminated (a local function / block header);
    * a line followed by `}` must be terminated inside a BLOCK but NOT inside an INITIALIZER
      (`new { ... }`) - the two are indistinguishable from the next line, so the brace stack
      is tracked;
    * the `;` must land BEFORE a trailing comment, or the comment swallows it.
  Measured before those fixes: 118 CS1002 (lines never type-checked at all), then 92 CS1002
  across 31 fences, then a spurious `;` inside `new { ... }`, then CS8112 on a valid local
  function. `--selftest` now pins all four.

usage:
    python scripts/check-skill-snippets.py                    # gate every repo
    python scripts/check-skill-snippets.py --selftest          # prove the gate has teeth
    python scripts/check-skill-snippets.py --repo <dir>        # gate one repo only
    python scripts/check-skill-snippets.py --dump              # print the generated .cs path

exit: 0 green | 1 findings | 2 harness error
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # paracore/scripts
PARACORE = HERE.parent                          # paracore
ROOT = PARACORE.parent                          # the sibling root
BUILD_DIR = HERE / "_snippetbuild"

REVIT_DIR = Path(os.environ.get("PARACORE_REVIT_DIR", r"C:\Program Files\Autodesk\Revit 2025"))
ENGINE_CANDIDATES = [
    Path(os.environ["PARACORE_ENGINE_DLL"]) if os.environ.get("PARACORE_ENGINE_DLL") else None,
    PARACORE / "CoreScript.Engine" / "bin" / "Debug" / "net8.0-windows" / "win-x64" / "CoreScript.Engine.dll",
    PARACORE / "CoreScript.Engine" / "bin" / "Release" / "net8.0-windows" / "win-x64" / "CoreScript.Engine.dll",
]

# ── Error classification ─────────────────────────────────────────────────────────────
# TOLERATED = artefacts of compiling a fragment out of context. Each is a statement about
# the EXTRACTOR, not about the API, so it must never turn the gate red.
TOLERATED = {
    "CS0103",  # name does not exist in the current context  (the fragment's free variables)
    "CS0201",  # only assignment/call/increment/... can be used as a statement
    "CS0165",  # use of unassigned local variable
    "CS0161",  # not all code paths return a value
    "CS0128",  # a local named X is already defined in this scope
    "CS0136",  # a local cannot be declared in this scope (shadowing)
    "CS0127",  # void method, return with a value
    "CS0126",  # object-returning method, bare return
    # ⚠ CS1002 ("; expected") is deliberately NOT tolerated — it used to be, on the grounds that
    # "a fence may show an expression without its terminator". `normalize()` now SUPPLIES that
    # terminator, so the exemption outlived its reason — and it was hiding a whole class of
    # defect. Measured 2026-10-11: a SIGNATURE TABLE written as PROPERTIES
    # (`int ProfileCount { get; }`) emits ONLY CS1002, nothing else, so it passed silently —
    # while the same table written as bodyless METHODS (`void Set(FamilyParameter p, double
    # value);`) was flagged via CS8112. That asymmetry is why 4 of the 14 signature tables in
    # paracore-family were never reported. A fence yielding CS1002 is malformed C# and can never
    # be a runnable snippet: it must be fixed or re-tagged, never tolerated. Pinned by --selftest.
    "CS8803",  # top-level statements must precede declarations
    "CS8321",  # the local function is declared but never used
    "CS0219",  # variable assigned but never used
    "CS0168",  # variable declared but never used
    "CS0162",  # unreachable code
    "CS1998",  # async method lacks await
    "CS0067",  # event is never used
    "CS0414",  # field assigned but never used
    "CS0649",  # field never assigned
    "CS0108",  # hides inherited member
    "CS0114",  # hides inherited member (virtual)
    "CS0618",  # obsolete member
    "CS0612",  # obsolete member (no message)
    "CS8600", "CS8601", "CS8602", "CS8603", "CS8604", "CS8618", "CS8625", "CS8714",
}
FATAL_EXAMPLES = "CS0117, CS1061, CS0266, CS0019, CS1503, CS1501, CS1729, CS7036, CS0411, CS0246"

DIAG_RE = re.compile(
    r"^(?P<file>[A-Za-z]:[^(]+)\((?P<line>\d+),(?P<col>\d+)\):\s+"
    r"(?P<sev>error|warning)\s+(?P<code>CS\d+):\s*(?P<msg>.*)$"
)

PRELUDE_USINGS = """// ── generated by check-skill-snippets.py — do not edit ──
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.Json;
using System.Globalization;
using Microsoft.CSharp;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.DB.Electrical;
using Autodesk.Revit.UI;
using CoreScript.Engine.Globals;
using static CoreScript.Engine.Globals.ScriptApi;
using static CoreScript.Engine.Globals.VisualizationExtensions;
using static CoreScript.Engine.Globals.UnitExtensions;
using static CoreScript.Engine.Globals.ElementExtensions;
"""

# ⚠⚠ The gate class is a SEPARATE string rather than the tail of the prelude, because a
# WHOLE-SCRIPT fence has to be emitted ABOVE it — at the TOP LEVEL of the compilation unit,
# where a `using` directive, a type declaration and top-level statements are all legal.
# See `host_for`. Emitting such a fence inside the class is what produced the false syntax
# errors this file used to report as product defects.
GATE_CLASS_HEADER = """
internal static class __SnippetGate
{
"""


# ── Normalizer ───────────────────────────────────────────────────────────────────────
# A line that already ends in one of these is complete, or is continued on the next line.
_NO_TERM = (";", "{", "}", ":", ",", "(", "[", "=", "+", "-", "*", "/", "&", "|", "?", "<", ">")
# A line that IS one of these is control flow, not a statement to terminate.
_KEYWORDS = ("else", "do", "try", "finally", "repeat")
# A next line starting with one of these CONTINUES the current line — do not terminate it.
_CONTINUES = (".", ")", "{", "?", "+", "-", "*", "/", "&&", "||", "??", ",", ":", "=")
# `... {` where the brace opens an OBJECT/COLLECTION INITIALIZER rather than a block.
_INIT_BRACE_RE = re.compile(r"\bnew\s*[\w\.<>,\[\]\s]*$")


def _split_comment(line: str):
    """Return (code, comment) split at the first `//` OUTSIDE a string or char literal.

    ⚠ Terminating a line by appending to the RAW line puts the `;` after the trailing
    comment, where the comment swallows it — the statement is then still unterminated.
    Measured: 92 CS1002 across 31 fences, all on lines of the form `foo()   // note`.
    """
    i, n = 0, len(line)
    while i < n:
        c = line[i]
        if c in "\"'":
            q, i = c, i + 1
            while i < n:
                if line[i] == "\\":
                    i += 2
                    continue
                if line[i] == q:
                    break
                i += 1
        elif c == "/" and i + 1 < n and line[i + 1] == "/":
            return line[:i], line[i:]
        i += 1
    return line, ""


def _scan_braces(code: str, stack: list) -> None:
    """Walk one line pushing brace kinds ('init' | 'block'); string- and comment-aware."""
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if c in "\"'":
            q, i = c, i + 1
            while i < n:
                if code[i] == "\\":
                    i += 2
                    continue
                if code[i] == q:
                    break
                i += 1
        elif c == "/" and i + 1 < n and code[i + 1] == "/":
            return
        elif c == "{":
            stack.append("init" if _INIT_BRACE_RE.search(code[:i]) else "block")
        elif c == "}" and stack:
            stack.pop()
        i += 1


def _enclosing_braces(lines):
    """kinds[i] = kind of the brace ENCLOSING line i ('init' | 'block' | None).

    An initializer's last member takes no `;` before its `}`; a block's last statement does.
    Both look identical from the following line, so the stack must be tracked — getting this
    wrong inserts `;` inside `new { ... }` and breaks the fence (measured).
    """
    kinds, stack = [], []
    for ln in lines:
        kinds.append(stack[-1] if stack else None)
        _scan_braces(ln, stack)
    return kinds


def normalize(body: str) -> str:
    """Make a fragment parse as a method body without changing its meaning.

    A fence is often a LIST of statements shown without their terminators, or a fluent chain
    split across lines. Terminate a line only when the next line does NOT continue it, and
    insert the `;` BEFORE the line's trailing comment.
    """
    lines = body.rstrip().splitlines()
    kinds = _enclosing_braces(lines)
    codes = [_split_comment(l)[0] for l in lines]
    out = []
    for i, ln in enumerate(lines):
        code, comment = _split_comment(ln)
        s = code.strip()
        if not s or s in _KEYWORDS or s.endswith(_NO_TERM):
            out.append(ln)
            continue
        nxt = next((codes[j].strip() for j in range(i + 1, len(lines)) if codes[j].strip()), None)
        continues = nxt is not None and (
            nxt.startswith(_CONTINUES) or (nxt.startswith("}") and kinds[i] == "init")
        )
        out.append(ln if continues else code.rstrip() + ";" + (" " + comment if comment else ""))
    return "\n".join(out)


def wrapper_for(body: str) -> str:
    """Pick a return type so `return` in a fence is not a false positive."""
    stripped = "\n".join(ln for ln in body.splitlines() if not ln.strip().startswith("//"))
    if re.search(r"\breturn\s*;", stripped):
        return "void"
    if re.search(r"\breturn\s+[^;]+;", stripped):
        return "object"
    return "void"


# ── Extraction ───────────────────────────────────────────────────────────────────────
def extract_fences(text: str):
    """Return [(start_line_1based, code)] for every ```csharp fence."""
    out, lines, i = [], text.splitlines(), 0
    while i < len(lines):
        if lines[i].strip() == "```csharp":
            start, body, i = i + 1, [], i + 1
            while i < len(lines) and lines[i].strip() != "```":
                body.append(lines[i])
                i += 1
            if i >= len(lines):
                raise ValueError(f"unterminated ```csharp fence at line {start}")
            out.append((start + 1, "\n".join(body)))
        i += 1
    return out


# ⚠⚠ THE SKILL TREES MOVED (2026-10-13) — and this gate did not notice.
#   Until then every MCP carried its own `mcp_core/skills/` copy, so discovery keyed on that one
#   path. The shared core is now ONE imported package at `paracore/mcp/mcp_core/skills/`, and a
#   specialist keeps only its OWN domain skills in `<repo>/skills/`. A discovery still looking for
#   `<repo>/mcp_core/skills` therefore matches NOTHING — measured 2026-10-13:
#       "scan: 0 repo(s), 0 ```csharp fence(s)"
#   The gate failed LOUDLY (an empty scan must FAIL, rule 3) instead of passing vacuously, which is
#   the only reason the defect was visible — but it also means NO skill snippet in ANY repo had
#   been compiled since the move. All three layouts are listed so an older checkout still gates.
SKILL_ROOT_PATTERNS = (
    ("mcp", "mcp_core", "skills"),   # the SHARED core — paracore/mcp/mcp_core/skills
    ("mcp_core", "skills"),          # a repo's own copy (pre-2026-10-13 layout)
    ("skills",),                     # a specialist's DOMAIN skills (current layout)
    # ⚠⚠ THE SCAFFOLD TREE IS A SKILL TREE TOO (added 2026-10-27). `paracore/ai/**` is what a
    #   scaffolded gallery workspace receives as `.github/skills/`, so it is read by an agent on
    #   every "Edit Script" — and it was the ONE tree this gate never compiled. Measured when it
    #   was finally wired up: 4 fences in `ai/shared/skills/paracore-engine/SKILL.md` were
    #   cheat-sheet lines with no `;` between calls (CS1002 ×9), shipped to every gallery agent.
    #   `ai/vscode` has no `skills/` dir, so it contributes nothing.
    ("ai", "shared", "skills"),      # emitted into BOTH scaffolds
    ("ai", "desktop", "skills"),     # desktop-only (paracore-tool, paracore-sentinel)
)


def skill_roots(repo: Path):
    """Every skill-tree directory this repo has, in a stable order. [] ⇒ not a skill repo."""
    return [repo.joinpath(*parts) for parts in SKILL_ROOT_PATTERNS
            if repo.joinpath(*parts).is_dir()]


def discover_repos(root: Path):
    """Every sibling repo that carries a skill tree, sorted. Auto-discovery cannot go stale."""
    return sorted(d for d in root.iterdir()
                  if d.is_dir() and skill_roots(d))


def collect_fences(repo: Path):
    """[(relpath, src_line, body)] for this repo's skill files, incl. its SKILLS.md catalogue.

    ⚠ A repo can carry MORE THAN ONE tree at once — the engine repo holds the shared core, and a
    specialist may still have a legacy `mcp_core/skills` beside its domain `skills/`. Gather all of
    them, or a fence in the un-listed tree is silently never compiled (the whole defect above).
    """
    files = []
    for base in skill_roots(repo):
        files.extend(sorted(base.glob("*/SKILL.md")))
    cat = repo / "SKILLS.md"
    if cat.is_file():
        files.append(cat)
    out = []
    for f in files:
        for src_line, body in extract_fences(f.read_text(encoding="utf-8")):
            out.append((f.relative_to(repo).as_posix(), src_line, body))
    return out


# ── Compile ──────────────────────────────────────────────────────────────────────────
# A line that DECLARES a type at the top level. Matched only at the START of a stripped line, so
# prose and comments cannot trip it. `record` is included because a Forge script's `Params`
# class may be one.
_TYPE_DECL_RE = re.compile(
    r"^(?:public|internal|private|protected|static|abstract|sealed|partial|readonly|unsafe|\s)*"
    r"(?:class|struct|enum|interface|record)\b")

# A line that DECLARES a class MEMBER — an access/modifier keyword leads it. ⚠ This is the
# discriminator that separates a member fence from a statement fence, and it works because a
# STATEMENT almost never starts with one: `Params p = new();`, `var rows = …`, `Println(…)`,
# `XYZ point = …` all lead with a TYPE or a call, never with `public`.
_MEMBER_LINE_RE = re.compile(
    r"^(?:public|private|protected|internal|static|readonly|const|virtual|override|abstract|"
    r"sealed|extern|unsafe|async|partial|new|volatile|event)\b")

# A whole `using` directive — `using X;` or `using Y = X;`. Only a directive whose WHOLE line is
# this counts, so `using (var d = …)` (a statement) is not mistaken for one.
_USING_RE = re.compile(r"^using\s+[A-Za-z_][\w.]*\s*(?:=\s*[^;]+)?;\s*$")


def _code_lines(body: str):
    """The lines that carry syntax: blanks, comments and XML docs removed, trailing comments cut.

    ⚠ The trailing comment MUST be cut before matching `_USING_RE`. `using RestSharp;  // …` does
    not end in `;` until the comment is gone, so the fence would miss the `usings` host and be
    compiled as a method body — the exact false positive this classifier exists to remove.
    """
    out = []
    for ln in body.splitlines():
        s = _split_comment(ln.strip())[0].strip()
        if not s or s.startswith("//") or s.startswith("/*") or s.startswith("*"):
            continue
        out.append(s)
    return out


def host_for(body: str) -> str:
    """Which LEGAL C# host this fence needs: 'usings' | 'script' | 'member' | 'method'.

    ⚠⚠ WHY THIS EXISTS. The gate used to put EVERY fence inside a method body. But C# has
    constructs that are legal at ONE level only, and a skill quotes all of them:

        `using X;`                  legal ONLY at the top of a compilation unit
        `public class Params { … }` legal ONLY at the top level (or in a namespace) — a Forge
                                    script is exactly this: top-level statements plus a `Params`
                                    class, i.e. a whole compilation unit
        `public double X { get; }`  legal ONLY as a class member — a `Params` attribute fence
                                    quotes one member, not a method body

    Each of those is VALID C# that is ILLEGAL inside a method, so the gate reported its OWN
    harness limitation as a fatal SYNTAX error in the product.

    Measured 2026-10-14 on `paracore-forge`: every one of its 15 findings was this, not a defect.
    And because those errors are syntax-class, they ALSO tripped the isolate-every-fence path in
    `collect` — turning a full scan into ~30 minutes of single-fence builds.

    ⚠ A gate that reports its own limitation as a product defect is a gate people learn to
    ignore, which is worse than no gate (rule 3). `pack_dlls()` makes the same argument.

    ⚠ ORDER IS LOAD-BEARING. `script` is tested before `member`: a fence that opens with
    `public class Params` would otherwise match `_MEMBER_LINE_RE` on that same line (`public`) and
    be emitted as a nested class holding another class — legal, but it would bury the fence one
    level deeper than its true host and mis-attribute every diagnostic inside it.
    """
    code = _code_lines(body)
    if code and all(_USING_RE.match(s) for s in code):
        return "usings"
    if any(s.startswith("namespace ") or _TYPE_DECL_RE.match(s) for s in code):
        return "script"
    # ⚠ The FIRST declaration line is the signal, not every line. A member fence may hold a whole
    #   method — `public void Set(FamilyParameter p, double v) { … }` — whose body lines are not
    #   modifier-led, so an all-lines test would drop it back to a method body, where `public` is
    #   CS0106. And a member fence CANNOT start with a statement: no statement begins with an
    #   access modifier, and none begins with `[` either.
    if code and (code[0].startswith("[") or _MEMBER_LINE_RE.match(code[0])):
        return "member"
    return "method"


def build_source(fences):
    """fences = [(src_line, body)]. Return (source, spans, starts).

    ⚠ FOUR HOSTS — see `host_for`. The generated file is laid out so that every C# ordering rule
    holds in ONE pass:

        usings  (prelude + `usings` fences)  `using` directives must precede ALL other members
        `_ = 0;`                             a synthesized top-level statement, so an
                                             OutputType=Exe project always HAS an entry point
        `script` fences                      top-level statements, then their own type decls
        the gate class                       `member` fences as nested classes, `method` fences
                                             as bodies

    ⚠ `usings` fences go ABOVE the synthesized statement, not merely above the class: a `using`
    directive after ANY statement is CS1529. ⚠ And the synthesized statement goes above the
    `script` fences, not below them: a top-level statement that follows a type declaration is
    CS8803. ⚠ `collect` compiles each of those two kinds in a group of its own, so a group holds
    at most one of them — but the ordering still has to hold for the isolate path and for
    `--selftest`, which build a single fence through this same function.

    ⚠ `spans[idx] = (first, last)` is the generated line range in Snippets.cs that the fence owns;
    `starts[idx]` is the line the fence's OWN text begins on (a method/member fence is indented
    inside a wrapper, so its text starts 2 lines into its span).

    ⚠ A verbatim fence is NEVER normalized: `normalize()` would append `;` after the `*/` that
    closes a script's metadata header, breaking a fence that is perfectly good.
    """
    hosts = [(idx, sl, b, host_for(b)) for idx, (sl, b) in enumerate(fences)]
    usings = [(i, sl, b) for i, sl, b, h in hosts if h == "usings"]
    scripts = [(i, sl, b) for i, sl, b, h in hosts if h == "script"]
    members = [(i, sl, b) for i, sl, b, h in hosts if h == "member"]
    methods = [(i, sl, b) for i, sl, b, h in hosts if h == "method"]

    parts = [PRELUDE_USINGS]
    nl = PRELUDE_USINGS.count("\n")
    spans, starts = {}, {}

    def emit_verbatim(idx, src_line, body, label):
        nonlocal nl
        parts.append(f"// >>> FENCE {idx} src-line {src_line} ({label})\n")
        nl += 1
        start = nl + 1
        text = body.rstrip() + "\n"
        parts.append(text)
        nl += text.count("\n")
        spans[idx] = (start, nl)
        starts[idx] = start

    for idx, src_line, body in usings:
        emit_verbatim(idx, src_line, body, "usings host")

    # ⚠ Without this an OutputType=Exe project whose fences contain NO top-level statements fails
    #   CS5001 (no entry point); with it, the whole-script host is legal AND the project still
    #   links. It is a no-op statement — it cannot produce a diagnostic of its own.
    parts.append("_ = 0;  // gate: synthesized entry point for the whole-script host\n")
    nl += 1

    for idx, src_line, body in scripts:
        emit_verbatim(idx, src_line, body, "whole-script host")

    parts.append(GATE_CLASS_HEADER)
    nl += GATE_CLASS_HEADER.count("\n")

    # ⚠ A member fence gets its OWN nested class. Sharing one would collide the moment two fences
    #   declare the same member name (CS0102) — and two `Params` examples declaring `Offset` is
    #   exactly what an attribute reference does.
    for idx, src_line, body in members:
        parts.append(f"    // >>> FENCE {idx} src-line {src_line} (class-member host)\n")
        nl += 1
        parts.append(f"    internal sealed class __SM{idx}\n    {{\n")
        nl += 2
        start = nl + 1
        text = "\n".join("        " + l if l.strip() else "" for l in body.rstrip().splitlines()) + "\n"
        parts.append(text)
        nl += text.count("\n")
        spans[idx] = (start - 2, nl)
        starts[idx] = start
        parts.append("    }\n")
        nl += 1

    for idx, src_line, body in methods:
        parts.append(f"    // >>> FENCE {idx} src-line {src_line}\n")
        nl += 1
        code = normalize(body)
        parts.append(f"    internal static {wrapper_for(code)} __S{idx}()\n    {{\n")
        nl += 2
        start = nl + 1
        starts[idx] = start
        text = "\n".join("        " + l if l.strip() else "" for l in code.splitlines()) + "\n"
        parts.append(text)
        nl += text.count("\n")
        spans[idx] = (start - 2, nl)
        parts.append("    }\n")
        nl += 1

    parts.append("}\n")
    return "".join(parts), spans, starts


def pack_dlls():
    """Every sibling repo's BUILT pack assembly — the extension methods a pack-bearing skill teaches.

    ⚠⚠ WHY THIS EXISTS. `paracore-takeoff`'s skills document the takeoff PACK's own methods
    (`AuditClashes`, `ClearClashHelpers`, `AuditNarrowBays`, `MergeNarrowBays`,
    `PurgeGhostMembers`, `RemoveMullionlessSegments`). Those live in `Paracore.TakeOff.dll`, which
    the pack LOADS into the engine at runtime — they are NOT in `CoreScript.Engine.dll`. Compiling
    them against the engine alone therefore yields **12 CS1061 that are a MISSING REFERENCE, not a
    defect in the skill** (measured 2026-10-13, `paracore-takeoff/skills/takeoff-reference`).

    ⚠ A gate that reports its OWN harness limitation as a fatal API error is a gate people learn to
    ignore — which is worse than no gate (rule 3). Resolving the pack is the fix, and it is the
    same shape as `resolve_engine()`: discover it, never hard-code it.

    `[]` is normal — only a pack-bearing repo has a pack.
    """
    out = []
    if not ROOT.is_dir():
        return out
    for repo in sorted(ROOT.iterdir()):
        base = repo / "pack" / "bin" / "Release"
        if base.is_dir():
            out.extend(sorted(base.glob("*/win-x64/Paracore.*.dll")))
    return out


# ⚠⚠ THE ENGINE'S OWN PACKAGES. The engine PREPENDS a fixed import surface to every script, so a
# fence may name one of these namespaces with no `using` — `script-rules` documents the list, and
# its own `using RestSharp;` fence is the proof. Compiling against the engine DLL alone gives
# CS0246 for them, which is a MISSING REFERENCE, not a defect in the skill (measured 2026-10-14).
# Same argument as `pack_dlls()`.
# ⚠⚠ DISCOVERED, NEVER HARD-CODED: the NAMES and VERSIONS come from the engine's OWN
# `PackageReference` list (the authority for what the engine carries), and the PATH from the
# NuGet cache. `Microsoft.*` / `System.*` are the SDK's, and the Revit API is referenced
# explicitly by `make_csproj` — pulling either in a second time is CS1704.
_REF_SKIP = ("Microsoft.", "System.", "Nice3point.")
# Preference order for the `lib/<tfm>` folder. `net8.0` first (an exact match for the gate's own
# TargetFramework), then the nearest lower TFMs a net8.0 consumer may still load.
_TFM_ORDER = ("net8.0", "net8.0-windows", "net7.0", "net6.0", "net6.0-windows",
              "net5.0", "netstandard2.1", "netstandard2.0")
NUGET_CACHE = Path.home() / ".nuget" / "packages"


def engine_package_refs():
    """The engine's non-framework NuGet assemblies, resolved out of the NuGet cache. [] is normal.

    ⚠ A package with no `lib/<known-tfm>/<Name>.dll` is SKIPPED, never guessed: a wrong TFM would
    compile and then fail at load, which is worse than an honest CS0246.
    """
    csproj = PARACORE / "CoreScript.Engine" / "CoreScript.Engine.csproj"
    if not csproj.is_file() or not NUGET_CACHE.is_dir():
        return []
    out = []
    for block in re.findall(r"<PackageReference\b[^>]*>", csproj.read_text(encoding="utf-8")):
        m_name = re.search(r'Include="([^"]+)"', block)
        if not m_name:
            continue
        name = m_name.group(1)
        if name.startswith(_REF_SKIP):
            continue
        m_ver = re.search(r'Version="([^"]+)"', block)
        pkg = NUGET_CACHE / name.lower()
        if not pkg.is_dir():
            continue
        pinned = pkg / m_ver.group(1) if m_ver else None
        # A wildcard version (`2025.*`) has no literal folder — fall back to the newest present.
        cands = [pinned] if pinned and pinned.is_dir() else sorted(
            (d for d in pkg.iterdir() if d.is_dir()), key=lambda d: d.name)
        for vdir in reversed(cands):
            for tfm in _TFM_ORDER:
                dll = vdir / "lib" / tfm / f"{name}.dll"
                if dll.is_file():
                    out.append(dll)
                    break
            else:
                continue
            break
    return out


def _ref_block(paths) -> str:
    """One `<Reference>` per assembly, `Private=false` so nothing is copied to the output."""
    return "".join(
        f'\n    <Reference Include="{p.stem}">'
        f'\n      <HintPath>{p}</HintPath><Private>false</Private>'
        f'\n    </Reference>'
        for p in paths)


def make_csproj(engine_dll: Path) -> str:
    packs = _ref_block(pack_dlls())
    engine_pkgs = _ref_block(engine_package_refs())
    return f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- ⚠⚠ Exe, not Library: a Forge script fence is TOP-LEVEL STATEMENTS, and Roslyn rejects
         those in a Library output with CS8805 ("Program using top-level statements must be an
         executable"). That is the gate's own harness limitation, not a defect in the skill — so
         the whole-script host is given an executable project, and `build_source` synthesizes the
         entry point (`_ = 0;`) so the project still links when no fence supplies one. -->
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>disable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <NoWarn>CS0168;CS0219;CS8321;CS8600;CS8602;CS8604;CS8618</NoWarn>
    <PlatformTarget>x64</PlatformTarget>
    <AssemblyName>SnippetGate</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Snippets.cs" />
  </ItemGroup>
  <ItemGroup>
    <Reference Include="RevitAPI">
      <HintPath>{REVIT_DIR / 'RevitAPI.dll'}</HintPath><Private>false</Private>
    </Reference>
    <Reference Include="RevitAPIUI">
      <HintPath>{REVIT_DIR / 'RevitAPIUI.dll'}</HintPath><Private>false</Private>
    </Reference>
    <Reference Include="CoreScript.Engine">
      <HintPath>{engine_dll}</HintPath><Private>false</Private>
    </Reference>{packs}{engine_pkgs}
    <Reference Include="Microsoft.CSharp" />
  </ItemGroup>
</Project>
"""


def resolve_engine() -> Path:
    for cand in ENGINE_CANDIDATES:
        if cand and cand.is_file():
            return cand
    raise SystemExit(
        "HARNESS ERROR: no CoreScript.Engine.dll found. Set PARACORE_ENGINE_DLL.\n"
        + "\n".join(f"  tried {c}" for c in ENGINE_CANDIDATES if c)
    )


def compile_source(engine_dll: Path, source: str, dump: bool = False):
    """Write + build. Return (deduped [(line, code, msg)], rc, raw)."""
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    (BUILD_DIR / "Snippets.cs").write_text(source, encoding="utf-8")
    (BUILD_DIR / "SnippetGate.csproj").write_text(make_csproj(engine_dll), encoding="utf-8")
    if dump:
        print(f"[dump] {BUILD_DIR / 'Snippets.cs'}")
    proc = subprocess.run(
        ["dotnet", "build", str(BUILD_DIR / "SnippetGate.csproj"), "-nologo", "-v:q"],
        capture_output=True, text=True, cwd=str(BUILD_DIR),
    )
    raw = (proc.stdout or "") + (proc.stderr or "")
    seen, diags = set(), []
    for line in raw.splitlines():
        m = DIAG_RE.match(line.strip())
        if m and m.group("sev") == "error":
            key = (int(m.group("line")), m.group("code"), m.group("msg").strip())
            if key not in seen:
                seen.add(key)
                diags.append(key)
    return diags, proc.returncode, raw


def map_fence(line: int, spans):
    """The fence whose generated region CONTAINS `line`, else None.

    ⚠ A containment test, NOT a "greatest start <= line" scan. Whole-script fences are emitted at
    the TOP of the file and method fences inside the class BELOW them, so the regions are no
    longer ordered by fence index — the old scan would mis-attribute a diagnostic the moment one
    whole-script fence existed.
    """
    for idx, (first, last) in spans.items():
        if first <= line <= last:
            return idx
    return None


def is_syntax(code: str) -> bool:
    return code.startswith(("CS1", "CS8"))


def _build_group(engine, group, dump):
    """One build for `group` = [(orig_idx, src_line, body)].

    Return (mapped, harness), mapped = [(orig_idx, local_line, code, msg)]. ⚠ Diagnostics are
    re-keyed from the GROUP's local index back to the caller's ORIGINAL index, so the caller can
    run several groups and still attribute every diagnostic to the right fence.
    """
    source, spans, starts = build_source([(sl, b) for _, sl, b in group])
    diags, rc, raw = compile_source(engine, source, dump)

    # ⚠ `min` over spans, not `spans[0]`: a whole-script fence is emitted FIRST, so fence 0's
    #   region is not necessarily the earliest line in the file.
    first_line = min(s for s, _ in spans.values())
    prelude = [d for d in diags if d[0] < first_line]
    if prelude:
        return None, ("the prelude itself did not compile — the gate is TOOTHLESS", prelude[:8])
    if rc != 0 and not diags:
        return None, ("dotnet build failed with no parsable diagnostics", raw[-1500:])

    out = []
    for line, code, msg in diags:
        k = map_fence(line, spans)
        if k is None:
            continue
        out.append((group[k][0], max(1, line - starts[k] + 1), code, msg))
    return out, None


def collect(engine, fences, dump):
    """fences = [(repo, relpath, src_line, body)].

    Return (findings, tolerated, harness) where findings = [(repo, relpath, src_line, local, code, msg)].
    """
    # ⚠⚠ A fence whose host IS the compilation unit — `usings` (a `using` list) or `script` (a
    #   whole program) — is compiled ON ITS OWN. The two reasons are the same one:
    #     * a `using` directive is FILE-WIDE and cannot be scoped, so hoisting one into the shared
    #       unit imports it for EVERY other fence. `script-rules` documents `using RestSharp;` as a
    #       namespace a script must NOT import — `RestSharp.Parameter` collides with
    #       `Autodesk.Revit.DB.Parameter`. Sharing the unit therefore made `family-authoring` report
    #       CS0104 on a fence that is perfectly correct: the gate was importing the very collision
    #       the doc warns about (measured 2026-10-14).
    #     * two `script` fences cannot share a unit at all — the second `public class Params` is
    #       CS0101, and C# permits top-level statements in only ONE unit (CS8802).
    #   ⚠ Measured cost: 1 `usings` + 2 `script` fences across all 5 repos, so 3 extra builds —
    #     NOT the ~30-minute isolate path. `member`/`method` fences share the main build.
    isolated = {i for i, (_, _, _, b) in enumerate(fences)
                if host_for(b) in ("usings", "script")}
    groups = [[(i, sl, b) for i, (_, _, sl, b) in enumerate(fences) if i not in isolated]]
    groups += [[(i, sl, b)] for i, (_, _, sl, b) in enumerate(fences) if i in isolated]

    per_fence = {}
    for group in groups:
        if not group:
            continue
        mapped, harness = _build_group(engine, group, dump)
        if harness:
            return None, None, harness
        for idx, local, code, msg in mapped:
            per_fence.setdefault(idx, []).append((local, code, msg))

    if any(is_syntax(c) for items in per_fence.values() for _, c, _ in items):
        print("note: syntax-class error seen — re-checking every fence in isolation")
        print("      (one unbalanced brace or pseudo-code fence corrupts all that follow it)")
        dirty = 0
        for idx, (repo, rel, sl, body) in enumerate(fences):
            s, sp1, st = build_source([(sl, body)])
            d, rc2, raw2 = compile_source(engine, s)
            if [x for x in d if x[0] < min(a for a, _ in sp1.values())]:
                return None, None, (f"prelude failed while isolating {repo}/{rel}:{sl}", d[:8])
            per_fence[idx] = [(max(1, x[0] - st[0] + 1), x[1], x[2]) for x in d]
            n = len([x for x in d if x[1] not in TOLERATED])
            if n:
                dirty += 1
                print(f"      [{idx + 1}/{len(fences)}] {repo}/{rel}:{sl} -> {n} fatal")
        print(f"      isolated {len(fences)} fence(s); {dirty} carry a fatal error")

    findings, tolerated = [], {}
    for idx, items in per_fence.items():
        repo, rel, sl, _ = fences[idx]
        for local, code, msg in items:
            if code in TOLERATED:
                tolerated[code] = tolerated.get(code, 0) + 1
            else:
                findings.append((repo, rel, sl, local, code, msg))
    return findings, tolerated, None


def run_gate(repos, dump, quiet):
    fences, per_repo = [], {}
    for repo in repos:
        got = collect_fences(repo)
        per_repo[repo.name] = len(got)
        for rel, src_line, body in got:
            fences.append((repo.name, rel, src_line, body))

    print(f"scan: {len(repos)} repo(s), {len(fences)} ```csharp fence(s)")
    for name, n in sorted(per_repo.items()):
        print(f"  {name:22s} {n:3d} fence(s)")
    if not fences:
        print("GATE FAILED: EMPTY SCAN — no ```csharp fences found anywhere.")
        print("  A gate that silently finds nothing is not a gate (rule 3).")
        return 2
    for name, n in per_repo.items():
        if n == 0:
            print(f"GATE FAILED: repo {name} carries a skill tree but yielded 0 fences.")

    engine = resolve_engine()
    print(f"engine: {engine}")
    return report(fences, engine, dump, quiet, f"{len(repos)} repo(s)")


def gate_files(paths, dump, quiet):
    """⚠ THE FAST PATH — gate exactly these `.md` files, nothing else.

    Why this exists: a full scan is 5 repos / ~174 fences, and ONE syntax-class error makes the
    gate re-compile EVERY fence in isolation (~10 s each) to attribute the diagnostics exactly.
    That is the right thing to do and it costs ~30 minutes on this machine — which is long enough
    that nobody iterates on a skill. This mode answers "did the file I just edited compile?"
    in one build, so the expensive full scan can stay a pre-commit gate.

    ⚠ It is NOT a substitute: it cannot see a defect in a file you did not name, and it cannot
    prove the tree as a whole is green. Use it while editing, run the full scan before committing.
    """
    fences = []
    for p in paths:
        path = Path(p).resolve()
        if not path.is_file():
            print(f"HARNESS ERROR: not a file: {path}")
            return 2
        try:
            rel = path.relative_to(ROOT).as_posix()
            label = rel.split("/", 1)[0]        # the repo the file lives in
        except ValueError:                      # outside the sibling root — name it as given
            rel = label = path.name
        for src_line, body in extract_fences(path.read_text(encoding="utf-8")):
            fences.append((label, rel, src_line, body))

    print(f"scan: {len(paths)} file(s), {len(fences)} ```csharp fence(s)")
    if not fences:
        print("GATE FAILED: EMPTY SCAN — the named files carry no ```csharp fences.")
        print("  A gate that silently finds nothing is not a gate (rule 3).")
        return 2

    engine = resolve_engine()
    print(f"engine: {engine}")
    return report(fences, engine, dump, quiet, f"{len(paths)} file(s)")


def report(fences, engine, dump, quiet, scope):
    # ⚠ Say what we compiled AGAINST, not just what we compiled. A green run that silently
    # omitted a pack reference would be green for the wrong reason.
    packs = pack_dlls()
    pkgs = engine_package_refs()
    print("pack refs:   " + (", ".join(p.name for p in packs) if packs else "(none)"))
    print("engine pkgs: " + (", ".join(p.name for p in pkgs) if pkgs else "(none)"))
    findings, tolerated, harness = collect(engine, fences, dump)

    if harness:
        print(f"\nHARNESS ERROR: {harness[0]}")
        for item in harness[1]:
            print(f"    {item}")
        print("  Fix the reference paths before trusting any verdict.")
        return 2

    if tolerated and not quiet:
        print("tolerated (fragment artefacts, not defects): "
              + ", ".join(f"{k}x{v}" for k, v in sorted(tolerated.items())))

    if findings:
        print(f"\nGATE FAILED: {len(findings)} fatal snippet error(s).")
        by_repo = {}
        for f in sorted(findings):
            by_repo.setdefault(f[0], []).append(f)
        for repo, items in sorted(by_repo.items()):
            print(f"  ── {repo} ({len(items)})")
            for _, rel, sl, local, code, msg in items:
                print(f"     {rel}:{sl} (+{local})  {code}: {msg.split(' [')[0]}")
        print(f"\n  Fatal codes include {FATAL_EXAMPLES} — API errors, not fragment artefacts.")
        print("  A ```csharp fence must compile. Fix the snippet, or re-tag it if it is not C#.")
        return 1

    print(f"\nGATE PASSED: all {len(fences)} fence(s) in {scope} compile "
          f"(fragment artefacts tolerated: {sum(tolerated.values())}).")
    return 0


# ── Self-test ────────────────────────────────────────────────────────────────────────
SELFTEST_PAIRS = [
    ("RoomTag.TagOrientation — two enums, one member name",
     "foreach (var t in GetElements<RoomTag>()) t.TagOrientation = SpatialElementTagOrientation.Vertical;",
     "foreach (var t in GetElements<RoomTag>()) t.TagOrientation = TagOrientation.Vertical;"),
    ("FailureMessage.Description",
     "foreach (var w in Doc.GetWarnings()) Println(w.GetDescriptionText());",
     "foreach (var w in Doc.GetWarnings()) Println(w.Description);"),
    ("Location.Point is on LocationPoint, not Location",
     "Element el = null; var p = ((LocationPoint)el.Location).Point; Println(p);",
     "Element el = null; var p = el.Location.Point; Println(p);"),
    ("Room tags have no StartTransaction-style phantom member",
     "var scope = new StairsEditScope(Doc, \"s\"); var id = scope.Start(null, null); Println(id);",
     "var scope = new StairsEditScope(Doc, \"s\"); var id = scope.StartTransaction(null, null); Println(id);"),
    # ⚠ Pins the CS1002 decision above. A signature table written as PROPERTIES emits ONLY
    # CS1002 — no CS8112, no CS1003 — so while CS1002 was tolerated this fence was GREEN.
    # If someone re-adds CS1002 to TOLERATED, this control goes green and the selftest FAILS.
    ("a signature table written as PROPERTIES is not C# (emits only CS1002)",
     "foreach (var t in GetElements<RoomTag>()) Println(t.Id);",
     "int ProfileCount { get; }\nint PathCurveCount { get; }"),
]

# ⚠ The normalizer is the part most likely to be quietly wrong — pin its invariants.
NORMALIZE_CASES = [
    ("a line followed by `.` is a fluent chain — not terminated",
     "GetElements<Wall>()\n    .ToList()", ".ToList()", True),
    ("a line followed by `{` is a block header — not terminated",
     "int F()\n{\n    return 1;\n}", "int F()\n{", True),
    ("a line followed by `}` INSIDE an initializer — not terminated",
     'GetElements("Walls").Select(w => new {\n    w.Id,\n    Name = w.Name\n}).Table()',
     "Name = w.Name;", False),
    ("a line followed by `}` inside a BLOCK — terminated",
     "if (true)\n{\n    Println(1)\n}", "Println(1);", True),
    ("the `;` lands BEFORE a trailing comment",
     'Println("x")   // note', 'Println("x");', True),
]

# ⚠⚠ THE HOST CONTROLS. Wrong host logic fails in the WORST direction: the gate goes GREEN by
# compiling a fence where its errors are suppressed — or by not compiling it at all. `SELFTEST_PAIRS`
# above only ever exercises the METHOD host, so without these the three new hosts would be
# unproven, and "all 176 fences compile" would not mean what it says.
# ⚠ Each control is built ALONE, because that is how a real run compiles a `usings`/`script`
# fence — and two `script` controls in one unit would collide (CS0101) before either defect showed.
HOST_CASES = [
    ("usings host — a `using` list compiles",
     "using RestSharp;",
     "using RestSharp.NoSuchNamespace;"),
    ("script host — a whole program compiles",
     "Params p = new();\nPrintln(p.Mark);\n"
     'public class Params { public string Mark { get; set; } = ""; }',
     "Params p = new();\nPrintln(p.Missing);\n"
     'public class Params { public string Mark { get; set; } = ""; }'),
    ("member host — a bare member declaration compiles",
     "public double Offset { get; set; } = 1.5;",
     'public double Offset { get; set; } = "not a double";'),
]


def selftest(engine: Path) -> int:
    print("SELFTEST: does this gate actually catch the defects it was built for?")
    ok = True
    for label, good, bad in SELFTEST_PAIRS:
        source, spans, _ = build_source([(1, good), (1, bad)])
        diags, _, _ = compile_source(engine, source)
        if [d for d in diags if d[0] < min(s for s, _ in spans.values())]:
            print(f"  [FAIL] {label}: HARNESS ERROR — prelude unresolved, gate is toothless")
            ok = False
            continue
        good_d = [d[1] for d in diags if map_fence(d[0], spans) == 0 and d[1] not in TOLERATED]
        bad_d = [d[1] for d in diags if map_fence(d[0], spans) == 1 and d[1] not in TOLERATED]
        verdict = "OK" if (not good_d and bad_d) else "FAIL"
        ok = ok and verdict == "OK"
        print(f"  [{verdict}] {label}")
        print(f"         good control: {len(good_d)} fatal (want 0) {good_d or ''}")
        print(f"         bad  control: {len(bad_d)} fatal (want >=1) {bad_d or ''}")

    print("\nNORMALIZER INVARIANTS:")
    for label, body, needle, want in NORMALIZE_CASES:
        got = normalize(body)
        present = needle in got
        verdict = "OK" if present == want else "FAIL"
        ok = ok and verdict == "OK"
        print(f"  [{verdict}] {label}")
        if verdict == "FAIL":
            print(f"         want {needle!r} present={want}, got:\n{got}")

    print("\nHOST CONTROLS:")
    for label, good, bad in HOST_CASES:
        fatal = []
        for body in (good, bad):
            source, spans, _ = build_source([(1, body)])
            diags, _, _ = compile_source(engine, source)
            if [d for d in diags if d[0] < min(s for s, _ in spans.values())]:
                fatal.append(None)                      # prelude unresolved -> harness error
            else:
                fatal.append([d[1] for d in diags if d[1] not in TOLERATED])
        good_d, bad_d = fatal
        if good_d is None or bad_d is None:
            print(f"  [FAIL] {label}: HARNESS ERROR — prelude unresolved, gate is toothless")
            ok = False
            continue
        verdict = "OK" if (not good_d and bad_d) else "FAIL"
        ok = ok and verdict == "OK"
        print(f"  [{verdict}] {label}")
        print(f"         good control: {len(good_d)} fatal (want 0) {good_d or ''}")
        print(f"         bad  control: {len(bad_d)} fatal (want >=1) {bad_d or ''}")

    if not ok:
        print("\nSELFTEST FAILED: the gate cannot reproduce a known defect. DO NOT TRUST IT.")
        return 1
    print("\nSELFTEST PASSED: every good control green, every bad control red, normalizer pinned.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Compile-gate the ```csharp fences in every MCP skill tree.")
    ap.add_argument("--repo", action="append", help="gate only this repo (repeatable)")
    ap.add_argument("--files", nargs="+", metavar="PATH",
                    help="⚠ FAST PATH — gate only these .md files (one build, for iterating on a "
                         "skill). NOT a substitute for the full scan, which is the commit gate.")
    ap.add_argument("--selftest", action="store_true", help="prove the gate has teeth")
    ap.add_argument("--dump", action="store_true", help="print the generated Snippets.cs path")
    ap.add_argument("--quiet", action="store_true", help="suppress the tolerated-code summary")
    a = ap.parse_args()
    if a.selftest:
        return selftest(resolve_engine())
    if a.files:
        return gate_files(a.files, a.dump, a.quiet)
    repos = [Path(r).resolve() for r in a.repo] if a.repo else discover_repos(ROOT)
    return run_gate(repos, a.dump, a.quiet)


if __name__ == "__main__":
    sys.exit(main())
