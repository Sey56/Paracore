"""Cross-check the MCP instruction surfaces against the engine's ACTUAL public members.

WHY THIS EXISTS
    paracore-gen and paracore-takeoff never load CoreScript.Engine — they reach Revit
    over gRPC. Their coupling to the engine is therefore *documentation*: prompt and
    skill files that TELL the AI which methods to emit. A method retired in the engine
    but still named in a prompt is invisible to the compiler and to every build — the
    AI simply writes a script that will not compile at runtime.

    So "is the MCP based on the current engine?" is a TEXT question, and it needs a
    text instrument that can both EXTRACT and MATCH.

METHOD (and why it is built this way)
    Claim: "method M named in the MCP is a real engine member."
    Instrument: parse C# declarations with a regex, then set-difference.
    A regex that anchors on end-of-line after grep -o silently returns 0 rows — a
    check with a failure mode of its own. So we do the extraction in Python where the
    anchors are explicit, and we PRINT the population sizes: an empty scan must FAIL,
    not pass (a gate that silently skips is not a gate).

    Names are grouped by a `Claim` class:
      * engine member  — must be declared in the engine
      * BCL / system   — List, Dictionary, Math, Console, ... (not ours)
      * domain literal — GetElements("Walls") style, handled by the engine's own facade
      * test scaffold  — names the checker itself uses
    Only the first class is asserted; the rest are reported so the exclusions are
    visible rather than baked in.
"""

import re
import sys
from pathlib import Path

# ⚠⚠ `paracore-pro` was DELETED (2026-10-09 user ruling) and this scan kept pointing
#   at it until 2026-10-10: every root below then did not exist, `engine_members()`
#   returned an EMPTY set, and the scan reported "clean" while checking nothing.
#   The roots are now the three LIVE repos.
PARACORE = Path(r"C:\Users\seyou\Paracore\paracore")
# ⚠⚠ THE INSTRUCTION SURFACE MOVED (2026-10-13). The shared core — the prompts and the nine
#   shared method skills — used to live in `paracore-gen/mcp_core/`. It now lives in the
#   ENGINE repo at `paracore/mcp/mcp_core/`, imported by every MCP. A gate still pointing at
#   `paracore-gen/mcp_core` globs ZERO files — precisely the "an empty scan must FAIL"
#   failure this file's own docstring warns about.
# ⚠ SCOPE, MEASURED not assumed. Adding the DOMAIN skills (`paracore-model/skills`,
#   `paracore-family/skills`) to this scan takes section A from 0 to 23 "unrecognised
#   everywhere" names — every one a raw Revit API name taught by `project-modeling`
#   (`NewRoomTag`, `OpenDocumentFile`, `MoveElement`, `RotateElement`, `SetCompoundStructure`,
#   …). Same category as `family-authoring`, but `project-modeling` does NOT declare itself a
#   Revit-API page the way family-authoring does, so the declaration test cannot exempt it.
#   Left OUT on purpose: it would turn a green gate red on correct names. Widening it means
#   first teaching the declaration test `project-modeling`'s mixed page.
# ⚠ paracore-gen is a SIBLING of paracore, NOT inside it. A path relative to PARACORE
# silently matched only the takeoff generators, which made the scan look alive while
# covering ~5% of the surface. Measure the population, never assume the path.
MCP = PARACORE / "mcp" / "mcp_core"
TAKEOFF = Path(r"C:\Users\seyou\Paracore\paracore-takeoff") / "takeoff"

# ---- 1. engine public members ------------------------------------------------
# The engine exposes FOUR different declaration shapes, and a pattern that handles
# only the first produces confident false alarms (this file's first draft called
# GetElements, Doc and BarGraph "phantom" — all three are live, I have called them
# in Revit):
#
#   method            public static void BarGraph(object data)
#   generic method    public static IEnumerable<T> OrderByParam<T>(this ...)
#   property          public static Document Doc => Globals.Doc;
#   expression method public static Element Pick() => Doc.GetElement(...);
#
# So: match `public <modifiers> <Type> <Name>` followed by EITHER `(` or `=>`.
DECL = re.compile(
    r"public\s+(?:static\s+|partial\s+|async\s+|sealed\s+|override\s+|virtual\s+)*"
    r"(?:[\w\.<>,\[\]\?]+\s+)?"             # optional return type
    r"(?P<name>[A-Z][A-Za-z0-9_]*)\s*"      # the member name
    r"(?:<[^>()\n]*>)?\s*"                  # optional generic arity
    r"(?:\(|=>)"                            # a parameter list OR an expression body
)

def members_in(roots):
    """Public member names declared under each root. THE shared scanner."""
    names = set()
    files = 0
    for root in roots:
        if not root.exists():
            continue
        for cs in root.rglob("*.cs"):
            # skip build output and the test tree — we want SHIPPED members only
            low = str(cs).lower()
            if any(s in low for s in ("\\obj\\", "\\bin\\", "\\.kilo\\", "\\tests\\")):
                continue
            files += 1
            text = cs.read_text(encoding="utf-8-sig", errors="replace")
            for m in DECL.finditer(text):
                names.add(m.group("name"))
    return names, files


ENGINE_ROOTS = [
    PARACORE / "CoreScript.Engine" / "Globals",
    PARACORE / "Paracore.Addin",
    PARACORE / "Paracore.Shim",
]


def engine_members():
    return members_in(ENGINE_ROOTS)


def pack_members():
    """The TAKEOFF pack's own declarations.

    ⚠ A pack is a SEPARATE assembly. Its members are NOT in the engine — a
    `partial class` cannot span assemblies, which is why a pack announces its own
    script-facing type instead. So a name the takeoff MCP emits may legitimately
    be declared here and NOT in `paracore`; asserting it against the engine alone
    reports ~24 false positives. See the master spec's PACK rule.
    """
    return members_in([TAKEOFF.parent / "pack"])


# ---- 2. what the MCP tells the AI to call ------------------------------------
CALL = re.compile(r"\b([A-Z][A-Za-z0-9_]{2,})\s*\(")

# Files excluded from the assertion because they declare themselves as Revit-API
# documentation. Filled by mcp_names(); printed so the exclusion is visible.
OUT_OF_SCOPE = []

# Names extracted from MCP text that are NOT engine members and are NOT claimed to be.
# Each carries its reason so the exclusion is auditable rather than hidden.
NOT_OURS = {
    # .NET BCL / third-party
    "List", "Dictionary", "HashSet", "StringBuilder", "Math", "Console", "Task",
    "JsonSerializer", "JsonConvert", "Enumerable", "Convert", "ConvertAll",
    "Regex", "File", "Directory", "Path", "Guid", "DateTime", "TimeSpan",
    "Exception", "ArgumentNullException", "ArgumentException", "Element",
    "IEnumerable", "ICollection", "IReadOnlyList", "Nullable", "Tuple", "Func",
    "Action", "Comparer", "StringComparison", "CultureInfo", "Uri", "Encoding",
    # MCP / python / protocol scaffold
    "FastMCP", "Context", "CallToolResult", "TextContent", "ImageContent",
    "Tool", "Field", "BaseModel", "Any", "Optional", "Union", "Literal",
    # names the CHECKER uses
    "PrintNoMatch", "Python",
    # Raw Revit API taught by the `project-modeling` skill — rooms, roofs, family
    # loading, warnings. These are Autodesk members, not ours: the same category as
    # the whole `family-authoring` page, but `project-modeling` ALSO teaches the
    # Paracore API, so it cannot be exempted wholesale (see the declaration test in
    # mcp_names) without losing coverage of our own names. Flagged 2026-10-07.
    "NewRoom", "NewFootPrintRoof", "CurveArray", "LoadFamily",
    "GetFamilySymbolIds", "GetWarnings", "CreateSimpleCompoundStructure",
    "FEET",
}

def mcp_names():
    """Every capitalized call-shaped token in the MCP instruction surface.

    WHICH FILES MAKE AN ENGINE CLAIM
        Not all of them, and the difference matters:

        * `prompts/*.md` and the Paracore-facing `skills/*/SKILL.md` teach the
          *Paracore script API* — `GetElements(...)`, `.Table()`. A name here is a
          **claim about our engine**, and is asserted.
        * `skills/family-authoring/SKILL.md` teaches the **raw Revit API**
          (`EditFamily`, `RotateProfile`, `NewSymbolicCurve`) — its own header says
          "All signatures on this page were read off the live Revit 2025 API by
          reflection." Those names are NOT ours and must not be asserted here, or
          the check drowns in ~100 correct Revit members.
        * `rap-server/.../takeoff_tools.py` embeds column names inside docstrings
          ("WeightPerM (kg/m)") and builds C# in f-strings — the call-shaped token
          regex picks up the *columns*, which are not methods at all. Its actual
          emitted method names are asserted separately, by the list below.
    """
    files = []
    for pat in ("prompts/*.md", "skills/*/SKILL.md"):
        for f in sorted(MCP.glob(pat)):
            text = f.read_text(encoding="utf-8", errors="replace")
            # Raw-Revit-API teaching pages are out of scope BY THEIR OWN DECLARATION,
            # not by a hardcoded filename list. Each of these says, in its own words,
            # that it documents the Autodesk API — so asserting our engine's members
            # against them is a category error, not a finding. Detecting the claim
            # keeps the exemption honest: delete that sentence and the file is
            # checked again.
            declares_revit_api = (
                "read off the live Revit 2025 API by reflection" in text
                or "using the raw Revit API" in text
            )
            if declares_revit_api:
                OUT_OF_SCOPE.append(f.parent.name + "/" + f.name)
                continue
            files.append(f)

    found = {}
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        for m in CALL.finditer(text):
            found.setdefault(m.group(1), set()).add(f.name)
    return found, files


def takeoff_emitted_names():
    """The engine methods the takeoff MCP actually writes into generated C#.

    Built from the `"Name("` string fragments in the generators, because the file
    is Python that emits C# — a text scan of it cannot tell a column name from a
    method without this focus.
    """
    src = (TAKEOFF / "takeoff_tools.py").read_text(encoding="utf-8", errors="replace")
    # names the generators interpolate into C# snippets
    return set(re.findall(r"\b((?:Get|Compute|Apply|Clear|Classify|Set)[A-Z]\w{2,})\s*\(", src))



# ---- 3. classification -------------------------------------------------------
# A name the MCP teaches is not automatically a claim about OUR engine. The skills
# legitimately teach three other vocabularies, and conflating them produces a
# 203-row noise list that buries the one real finding. So classify, then assert
# only on the class that carries a claim.

# Revit API / .NET members that appear in the engine's OWN source as calls.
# Test: present in >=1 shipped .cs file. That is evidence the name is real
# vocabulary the engine itself uses, so the MCP teaching it is correct.
def build_known_vocabulary():
    """Every identifier used as a call ANYWHERE in shipped engine source."""
    roots = [PARACORE / "CoreScript.Engine", PARACORE / "Paracore.Addin", PARACORE / "Paracore.Shim"]
    vocab = set()
    for root in roots:
        if not root.exists():
            continue
        for cs in root.rglob("*.cs"):
            low = str(cs).lower()
            if any(s in low for s in ("\\obj\\", "\\bin\\", "\\.kilo\\")):
                continue
            vocab.update(CALL.findall(cs.read_text(encoding="utf-8-sig", errors="replace")))
    return vocab


def main():
    members, cs_files = engine_members()
    named, doc_files = mcp_names()
    vocabulary = build_known_vocabulary()
    emitted = takeoff_emitted_names()

    print("=" * 78)
    print("MCP -> ENGINE DRIFT CHECK")
    print("=" * 78)
    print(f"engine source files scanned : {cs_files}")
    print(f"engine public members found : {len(members)}")
    print(f"identifiers in engine source: {len(vocabulary)}")
    print(f"MCP prompt/skill files      : {len(doc_files)}")
    print(f"  out of scope (Revit-API pages, by their own declaration): "
          f"{len(OUT_OF_SCOPE)}")
    for f in sorted(set(OUT_OF_SCOPE)):
        print(f"      {f}")
    print(f"distinct call-shaped names  : {len(named)}")
    print(f"takeoff MCP emitted methods : {len(emitted)}")
    print()

    # A GATE MUST NOT SILENTLY SKIP (rule 3) — an empty scan is a FAILURE.
    if cs_files == 0 or len(members) < 200:
        print(f"CHECK FAILED: engine scan is empty or implausibly small "
              f"({cs_files} files, {len(members)} members). "
              f"The extractor is broken, not the code.")
        return 1
    # ⚠⚠ THE FILE COUNT IS NOT THE INVARIANT — IT WAS THE LAYOUT. This guard read
    #   `len(doc_files) < 15`, which was true when `prompts/` held ten files. The 2026-10
    #   progressive-disclosure restructure consolidated eight of them into `catalog.md`, leaving
    #   2 prompts + 9 skills = 11 files (10 after the out-of-scope exclusion), so the guard began
    #   failing on a HEALTHY tree and reported "the extractor is broken" about an extractor that
    #   was fine. That is a ROTTED ANCHOR — retarget it, never delete it, because its real job is
    #   "prove the scan saw something".
    #   The invariant that survives a restructure is the CANARY below: a name every instruction
    #   surface teaches must be visible to the scan, whatever the file count happens to be.
    if len(doc_files) < 3 or len(named) < 100:
        print(f"CHECK FAILED: MCP scan produced {len(named)} names from "
              f"{len(doc_files)} files. The extractor is broken.")
        return 1
    if "GetElements" not in named:
        print("CHECK FAILED: the MCP scan never saw `GetElements`, which every prompt and skill "
              "teaches. The extractor is under-matching, so every name it reports is suspect.")
        return 1

    # TEETH: the extractor must find members whose existence is NOT in doubt.
    # Each was confirmed live in Revit (GetElements/Table from a REPL run) or by
    # reading its declaration. If any is missing, the extractor is under-matching
    # and every "phantom" it reports is suspect — so fail loudly rather than
    # produce a confident list of false positives.
    # ⚠ `GetRoomData` was REMOVED 2026-10-10. It exists nowhere in the engine any
    #   more — it came from the DELETED `paracore-pro` — so asserting it "live"
    #   made the self-test fail for a reason that had nothing to do with the
    #   extractor. An anchor that outlives its member is a false alarm, not a
    #   finding; retarget it, never trust it.
    known = ["GetElements", "Table", "BarGraph", "Doc", "ActiveView", "Selection",
             "Println", "OrderByParam", "SumParam", "WhereMatches", "Transact",
             "GetMagicNames"]
    missed = [k for k in known if k not in members]
    if missed:
        print(f"CHECK FAILED: extractor missed known-live member(s): {missed}")
        print("Refusing to report drift — an under-matching extractor invents it.")
        return 1
    print(f"extractor self-test: found all {len(known)} known-live members  OK")
    print()

    unknown = sorted(n for n in named if n not in members and n not in NOT_OURS)
    # Of those, which are NOT recognised vocabulary anywhere in the engine?
    # Those are the only ones that could be a stale/phantom name.
    phantom = [n for n in unknown if n not in vocabulary]
    # The takeoff MCP writes C# — a name it emits that NEITHER the engine NOR its
    # own pack declares is a guaranteed runtime compile error in the user's Revit.
    pack, pack_files = pack_members()
    stale_emitted = sorted(n for n in emitted if n not in members and n not in pack)

    # Part A's residual is prose noise: an English word followed by a parenthesis
    # ("LINQ (not SQL)", "FAST (filter first)", "NUMBER (count)"), a bare TYPE name
    # ("String", "Int"), or a name the docs explicitly say does NOT exist
    # (catalog.md: "`.Bar()` does NOT exist"). Classify those as NOISE so the
    # verdict keys on Part B — the part that is a hard, behavioural claim.
    # ⚠ Each entry below was READ IN ITS SENTENCE before being excused — a word is
    #   not noise because it looks like noise, it is noise because the text around
    #   it says so. Two were added 2026-10-10 after that reading:
    #     catalog.md:256  "...over raw API (LookupParameter, get_Parameter)"  -> prose
    #     linq-rules.md:31 "- `.Take(n)`, `.Skip(n)`, `.First()` ..."          -> BCL LINQ
    PROSE_WORDS = {
        "LINQ", "FAST", "Fast", "PATTERNS", "Patterns", "NUMBER", "NUMBER",
        "Main", "Typed", "Input", "Int", "Integer", "Double", "String", "Total",
        "Bar", "View", "Document", "CurveLoop", "NewFamilyInstance",
        "API",                                  # "raw API (...)" — English, not a method
        "Skip", "Take", "First", "FirstOrDefault", "Any",  # System.Linq, not ours
    }
    real_phantom = [n for n in phantom if n not in PROSE_WORDS]
    ok = not real_phantom and not stale_emitted

    print("--- A. names taught in prompts/skills (advisory) ---")
    print(f"not a public engine member         : {len(unknown)}")
    print(f"  ...appear in engine code         : {len(unknown) - len(phantom)}"
          f"  (Revit API / BCL — legitimately taught)")
    print(f"  ...unrecognised everywhere       : {len(phantom)}")
    print(f"  ...and not prose/type noise      : {len(real_phantom)}")
    for n in real_phantom:
        where = ", ".join(sorted(named[n]))
        print(f"      {n:<38} {where}")
    print()
    print("--- B. methods the takeoff MCP writes into generated C# (ASSERTED) ---")
    # A takeoff generator with no extracted names means the extractor lost its
    # subject, not that the MCP is clean.
    if len(emitted) < 20:
        print(f"CHECK FAILED: extracted only {len(emitted)} emitted methods "
              f"(expected ~25). The extractor is broken.")
        return 1
    print(f"emitted methods not declared in engine: {len(stale_emitted)}")
    for n in stale_emitted:
        print(f"      {n}")
    print()
    print("=" * 78)
    if ok:
        print("VERDICT: CLEAN")
        print("  The takeoff MCP's generated C# resolves 100% against the engine,")
        print("  and no prompt teaches a Paracore method the engine does not have.")
    else:
        print("VERDICT: REVIEW ABOVE")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
