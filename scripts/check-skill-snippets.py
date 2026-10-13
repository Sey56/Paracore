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
  `paracore-gen` is the generic REPL MCP; every specialist carries the SAME nine shared
  skills plus its own domain skills. A gate installed in one specialist sees one copy of the
  shared set - the other two repos keep the defect, which is exactly how the eight defects
  above survived. One gate, all repos. Authority: MASTER_SYSTEM_SPEC.md §3.

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
  so attribution is exact. A clean tree stays at one build.

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

PRELUDE = """// ── generated by check-skill-snippets.py — do not edit ──
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


def discover_repos(root: Path):
    """Every sibling repo that carries a skill tree, sorted. Auto-discovery cannot go stale."""
    return sorted(d for d in root.iterdir()
                  if d.is_dir() and (d / "mcp_core" / "skills").is_dir())


def collect_fences(repo: Path):
    """[(relpath, src_line, body)] for this repo's skill files, incl. its SKILLS.md catalogue."""
    files = sorted((repo / "mcp_core" / "skills").glob("*/SKILL.md"))
    cat = repo / "SKILLS.md"
    if cat.is_file():
        files.append(cat)
    out = []
    for f in files:
        for src_line, body in extract_fences(f.read_text(encoding="utf-8")):
            out.append((f.relative_to(repo).as_posix(), src_line, body))
    return out


# ── Compile ──────────────────────────────────────────────────────────────────────────
def build_source(fences):
    """fences = [(src_line, body)]. Return (source, lo, starts) — see `lo` in `collect`."""
    parts, lo, starts = [PRELUDE], [], []
    ln = PRELUDE.count("\n")
    for idx, (src_line, body) in enumerate(fences):
        parts.append(f"    // >>> FENCE {idx} src-line {src_line}\n")
        ln += 1
        lo.append(ln)                                  # the fence owns from here down
        code = normalize(body)
        parts.append(f"    internal static {wrapper_for(code)} __S{idx}()\n    {{\n")
        ln += 2
        starts.append(ln + 1)
        parts.append("\n".join("        " + l if l.strip() else "" for l in code.splitlines()) + "\n")
        ln += code.count("\n") + 1
        parts.append("    }\n")
        ln += 1
    parts.append("}\n")
    return "".join(parts), lo, starts


def make_csproj(engine_dll: Path) -> str:
    return f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Library</OutputType>
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
    </Reference>
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


def map_fence(line: int, lo):
    """Greatest fence index whose start <= line, else None."""
    best = None
    for idx, s in enumerate(lo):
        if s <= line:
            best = idx
        else:
            break
    return best


def is_syntax(code: str) -> bool:
    return code.startswith(("CS1", "CS8"))


def collect(engine, fences, dump):
    """fences = [(repo, relpath, src_line, body)].

    Return (findings, tolerated, harness) where findings = [(repo, relpath, src_line, local, code, msg)].
    """
    source, lo, starts = build_source([(sl, b) for _, _, sl, b in fences])
    diags, rc, raw = compile_source(engine, source, dump)

    prelude = [d for d in diags if d[0] < lo[0]]
    if prelude:
        return None, None, ("the prelude itself did not compile — the gate is TOOTHLESS", prelude[:8])
    if rc != 0 and not diags:
        return None, None, ("dotnet build failed with no parsable diagnostics", raw[-1500:])

    per_fence = {}
    if any(is_syntax(d[1]) for d in diags):
        print("note: syntax-class error seen — re-checking every fence in isolation")
        print("      (one unbalanced brace or pseudo-code fence corrupts all that follow it)")
        dirty = 0
        for idx, (repo, rel, sl, body) in enumerate(fences):
            s, lo1, st = build_source([(sl, body)])
            d, rc2, raw2 = compile_source(engine, s)
            if [x for x in d if x[0] < lo1[0]]:
                return None, None, (f"prelude failed while isolating {repo}/{rel}:{sl}", d[:8])
            per_fence[idx] = [(x[0] - st[0] + 1, x[1], x[2]) for x in d]
            n = len([x for x in d if x[1] not in TOLERATED])
            if n:
                dirty += 1
                print(f"      [{idx + 1}/{len(fences)}] {repo}/{rel}:{sl} -> {n} fatal")
        print(f"      isolated {len(fences)} fence(s); {dirty} carry a fatal error")
    else:
        for line, code, msg in diags:
            idx = map_fence(line, lo)
            if idx is None:
                continue
            per_fence.setdefault(idx, []).append((line - starts[idx] + 1, code, msg))

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

    print(f"\nGATE PASSED: all {len(fences)} fence(s) in {len(repos)} repo(s) compile "
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


def selftest(engine: Path) -> int:
    print("SELFTEST: does this gate actually catch the defects it was built for?")
    ok = True
    for label, good, bad in SELFTEST_PAIRS:
        source, lo, _ = build_source([(1, good), (1, bad)])
        diags, _, _ = compile_source(engine, source)
        if [d for d in diags if d[0] < lo[0]]:
            print(f"  [FAIL] {label}: HARNESS ERROR — prelude unresolved, gate is toothless")
            ok = False
            continue
        good_d = [d[1] for d in diags if map_fence(d[0], lo) == 0 and d[1] not in TOLERATED]
        bad_d = [d[1] for d in diags if map_fence(d[0], lo) == 1 and d[1] not in TOLERATED]
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

    if not ok:
        print("\nSELFTEST FAILED: the gate cannot reproduce a known defect. DO NOT TRUST IT.")
        return 1
    print("\nSELFTEST PASSED: every good control green, every bad control red, normalizer pinned.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Compile-gate the ```csharp fences in every MCP skill tree.")
    ap.add_argument("--repo", action="append", help="gate only this repo (repeatable)")
    ap.add_argument("--selftest", action="store_true", help="prove the gate has teeth")
    ap.add_argument("--dump", action="store_true", help="print the generated Snippets.cs path")
    ap.add_argument("--quiet", action="store_true", help="suppress the tolerated-code summary")
    a = ap.parse_args()
    if a.selftest:
        return selftest(resolve_engine())
    repos = [Path(r).resolve() for r in a.repo] if a.repo else discover_repos(ROOT)
    return run_gate(repos, a.dump, a.quiet)


if __name__ == "__main__":
    sys.exit(main())
