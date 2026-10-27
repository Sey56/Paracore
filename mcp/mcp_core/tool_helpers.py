"""
Shared helper functions used by both PydanticAI agent tools (v4_repl_agent.py)
and MCP server tools (mcp_server.py).

Extracted to eliminate ~45 lines of duplicated search logic and ~20 lines
of duplicated result-wrapping logic.
"""

import re
from typing import Any, Dict, Optional

# Known Revit storage types that LLMs sometimes append to parameter names
# ⚠ "Reference" is here because an ADD-IN built before 2026-10-27 disambiguated two
#   parameters that share a name by appending their storage type ("Level [Reference]").
#   It is not a storage type and it is not part of the name — GetStr("Level [Reference]")
#   returns "" on the live model. Stripping it makes a copied name work again.
_TYPE_SUFFIXES = [
    'String', 'Double', 'Integer', 'ElementId', 'Length', 'Area', 'Volume',
    'Boolean', 'YesNo', 'Number', 'Text', 'Enum', 'Reference',
]

# ── Code checks — two tiers with deliberately different consequences ─────────
#
# _HARD_ERRORS — code that CANNOT work. It will not compile, calls something that
#   does not exist, or uses a method in a way that always throws. These BLOCK
#   execution, because running them only burns a round-trip to learn what we
#   already know.
#
# _LINT_RULES — code that RUNS but breaks convention or is likely to produce a
#   WRONG ANSWER (raw Revit API where a Paracore method is safer, hardcoded unit
#   maths, output that goes nowhere). ADVISORY only — attached to the result,
#   never blocking. The agent sees them and self-corrects without paying for a
#   failed call.
#
# Demoted from hard blocks to lint on 2026-09-30. The previous behaviour
# hard-blocked `.OrderBy(x => ...)` even on a plain List<string>, where the
# suggested replacement (.OrderByParam) does not exist — advice that cannot be
# followed, at the cost of a round-trip. Capability boundaries belong at the
# permission layer, not in regexes over source text.
#
# Each tuple: (regex, message). Order matters — more specific first.

_HARD_ERRORS: list[tuple[str, str]] = [
    # .Select() after .GroupByParam() is not supported by the pipeline.
    (
        r'\.GroupByParam\s*\([^)]+\)\s*\.\s*Select\s*\(',
        'NEVER chain .Select() after .GroupByParam(). Chain .Table() directly: .GroupByParam("Level").Table()'
    ),
    # `doc` / `document` are not defined — only the injected global `Doc` exists.
    # ⚠⚠ The `(?=\w)` guard is load-bearing. Without it these match the ENGLISH WORD at the
    #    end of a sentence, so a comment or string reading "...the active document." is
    #    BLOCKED as a hard error. Measured 2026-10-02: the family build template was rejected
    #    on exactly two such comments. A false positive on the BLOCKING layer costs a
    #    round-trip and cannot be worked around by ignoring advice — far worse than a lint.
    #    With the guard, only a real member access (`document.SaveAs`, `doc.Delete`) matches.
    (
        r'(?-i:(?<![.\w])doc\.(?=\w))',
        'Use Doc (capital D) — it\'s the global Revit Document. doc (lowercase) is not defined.'
    ),
    (
        r'(?-i:(?<![.\w])document\.(?=\w))',
        'Use Doc (capital D) — only the injected global exists; `document` is not defined.'
    ),
    # Transact() requires a name string as its first argument.
    (
        r'Transact\s*\(\s*\(',
        'Transact() requires a name string: Transact("description", () => { ... }). Do NOT call Transact(() => {}) — the first argument must be a string label.'
    ),
    # CombinedParams() takes no arguments.
    (
        r'\.CombinedParams\s*\([^)]+\s*\)',
        'CombinedParams() takes NO arguments — it returns ALL instance+type parameters for a single element. Use: element.CombinedParams().Table() or element.CombinedParams().Peek(). To filter specific parameters, use .Select() with .GetStr()/.GetNum() instead.'
    ),
    # .SetVal()/.SetNum() are single-element — chaining them off a filter throws.
    (
        r'\.WhereParam\s*\([^)]+\)\s*\.\s*Set(?:Val|Num)\s*\(',
        '.SetVal() and .SetNum() work on SINGLE elements only (e.g., wall.SetVal("Comments", "Done")). For COLLECTIONS use .SetParam("Name", value) for bulk writes, or wrap in Transact("label", () => { foreach (var e in collection) { e.SetVal(...); } }).'
    ),
    # AllElements does not exist.
    (
        r'\bAllElements\b',
        'Use GetElements<T>() for typed retrieval or GetElements("Category") for string-based. "AllElements" does not exist — the correct global is GetElements.'
    ),
]

# Advisory only — attached to the result, never blocks execution.
_LINT_RULES: list[tuple[str, str]] = [
    # Display: foreach+Println for data output — only flag when used
    # as the PRIMARY display method (3+ Println calls in one loop),
    # not when used for quick debug checks.
    (
        r'foreach\s*\([^)]*\)\s*\{[^}]*Println[^}]*Println[^}]*Println',
        'Use .Select(x => new{...}).Table() instead of foreach+Println to display data. Quick debug loops with 1-2 Println calls are fine.'
    ),
    # Display: string.Join with Select for output
    (
        r'string\.Join\s*\([^)]*Select\s*\(',
        'Use .Select(x => new{...}).Table() instead of string.Join for data display.'
    ),
    # Raw element collection instead of GetElements.
    # ⚠⚠ GetElements<T>() has NO document overload — it always reads the ACTIVE document.
    #    Family authoring works on a SECOND document (NewFamilyDocument / EditFamily), where
    #    the collector is the ONLY option. Lint only the active-document case; otherwise the
    #    rule fires on correct code, and a lint that fires on correct code trains the agent
    #    to ignore lints. (Same failure class as D-MCP-2.)
    (
        r'new\s+FilteredElementCollector\s*\(\s*(?:Doc\s*)?\)',
        'Use GetElements<T>() instead of new FilteredElementCollector() on the ACTIVE '
        'document. ⚠ It collects by TYPE, so non-category elements are covered too — '
        'GetElements<Level>() IS the typed route for levels (it runs OfClass(typeof(Level)) '
        'underneath), and GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1") is '
        'how you find one by name. Use GetElements("Category") for a category by name. '
        'A collector over ANOTHER document (a family document, say) is correct and is not '
        'flagged.'
    ),
    # Raw parameter access
    (
        r'\.LookupParameter\s*\(',
        'Use .GetStr("Name") or .GetNum("Name") instead of .LookupParameter().'
    ),
    # get_Parameter BY NAME only. ⚠ get_Parameter(BuiltInParameter.X) is a different thing:
    #   it returns the Parameter OBJECT, which GetStr/GetNum cannot supply — and which family
    #   work needs for GetAssociatedFamilyParameter / AssociateElementParameterToFamilyParameter.
    (
        r'\.get_Parameter\s*\(\s*"',
        'Use .GetStr("Name"), .GetNum("Name", "unit"), or .GetVal("Name") instead of .get_Parameter("Name"). (get_Parameter(BuiltInParameter.X) returns the Parameter object and is not flagged.)'
    ),
    # Hardcoded unit conversion math
    (
        r'/ 304\.8|/\s*304\.8|\*\s*304\.8|\*\s*0\.3048|/\s*0\.3048|/\s*12\.0\b',
        'NEVER hardcode unit conversions. Use .InputUnit("mm") to convert TO internal feet, or .GetNum("Name", "mm") / .OutputUnit("mm") to convert FROM internal feet. The engine handles conversion — you don\'t need to know that 1ft = 304.8mm.'
    ),
    # Fully qualified Autodesk namespaces
    (
        r'Autodesk\.Revit\.\w+\.',
        'All Autodesk.Revit namespaces are pre-imported. Use short names: StructuralType.NonStructural (not Autodesk.Revit.DB.Structure.StructuralType.NonStructural), XYZ (not Autodesk.Revit.DB.XYZ). Drop the Autodesk.Revit.DB. prefix completely.'
    ),
    # Raw GetElement(new ElementId(...)) lookup
    (
        r'\.GetElement\(\s*new\s+ElementId\(',
        'Use id.ToElement(Doc) to resolve an ElementId, or GetElement<T>("name") to find by name, or GetElements<T>() to query all. Avoid .GetElement(new ElementId(...)).'
    ),
    # LINQ on element collections instead of Paracore equivalents.
    # NOTE: these are conventions, not errors. Plain LINQ over a NON-element list
    # (e.g. List<string> from reflection) is perfectly valid — the messages say so.
    (
        r'\.OrderByDescending\s*\(\s*\w+\s*=>',
        'Use .OrderByParamDesc("Name") instead of .OrderByDescending().'
    ),
    (
        r'\.OrderBy\s*\(\s*\w+\s*=>',
        'Use .OrderByParam("Name") instead of .OrderBy().'
    ),
    (
        r'\.Sum\s*\(\s*\w+\s*=>\s*\w+\.Get',
        'Use .SumParam("Name", "unit") instead of .Sum(e => e.GetNum(...)).'
    ),
    (
        r'\.Where\s*\(\s*\w+\s*=>\s*\w+\.\w+\s*[=<>!]',
        'Prefer .WhereParam("Name", "value") or .WhereParam("Name", ">", value, "unit") over .Where() on element collections. Use .Where(lambda) only for complex conditions with no Paracore equivalent.'
    ),
    (
        r'\.GroupBy\s*\(\s*\w+\s*=>\s*\w+\.GetStr\s*\(',
        'Use .GroupByParam("Name") instead of .GroupBy(e => e.GetStr(...)) for single-key grouping.'
    ),
    # Print instead of Println
    (
        r'(?<!\.)\bPrint\s*\(',
        'Use Println() (capital P, lowercase rintln) for console output. Print() is an alias that works but Println() is the canonical form.'
    ),
    # Console.WriteLine — runs, but the output is not captured.
    (
        r'Console\.WriteLine\s*\(',
        'Console.WriteLine() output is NOT captured by Paracore. Use Println() or the output is silently lost.'
    ),
]

# ── Suspicious Parameter Name Detection ────────────────────────────────────
# Soft warning only — cross-checks against schema cache before flagging.
# Real Revit params like "StopDepth", "IfcGUID", "UnderCut" are PascalCase
# (no spaces, each word capitalized) and must NOT be blocked.
#
# ⚠⚠ ONLY a string passed as the PARAMETER-NAME argument of a Paracore call is a
#    candidate. The previous rule scanned EVERY quoted PascalCase string in the
#    snippet, so it fired on code that has nothing to do with parameters.
#    Measured 2026-10-08 on the installed build:
#      typeof(IndependentTag).GetProperty("TagOrientation")
#      m.Name.StartsWith("NewRoom")
#    produced `Note: "TagOrientation", "TagOrientation", "NewRoom" has no spaces —
#    Revit parameters use spaces ...` — three names, none of them a parameter.
#    A warning that fires on correct code trains the agent to ignore warnings
#    (the same failure class as D-MCP-2), and it costs tokens on every
#    reflection-heavy snippet. Narrowed to the call sites that actually take a
#    parameter name; a mistyped `.GetStr("FireRating")` is still caught.
_PARAM_NAME_CALL_RE = re.compile(
    r'\b(?:GetStr|GetNum|GetVal|GetInt'
    r'|GetTypeStr|GetTypeNum|GetTypeVal|GetTypeInt'
    r'|WhereParam|WhereAnyParam|WhereTypeParam|WhereMaterial|WhereMaterialNot'
    r'|GroupByParam|OrderByParam|OrderByParamDesc|SumParam'
    r'|SetVal|SetNum|SetParam'
    r'|SetTypeStr|SetTypeNum|SetTypeVal|SetTypeInt'
    r')\s*\(\s*"([^"]*)"'
)

# PascalCase with no space: at least one lower→upper transition. Applied only to
# the captured argument above.
_SUSPICIOUS_NAME_RE = re.compile(r'^[A-Z][^" ]*[a-z][A-Z][^" ]*$')


def check_suspicious_param_names(code: str) -> str:
    """Find parameter-name arguments that are PascalCase (no spaces) and NOT in the schema cache.

    Returns a warning string if suspicious names are found, or empty string.
    Does NOT block execution — real params like StopDepth/IfcGUID exist.
    """
    suspicious = [n for n in _PARAM_NAME_CALL_RE.findall(code)
                  if _SUSPICIOUS_NAME_RE.match(n)]
    if not suspicious:
        return ""

    # Cross-check against schema cache — if the name exists in ANY cached
    # category, it's a real Revit parameter, not a hallucination.
    try:
        from mcp_core.schema_cache import _cache as _schema_cache
        known: set[str] = set()
        for params in _schema_cache.values():
            for p in params:
                known.add(p.get("name", ""))
    except Exception:
        known = set()

    # Deduplicate, order preserved — one name repeated in three calls is one note.
    unknown = list(dict.fromkeys(n for n in suspicious if n not in known))

    if not unknown:
        return ""

    names = '", "'.join(unknown)
    return (
        f"Note: \"{names}\" has no spaces — Revit parameters use spaces "
        "(e.g., 'Fire Rating' not 'FireRating'). "
        "If the query returns empty results, verify the exact parameter name with "
        "_search_schema() or .First().CombinedParams().Table().\n\n"
    )


# ── Dangerous Pattern Detection ──────────────────────────────────────────────
# Two-tier security guard: BlockedAlways patterns have no legitimate use in any
# Paracore execution context (process spawn, registry, destructive I/O).
# BlockedAgentOnly patterns are blocked for AI agent / MCP execution but
# permitted for user-triggered console/gallery REPL.
# Each tuple: (regex, human-readable violation description).

# ── Comment / literal blanking ────────────────────────────────────────────────
# ⚠⚠ THE GUARD MUST SCAN CODE, NOT PROSE (2026-10-27, review round 6). These are text
#   scans, so until now the WORD "Process.Start" inside a comment was refused exactly as
#   if it were a call — and the engine's own skill text contains sentences like
#   "never write FilteredElementCollector". A rule that fires on documentation is a rule
#   the reader learns to ignore, which is how a real hit gets missed.
#   Every character is REPLACED, never removed: offsets and newlines survive, so anything
#   that later maps a diagnostic back to a line still lines up.
#   ⚠ Stated limitation: an interpolated string's HOLE (`$"{...}"`) is inside the literal
#     span and is blanked with it. No rule depends on code hidden inside a hole.
_NOISE = re.compile(
    r'''
        (?P<verbatim>@"(?:[^"]|"")*")      # @"..." with "" escapes
      | (?P<str>"(?:\\.|[^"\\\n])*")       # "..." (not multi-line)
      | (?P<char>'(?:\\.|[^'\\\n])*')      # 'x'
      | (?P<line>//[^\n]*)                 # // ...
      | (?P<block>/\*.*?\*/)               # /* ... */
    ''',
    re.VERBOSE | re.DOTALL,
)


def strip_code_noise(code: str) -> str:
    """Blank out comment bodies and string/char literal contents, preserving every offset."""
    return _NOISE.sub(lambda m: re.sub(r'[^\n]', ' ', m.group(0)), code)


_BLOCKED_ALWAYS: list[tuple[str, str]] = [
    (r'Process\.Start\s*\(',       "Process.Start() — spawning external processes"),
    (r'\bProcessStartInfo\b',      "ProcessStartInfo — spawning external processes"),
    (r'Environment\.Exit\s*\(',     "Environment.Exit() — killing the Revit process"),
    (r'Environment\.FailFast\s*\(', "Environment.FailFast() — killing the Revit process"),
    (r'Microsoft\.Win32\.Registry', "Windows Registry access"),
    (r'\bRegistryKey\b',            "Windows Registry access"),
    (r'Assembly\.Load\s*\(',        "Runtime assembly loading"),
    (r'Assembly\.LoadFrom\s*\(',    "Runtime assembly loading"),
    (r'Assembly\.LoadFile\s*\(',    "Runtime assembly loading"),
    (r'File\.Delete\s*\(',         "File.Delete() — destructive file deletion"),
    (r'Directory\.Delete\s*\(',    "Directory.Delete() — destructive directory deletion"),
    # ⚠⚠ MOVE AND REPLACE ARE AS DESTRUCTIVE AS DELETE (added 2026-10-27, review round 6).
    #   The README has always claimed agent code "may never replace, move or delete an existing
    #   file" — and the scan only refused `File.Delete` / `Directory.Delete`. A rule stated in
    #   the docs and not in the code is the exact defect class this file exists to avoid.
    (r'File\.Move\s*\(',           "File.Move() — moving/renaming an existing file"),
    (r'File\.Replace\s*\(',        "File.Replace() — overwriting an existing file"),
    (r'Directory\.Move\s*\(',      "Directory.Move() — moving an existing directory"),
    (r'\bFile\.SetAttributes\s*\(', "File.SetAttributes() — changing an existing file's attributes"),
    # Instance-form equivalents. Bounded to one statement so a `FileInfo` used for READING
    # (`.Exists`, `.Length`, `.FullName`) stays allowed.
    (r'\b(?:FileInfo|DirectoryInfo)\b[^;]{0,200}\.(?:Delete|MoveTo|Replace|Encrypt|Decrypt|SetAccessControl)\s*\(',
     "FileInfo/DirectoryInfo destructive operation — delete/move/replace is the user's job"),
    (r'\bDllImport\b',             "P/Invoke (DllImport) — calling into native code"),
    (r'\bMarshal\s*\.',            "Marshal — unmanaged memory / native interop"),
    (r'System\.Runtime\.InteropServices', "native interop (System.Runtime.InteropServices)"),
]

_BLOCKED_AGENT_ONLY: list[tuple[str, str]] = [
    # ⚠⚠ THE ADVICE USED TO BE "use the pre-imported RestSharp instead" (2026-10-27) —
    #   which told the agent to swap one network client for another. RestSharp is a
    #   referenced assembly, so that was not a restriction at all; it was a redirect to
    #   the very capability the rule exists to deny. Network is off for agent code.
    (r'new\s+HttpClient\s*\(',     "HttpClient — network access is not available to agent code"),
    (r'HttpClient\s*\.',           "HttpClient — network access is not available to agent code"),
    (r'new\s+WebClient\s*\(',      "WebClient — network access is not available to agent code"),
    (r'WebClient\s*\.',            "WebClient — network access is not available to agent code"),
    (r'\bHttpWebRequest\b',        "HttpWebRequest — network access is not available to agent code"),
    (r'\bWebRequest\b',            "WebRequest — network access is not available to agent code"),
    (r'\bHttpRequestMessage\b',    "HttpRequestMessage — network access is not available to agent code"),
    (r'\bSystem\.Net\b',           "System.Net — network access is not available to agent code"),
    (r'new\s+Socket\s*\(',         "Raw socket — network access is not available to agent code"),
    (r'new\s+TcpClient\s*\(',      "Raw TCP socket — network access is not available to agent code"),
    (r'new\s+UdpClient\s*\(',      "Raw UDP socket — network access is not available to agent code"),
    (r'\bDns\s*\.',                "DNS lookup — network access is not available to agent code"),
    (r'\bSmtpClient\b',            "SMTP — network access is not available to agent code"),
    (r'\bFtpWebRequest\b',         "FTP — network access is not available to agent code"),
    (r'\bnew\s+Ping\s*\(',         "ICMP ping — network access is not available to agent code"),

    # ── REFLECTION: THE ENTRY POINTS, NOT THE TARGETS (2026-10-27, review round 6) ────────
    # ⚠ The previous round blocked `Type.GetType`, `Activator`, `.Assembly`, `GetMethod`,
    #   `MethodInfo`, `InvokeMember`, `DynamicMethod` — and the review walked straight past it
    #   with `AppDomain.GetAssemblies()` → `GetTypes()` → `GetConstructor(...)` → `Invoke(...)`
    #   plus `dynamic`, reaching a real HTTP GET. Every one of those was simply not in the list.
    #   A list of *some* reflection entry points is not a restriction; it is a hint. So the
    #   whole family is here now: enumerating types, resolving members, and constructing
    #   objects all have to be reachable before a target name can be hidden at runtime, and
    #   none of them are.
    # ⚠ `Cast<dynamic>()` is EXEMPT on purpose: it is the documented way to filter grouped
    #   rows (`aggregate-group` skill), it dispatches only on the row objects the engine just
    #   produced, and banning it would break a real recipe. What is refused is a dynamic
    #   DECLARATION or CAST, which is how a reflective object would be smuggled past the scan.
    (r'(?<!Cast<)\bdynamic\b',     "`dynamic` — runtime dispatch hides the call from every check; "
                                   "use the typed API (`Cast<dynamic>()` on grouped rows is the "
                                   "one allowed form)"),
    (r'\bAppDomain\b',             "AppDomain — enumerating assemblies/types is how the file and "
                                   "network policy was defeated"),
    (r'\bActivator\b',             "Activator — constructing a type by name"),
    (r'\bSystem\.Reflection\b',    "System.Reflection — reflection is not available to agent code"),
    (r'\bGetAssemblies\s*\(',      "GetAssemblies() — reflection"),
    (r'\bGetTypes\s*\(',           "GetTypes() — reflection"),
    (r'\bGetConstructor\s*\(',     "GetConstructor() — reflection"),
    (r'\bGetConstructors\s*\(',    "GetConstructors() — reflection"),
    (r'\bGetMethod\s*\(',          "GetMethod() — reflection"),
    (r'\bGetMethods\s*\(',         "GetMethods() — reflection"),
    (r'\bGetProperty\s*\(',        "GetProperty() — reflection"),
    (r'\bGetProperties\s*\(',      "GetProperties() — reflection"),
    (r'\bGetField\s*\(',           "GetField() — reflection"),
    (r'\bGetFields\s*\(',          "GetFields() — reflection"),
    (r'\bGetMember\s*\(',          "GetMember() — reflection"),
    (r'\bGetMembers\s*\(',         "GetMembers() — reflection"),
    (r'\bGetNestedType',           "GetNestedType() — reflection"),
    (r'\bInvokeMember\b',          "InvokeMember() — reflection"),
    (r'\bBindingFlags\b',          "BindingFlags — reflection"),
    (r'\bMethodInfo\b',            "MethodInfo — reflection"),
    (r'\bConstructorInfo\b',       "ConstructorInfo — reflection"),
    (r'\bDynamicMethod\b',         "DynamicMethod — runtime code generation"),
    (r'\bCreateDelegate\b',        "CreateDelegate() — a delegate is a call the scan cannot see"),
    (r'\.\s*Assembly\b',           "`.Assembly` — reaching the assembly to enumerate its types"),

    # ── THREADS: a script must not outlive its own call ───────────────────────────────────
    (r'\bThread\.Sleep\s*\(',      "Thread.Sleep() — a blocking call cannot be interrupted"),
    (r'new\s+Thread\s*\(',         "new Thread() — a background thread inside Revit's process"),
]


def check_dangerous_patterns(code: str, agent_only: bool = True) -> Optional[str]:
    """
    Scan C# code for dangerous/insecure patterns.

    Two-tier detection:
      Tier 1 (always): Security-critical patterns blocked for ALL execution
                       paths — process spawning, registry access, assembly
                       loading, destructive file/directory deletion.
      Tier 2 (agent_only=True): Patterns blocked only for AI agent / MCP
                       execution. Console/gallery REPL users may have
                       legitimate use for HttpClient, raw sockets, etc.,
                       so these are permitted when the user directly
                       triggers execution.

    Args:
        code: The C# source code to scan.
        agent_only: If True (default), applies Tier 2 restrictions for
                    agent/MCP execution. If False, only Tier 1 applies.

    Returns:
        None if the code passes all checks, or a formatted error message
        starting with the cross-mark emoji and listing each violation.
    """
    issues: list[str] = []
    seen: set[str] = set()

    # ⚠ Scan the CODE, not the prose — see strip_code_noise. This is the only change a caller
    #   can observe from the two lists below: a name inside a comment no longer counts.
    code = strip_code_noise(code)

    # Tier 1: Always blocked — no legitimate use case in any context
    for pattern, suggestion in _BLOCKED_ALWAYS:
        if suggestion in seen:
            continue
        if re.search(pattern, code, re.IGNORECASE | re.DOTALL):
            issues.append(suggestion)
            seen.add(suggestion)

    # Tier 2: Blocked for agent/MCP execution only
    if agent_only:
        for pattern, suggestion in _BLOCKED_AGENT_ONLY:
            if suggestion in seen:
                continue
            if re.search(pattern, code, re.IGNORECASE | re.DOTALL):
                issues.append(suggestion)
                seen.add(suggestion)

    if not issues:
        return None

    msg = "Dangerous pattern detected:\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += ("\nThese patterns have no legitimate use in Paracore scripts. "
            "Remove them before re-submitting.")
    return msg


# ── Read-only guard for explore_revit_data ───────────────────────────────────
# ⚠⚠ WHAT THIS IS, AND WHAT IT IS NOT (2026-10-27).
#   It is a MISTAKE-CATCHER for the discovery phase: it refuses the raw-Revit-API
#   writes that a snippet reaches for when no Paracore method fits. It is NOT a
#   sandbox and must never be described as one.
#
#   MEASURED before it existed (a pre-release review ran it live): a snippet of
#   `new Transaction(Doc, ...)` + `Parameter.Set(...)` passed every check and ran
#   inside explore_revit_data, and so did `Doc.Delete(...)` — the engine's own gate
#   (Paracore.Addin/Handlers/ReplHandler.cs, _writePatterns) scans for `.Delete()`
#   with EMPTY parens, which `Doc.Delete(id)` does not match.
#
#   WHAT IT CANNOT CATCH, by design:
#     * reflection — `typeof(Parameter).GetMethod("Set").Invoke(...)`. Exploration
#       legitimately uses reflection to discover properties, so blocking it would
#       break the tool's own job. It is out of scope here, not an oversight.
#     * a name assembled at runtime, or a call reached through another assembly.
#     * everything that is not a model write: `System` and `System.IO` are
#       PRE-IMPORTED for scripts (ScriptReferenceProvider.GetImports), so file and
#       environment access needs no `using` at all.
#   The real boundary is the per-session consent dialog (SessionGate) — a human
#   allows agent code once, and after that ANY code may run. Keep the docs saying so.
#
# ⚠ MIRROR: the same concept is enforced a second time in the addin
#   (ReplHandler._writePatterns) as a backstop for callers that never pass through
#   this module. A pattern added here is worth adding there too — but neither list
#   is allowed to be the only place the rule lives.
_READ_ONLY_WRITE_PATTERNS: list[tuple[str, str]] = [
    (r'new\s+Transaction\s*\(',        'new Transaction(...) — opens a raw Revit transaction'),
    (r'new\s+TransactionGroup\s*\(',   'new TransactionGroup(...) — groups and can commit transactions'),
    (r'new\s+SubTransaction\s*\(',     'new SubTransaction(...) — a nested write'),
    (r'\.Set\s*\(',                    'Parameter.Set(...) — writes a parameter value'),
    (r'\.Delete\s*\(',                 'Delete(...) — removes elements from the model'),
    (r'\.Regenerate\s*\(',             'Document.Regenerate() — forces a model update'),
    (r'\.SaveAs?\s*\(',                'Save()/SaveAs() — writes the model file'),
    (r'Doc\.Close\s*\(',               'Document.Close() — closes the document'),
    (r'\.NewFamilyInstance\s*\(',      'NewFamilyInstance(...) — creates an element'),
    (r'(?:Wall|Floor|Roof|Ceiling|Grid|Level)\.Create\s*\(',
                                       'Wall.Create / Floor.Create / ... — creates an element'),
    (r'\.CopyElements\s*\(',           'CopyElements(...) — duplicates elements'),
    (r'\.(?:Move|Rotate|Mirror)Element\s*\(',
                                       'MoveElement / RotateElement / MirrorElement — transforms elements'),
]


def check_read_only_violation(code: str) -> Optional[str]:
    """Refuse a write that reached `explore_revit_data`. None when nothing matched.

    Deliberately narrow: every pattern here is unambiguously a model change, so a
    refusal never costs a correct query. A guard that fires on correct code trains
    the caller to route around it — the failure this module exists to avoid.
    """
    issues = _scan(code, _READ_ONLY_WRITE_PATTERNS)
    if not issues:
        return None

    msg = "READ-ONLY BLOCK — this snippet contains a write:\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += (
        "\nexplore_revit_data is for DISCOVERY. A change to the model belongs in "
        "execute_dynamic_query, which transacts it and reports what changed.\n\n"
        "⚠ This list is a pattern scan and cannot see a call assembled through reflection. "
        "The engine backs it up: the whole snippet runs inside a transaction group that is "
        "ALWAYS rolled back, so a model write reached by any route is discarded — you would "
        "get a success and an unchanged model, which is worse than this refusal. Do not route "
        "around it: if you meant to write, say so and use the write tool."
    )
    return msg


# ── Agent file / network policy ──────────────────────────────────────────────
# ⚠⚠ THE RULE (operator, 2026-10-27): an agent MAY create a new file and MAY read
#   files. It may NEVER replace, move or delete an existing one — "even if it is the
#   one it created earlier" — because a replace cannot tell an output from something
#   important. The user deletes files; the agent does not. Network is off.
#
#   So the blessed write is `FileMode.CreateNew`, which THROWS when the path exists;
#   the agent then picks the next free name (_001, _002). The protection is .NET's,
#   not this scan's — this list only stops the APIs that would route around it.
#
# ⚠⚠ MIRROR — and the mirror is GATED. `Paracore.Addin/Handlers/ReplHandler.cs`
#   (`_agentPolicyPatterns`) enforces the identical patterns at the engine, which is
#   the only layer a direct gRPC caller cannot skip. `paracore-gen/tests/
#   test_tool_helpers.py::test_python_policy_matches_the_addin` parses that C# file and
#   FAILS if the two lists differ, so a pattern added to one cannot be forgotten in the
#   other. Keep the strings byte-identical — the gate compares them literally.
#
# ⚠ AGENT SOURCES ONLY. A human running a gallery tool keeps full file access:
#   RoomFinishUpdater reads a CSV and writes one, and that is the person's own action.
_AGENT_FILE_POLICY: list[tuple[str, str]] = [
    # Destruction / relocation
    (r"File\.Delete\s*\(",        "delete a file"),
    (r"Directory\.Delete\s*\(",   "delete a directory"),
    (r"File\.Move\s*\(",          "move or rename a file"),
    (r"Directory\.Move\s*\(",     "move or rename a directory"),
    (r"File\.Replace\s*\(",       "replace a file"),
    (r"File\.Copy\s*\(",          "copy a file over another"),
    (r"File\.SetAttributes\s*\(", "change file attributes"),
    (r"File\.OpenWrite\s*\(",     "open a file for writing (truncates it)"),
    # Opens that can touch an existing file. CreateNew is the ONLY safe mode.
    (r"FileMode\.Create(?!New)",  "open a file for writing (truncates or replaces it)"),
    (r"FileMode\.Truncate",       "truncate a file"),
    (r"FileMode\.Open",           "open an EXISTING file for writing"),
    # One-shot writers — all CreateOrOpen, so all can replace
    (r"File\.WriteAllText\s*\(",  "write a file (replaces it if it exists)"),
    (r"File\.WriteAllBytes\s*\(", "write a file (replaces it if it exists)"),
    (r"File\.WriteAllLines\s*\(", "write a file (replaces it if it exists)"),
    (r"File\.AppendAllText\s*\(", "append to a file"),
    (r"File\.AppendAllLines\s*\(", "append to a file"),
    (r"File\.AppendText\s*\(",    "append to a file"),
    (r"new\s+StreamWriter\s*\(",  "StreamWriter(path) truncates an existing file"),
    # Network
    (r"RestSharp",                "reach the network"),
    (r"HttpClient",               "reach the network"),
    (r"WebClient",                "reach the network"),
    (r"WebRequest",               "reach the network"),
    (r"new\s+Socket\s*\(",        "open a socket"),
    (r"TcpClient",                "open a socket"),
    (r"UdpClient",                "open a socket"),
    # Process / registry / assembly loading
    (r"Process\.Start\s*\(",      "start another process"),
    (r"Microsoft\.Win32\.Registry", "touch the Windows registry"),
    (r"RegistryKey",              "touch the Windows registry"),
    (r"Assembly\.Load",           "load another assembly"),
    # ⚠⚠ REFLECTION ENTRY POINTS (added 2026-10-27, pre-release review). Every scan above was
    #    defeated by building the TARGET name at runtime:
    #        typeof(object).Assembly.GetType("System." + "IO." + "File")
    #        Activator.CreateInstance(Type.GetType("System.Net.Http." + "HttpClient"))
    #    String splitting hides the target, but it cannot hide the MECHANISM — the entry point
    #    still has to be named. So these block the entry points rather than the target types,
    #    which is why a new spelling of "File" does not get around them.
    #    ⚠ Still not a sandbox: `dynamic`, a delegate to a library method, or a loop inside a
    #    framework call can route around this list. It raises the cost; it does not close it.
    (r"Type\.GetType\s*\(",       "resolve a type at runtime (reflection)"),
    (r"\.Assembly\b",             "reach the reflection API"),
    (r"Assembly\.(Load|GetType|CreateInstance)", "load or resolve an assembly"),
    (r"Activator",                "construct a type at runtime (reflection)"),
    (r"System\.Reflection",       "use the reflection API"),
    (r"GetMethod",                "look up a method at runtime (reflection)"),
    (r"MethodInfo",               "use the reflection API"),
    (r"InvokeMember",             "invoke a member by name (reflection)"),
    (r"DynamicMethod",            "emit a method at runtime"),
    (r"DllImport",                "call native code"),
    (r"Marshal\.",                "reach unmanaged memory"),
    # A single blocking call cannot be interrupted by the loop-level timeout, and sleeping has
    # no use in a takeoff script. Refused so the one MEASURED way to freeze Revit is gone.
    (r"Thread\.Sleep\s*\(",       "sleep (blocks Revit; the timeout cannot interrupt it)"),
    # ⚠⚠ THE REST OF THE REFLECTION FAMILY (added 2026-10-27, review round 6). The list above
    #    named `Type.GetType`, `Activator`, `.Assembly`, `GetMethod` — and the review walked
    #    past every one of them with `AppDomain.GetAssemblies()` → `GetTypes()` →
    #    `GetConstructor(...).Invoke(...)` plus `dynamic`, reaching a real HTTP GET to
    #    example.com. Naming SOME entry points is a hint, not a restriction: to hide a target
    #    name you still have to ENUMERATE the assembly, RESOLVE the member and CONSTRUCT the
    #    object, so all three families are refused. ⚠ MIRRORED in ReplHandler.cs, same order.
    (r"AppDomain",                "enumerate assemblies/types at runtime (reflection)"),
    (r"GetAssemblies\s*\(",       "enumerate loaded assemblies (reflection)"),
    (r"GetTypes\s*\(",            "enumerate types (reflection)"),
    (r"GetConstructor\s*\(",      "look up a constructor at runtime (reflection)"),
    (r"GetConstructors\s*\(",     "look up constructors at runtime (reflection)"),
    (r"GetMembers\s*\(",          "look up members at runtime (reflection)"),
    (r"GetFields\s*\(",           "look up fields at runtime (reflection)"),
    (r"GetProperties\s*\(",       "look up properties at runtime (reflection)"),
    (r"GetProperty\s*\(",         "look up a property at runtime (reflection)"),
    (r"GetField\s*\(",            "look up a field at runtime (reflection)"),
    (r"GetMember\s*\(",           "look up a member at runtime (reflection)"),
    (r"GetNestedType",            "enumerate nested types (reflection)"),
    (r"CreateDelegate",           "turn a method into a delegate the scan cannot see"),
    (r"ConstructorInfo",          "use the reflection API"),
    # Network, the namespace form: the named clients above are only the common spellings.
    (r"System\.Net",              "reach the network"),
    (r"HttpRequestMessage",       "reach the network"),
    (r"Dns\.",                    "reach the network"),
    (r"SmtpClient",               "reach the network"),
    # Process and threads.
    (r"ProcessStartInfo",         "start another process"),
    (r"new\s+Thread\s*\(",        "start a background thread inside Revit's process"),
    (r"System\.Runtime\.InteropServices", "call native code"),
    # The instance form of the destructive file ops, bounded to one statement so a FileInfo
    # used for READING (.Exists, .Length, .FullName) stays allowed.
    (r"FileInfo\b[^;]{0,200}\.(Delete|MoveTo|Replace)", "delete or move a file"),
    (r"DirectoryInfo\b[^;]{0,200}\.(Delete|MoveTo|Replace)", "delete or move a directory"),
]


def is_agent_source(source: str) -> bool:
    """Mirror of `SessionGate.IsAgentSource` — one rule, one spelling: 'agent' in the source."""
    return "agent" in (source or "").lower()


def check_agent_file_policy(code: str, source: str) -> Optional[str]:
    """Refuse file/network use by AGENT code. None when the code is clean or not an agent.

    Manual sources (REPL, gallery, playlists) are never scanned — a person running their
    own tool keeps full file access.
    """
    if not is_agent_source(source):
        return None

    # ⚠ Scan the CODE, not the prose — see strip_code_noise. Mirrored in ReplHandler.cs
    #   (StripCodeNoise), so the two layers agree on what counts as a call.
    code = strip_code_noise(code)

    for pattern, reason in _AGENT_FILE_POLICY:
        if re.search(pattern, code):
            return (
                f"BLOCKED — agent file policy: {reason}.\n\n"
                "Agent code MAY create a new file and MAY read files. It may NEVER replace, "
                "move or delete an existing file — not even one it wrote earlier in this "
                "session — and it may not use the network. Deleting files is the user's job.\n\n"
                "To write an output, create it with FileMode.CreateNew and pick a new name if "
                "it already exists (report.csv, then report_001.csv, report_002.csv, …):\n\n"
                "  var bytes = Encoding.UTF8.GetBytes(text);\n"
                "  using (var fs = new FileStream(path, FileMode.CreateNew))\n"
                "      fs.Write(bytes, 0, bytes.Length);\n\n"
                "CreateNew THROWS when the path exists. That is the protection, not a bug to "
                "work around: choose another name and try again.\n\n"
                "⚠ This policy is a PATTERN SCAN, enforced twice (here and at the engine), and a "
                "pattern scan is a best-effort net, not a sandbox. The REFLECTION ENTRY POINTS "
                "are refused (Type.GetType, Activator, .Assembly, System.Reflection, GetMethod, "
                "MethodInfo, Marshal, DllImport), so a type name assembled at runtime cannot be "
                "resolved to reach File, HttpClient or Process that way. What is still not "
                "covered: `dynamic`, a delegate obtained from a framework method, and a loop "
                "inside a framework call. The real boundary is the one-time session consent "
                "dialog and the person at the machine, so do not treat this refusal, or its "
                "absence, as a permission."
            )
    return None


def _scan(code: str, rules: list[tuple[str, str]]) -> list[str]:
    """Return the deduplicated messages for every rule that matches."""
    issues: list[str] = []
    seen: set[str] = set()
    for pattern, message in rules:
        if message in seen:
            continue
        if re.search(pattern, code, re.IGNORECASE | re.DOTALL):
            issues.append(message)
            seen.add(message)
    return issues


def check_paracore_compliance(code: str) -> Optional[str]:
    """
    BLOCKING check — only code that genuinely cannot work.

    Returns None if the code is runnable, or an error listing the constructs that
    will fail. Deliberately narrow: everything here would throw or fail to compile,
    so refusing costs nothing. Style and convention live in
    lint_paracore_conventions(), which never blocks.
    """
    issues = _scan(code, _HARD_ERRORS)
    if not issues:
        return None

    msg = "This code cannot run — fix these before resubmitting:\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += ("\nCall the `_read_extension_methods` TOOL for the complete method catalog, "
            "or `_read_extension_methods(\"method-name\")` for one method's syntax.")
    return msg


def lint_paracore_conventions(code: str) -> Optional[str]:
    """
    ADVISORY check — code that runs but probably misbehaves. Never blocks.

    The result is attached to the execution output so the agent can self-correct
    without paying for a failed call. Absence of a lint is not proof the code is
    right; it only means it did not match a known pattern.
    """
    issues = _scan(code, _LINT_RULES)

    # foreach + .SetVal()/.SetNum() without Transact(): runs fine, but creates one
    # undo entry per iteration instead of one for the whole loop.
    if (re.search(r'foreach\s*\(', code)
            and re.search(r'\.Set(?:Val|Num)\s*\(', code)
            and not re.search(r'Transact\s*\(', code)):
        issues.append(
            'foreach with .SetVal()/.SetNum() is not wrapped in Transact(). It will run, '
            'but each iteration creates its own undo entry, cluttering the undo stack. '
            'Wrap the loop: Transact("label", () => { foreach (...) { e.SetVal(...); } }).'
        )

    if not issues:
        return None

    msg = "CONVENTION NOTES (advisory — your code was still executed):\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += "\nPrefer the Paracore method where one exists — see the `read_skill` skills.\n\n"
    return msg


def sanitize_csharp_code(code: str) -> str:
    """
    Strip [Type] annotations from quoted strings in C# code.
    LLMs sometimes write "Level [String]" instead of just "Level".
    This runs automatically before every execution so the agent can't get it wrong.

    Examples:
        .GroupByParam("Level [String]")  →  .GroupByParam("Level")
        .WhereParam("Area [Double]", ">", 25, "m2")  →  .WhereParam("Area", ">", 25, "m2")
    """
    for suffix in _TYPE_SUFFIXES:
        # Match " [Suffix]" or " (Suffix)" inside double quotes
        code = re.sub(
            rf'"([^"]*?)\s*[\[(]\s*{re.escape(suffix)}\s*[\])]\s*"',
            r'"\1"',
            code,
            flags=re.IGNORECASE
        )
    return code


def _head_sections(doc: str, budget: int = 8000) -> str:
    """The start of the catalogue, cut on a SECTION boundary rather than mid-snippet.

    ⚠⚠ A raw `doc[:budget]` lands wherever the budget falls — the pre-release review found
    section 4 sliced in half, which reads as a corrupted document and wastes a round trip
    working out that it is merely truncated. Cut at the last complete heading, and say
    plainly where it stopped and how to get the rest.
    """
    if len(doc) <= budget:
        return doc
    cut = doc.rfind("\n## ", 0, budget)
    if cut == -1:
        cut = doc.rfind("\n### ", 0, budget)
    if cut == -1:
        cut = budget
    return (doc[:cut].rstrip()
            + f"\n\n… [TRUNCATED at {cut:,} of {len(doc):,} characters. This is the START of "
              "the catalogue, NOT all of it. Call read_extension_methods with a query — "
              "e.g. \"WhereParam\", \"Table\", \"Transact\" — to get one method or section.]")


def search_extension_methods(query: str, doc: str) -> str:
    """
    Search the EXTENSION_METHODS.md content for a specific method or topic.

    Three-pass search, ordered by precision:
      1. Exact method-name match (### `method.Name()` header) — extracts that subsection.
      2. Section header match (## Section containing keyword) — extracts whole section.
      3. Keyword search with context, deduplicated and truncated.

    ⚠ With NO query this returns only the first ~8,000 characters, cut on a section
    boundary, with a trailer saying so. The catalogue is larger than that — the tool
    description used to call this "complete", which was false.
    """
    words = [w.strip() for w in query.split() if len(w.strip()) > 1]
    if not words:
        return _head_sections(doc)
    lines = doc.split("\n")

    # ── Pass 1: exact method-name match ──────────────────────────────────
    # Method signatures in the doc look like: ### `element.GetStr(name)`
    for word in words:
        method_pattern = re.compile(rf'^###\s+`[^`]*{re.escape(word)}\s*\(',
                                     re.IGNORECASE)
        for i, line in enumerate(lines):
            if method_pattern.search(line):
                return _extract_subsection(lines, i, word)

    # ── Pass 2: section header match ─────────────────────────────────────
    # Section headers: ## Section Name
    for word in words:
        for i, line in enumerate(lines):
            if line.startswith("## ") and word.lower() in line.lower():
                return _extract_section(lines, i)

    # ── Pass 3: keyword search with context ──────────────────────────────
    match_indices: set[int] = set()
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(word.lower() in line_lower for word in words):
            match_indices.add(i)

    if not match_indices:
        # Return the TOC + first 2000 chars as fallback
        toc_end = next((i for i, l in enumerate(lines) if l.startswith("## ") and i > 5), 60)
        return ("No direct matches. Here is the table of contents:\n\n"
                + "\n".join(lines[12:toc_end])
                + f"\n\nFirst section:\n\n" + "\n".join(lines[toc_end:toc_end + 60]))

    # Expand ±2 lines, group into contiguous blocks
    expanded: set[int] = set()
    for i in match_indices:
        for j in range(max(0, i - 2), min(len(lines), i + 3)):
            expanded.add(j)
    sorted_indices = sorted(expanded)

    blocks: list[list[int]] = []
    block: list[int] = []
    for i in sorted_indices:
        if block and i > block[-1] + 1:
            blocks.append(block)
            block = []
        block.append(i)
    if block:
        blocks.append(block)

    # Build output — each block prefixed with its section header
    out_lines: list[str] = [f"Found references to '{query}':"]
    for b in blocks[:5]:  # max 5 blocks
        # Try to find a section header just above this block
        header = _find_nearest_header(lines, b[0])
        if header:
            out_lines.append(f"\n### {header}")
        for i in b:
            out_lines.append(lines[i])
        if len(out_lines) > 120:
            out_lines.append("... (truncated)")
            break

    return "\n".join(out_lines)


def _extract_subsection(lines: list[str], start: int, method_name: str) -> str:
    """Extract a method's subsection: from its ### header to the next ## or ###."""
    out = [f"## {method_name}\n"]
    for i in range(start, min(len(lines), start + 80)):
        line = lines[i]
        if i > start and (line.startswith("## ") or line.startswith("### `")):
            break
        out.append(line)
    return "\n".join(out)


def _extract_section(lines: list[str], start: int) -> str:
    """Extract a full section: from its ## header to the next ## header."""
    out = []
    for i in range(start, min(len(lines), start + 100)):
        line = lines[i]
        if i > start and line.startswith("## "):
            break
        out.append(line)
    if len(out) > 80:
        out = out[:80]
        out.append("... (section truncated)")
    return "\n".join(out)


def _find_nearest_header(lines: list[str], index: int) -> Optional[str]:
    """Walk backwards from index to find the nearest ## or ### header."""
    for i in range(index, max(0, index - 30), -1):
        if lines[i].startswith("## ") or lines[i].startswith("### "):
            return lines[i].strip("# ")
    return None


def summarize_execution_result(result: Dict[str, Any]) -> str:
    """
    Wraps a raw gRPC execution result for the summarizer.

    Handles both camelCase (from JSON serialization) and snake_case
    (from protobuf) key conventions.

    Args:
        result: Dict from execute_script / execute_repl with keys like
                'structured_output', 'output', 'internal_data' (or camelCase).

    Returns:
        Summarized markdown string (via agent.summarizer.summarize).
    """
    from mcp_core.summarizer import summarize
    output_raw = {
        "structuredOutput": result.get("structured_output", result.get("structuredOutput", [])),
        "output": result.get("output", ""),
        "internal_data": result.get("internal_data", result.get("internalData", "")),
        "pipeline_diagnostics": result.get("pipeline_diagnostics", []),
    }
    return summarize(output_raw)


def format_execution_error(result: Dict[str, Any], source_code: str = "") -> str:
    """
    Format a failed execution result as a user-facing error string with
    Paracore-specific self-correction suggestions.

    Handles both execute_repl (error_message = str) and execute_script
    (error_message = list of compilation errors).

    When `source_code` is supplied, each compiler diagnostic is annotated with the
    OFFENDING SOURCE LINE (see `_annotate_compile_errors`) — a raw Roslyn message
    names a line and column but never the expression, which is the single biggest
    time sink when a snippet fails to compile.
    """
    err_msg = result.get("error_message", "Unknown error")
    err_detail = result.get("error_details", "")

    # Normalize: execute_script returns lists, execute_repl returns strings
    if isinstance(err_msg, list):
        err_msg = "; ".join(str(e) for e in err_msg)
    if isinstance(err_detail, list):
        err_detail = "; ".join(str(e) for e in err_detail)

    full_error = str(err_msg)
    if err_detail:
        full_error += "\n" + str(err_detail)

    suggestion = _suggest_paracore_fix(full_error)
    annotated = _annotate_compile_errors(full_error, source_code)

    msg = f"Execution Failed: {err_msg}"
    if err_detail:
        msg += f"\nDetails: {err_detail}"
    if annotated:
        msg += f"\n\n{annotated}"
    if suggestion:
        msg += f"\n\n{suggestion}"
    return msg


# ── Compile-error annotation — say WHICH LINE, in the USER'S coordinates ─────
#
# ⚠⚠ THE ENGINE HAS TWO DIAGNOSTIC COORDINATE SYSTEMS, and this annotator must
#    cope with both because an engine install and an MCP install are separate
#    acts (the engine is a file copy into Revit's addins folder; the MCP is a
#    PyInstaller exe). Skew is normal, not exceptional.
#
#    LEGACY (engine before the 2026-10-08 fix)
#      `(7,44): error CS0411: ...`
#      ReplSessionManager prepends two lines (`using static ...ScriptApi;` and
#      `using Parameter = ...`) and emits NO `#line` directive, so every line is
#      the USER'S line + 2. Measured on the installed build: five independent
#      failures, all exactly +2.
#
#    FIXED (engine with the fix)
#      `script(5,1): error CS0411: ...`
#      The engine now emits `#line 1 "script"` before the user's code AND maps
#      the column back past the injected `TrackEnumerable(` wrapper, so the
#      numbers are ALREADY the user's. The `script(` filename prefix is the
#      version marker — the legacy form has no filename at all.
#
#    ⚠ Getting this wrong shifts every line by 2, which is precisely the defect
#    this annotator exists to undo. So the mapping is chosen PER DIAGNOSTIC from
#    the presence of the filename, never assumed from a global constant.
#
#    The fixed engine also drops diagnostics that live inside its own injected
#    prelude, so the "outside your snippet" branch below becomes rare rather
#    than routine.
_ENGINE_PREFIX_LINES = 2  # LEGACY only; ignored when the engine reports a filename

_DIAG_RE = re.compile(
    r'(?:^|\n)(?P<file>[A-Za-z0-9_.\-]+)?\((?P<line>\d+),(?P<col>\d+)\):\s*'
    r'(?P<sev>error|warning)\s+(?P<code>CS\d+):\s*(?P<msg>.+?)'
    r'(?=\n[A-Za-z0-9_.\-]*\(\d+,|\Z)',
    re.DOTALL,
)


def _annotate_compile_errors(error_text: str, source_code: str) -> Optional[str]:
    """Quote the source line behind each compiler diagnostic, with a caret.

    Returns None when there is nothing to add (no code, no diagnostics, or the
    diagnostics do not carry a `(line,col)` prefix).

    ⚠ A column is only trusted when it still lands INSIDE the reported line. The
    legacy engine's column points into the injected `TrackEnumerable(` wrapper,
    which pushes it past the end of the user's text; a caret beyond the end of
    the line is worse than no caret, so it is omitted. The fixed engine has
    already subtracted the wrapper, so its carets land correctly.
    """
    if not source_code or not error_text:
        return None

    lines = source_code.split("\n")
    n_lines = len(lines)

    # Parse FIRST, render second: a batch-wide shift can only be seen by looking at every
    # diagnostic at once.
    diags = [
        (
            int(m.group("line")),
            int(m.group("col")),
            m.group("code"),
            " ".join(m.group("msg").split()),
            m.group("file") is not None,
        )
        for m in _DIAG_RE.finditer(error_text)
    ]
    if not diags:
        return None

    # ⚠⚠ THE ENGINE CAN CLAIM "your coordinates" AND STILL BE +2 (measured 2026-10-27).
    #   A REPL diagnostic that falls outside the `#line 1 "script"` region is reported in
    #   PHYSICAL coordinates — the three-line prelude included — yet still carries the
    #   filename, which is the marker this function reads as "already mapped". The review hit
    #   exactly that: a missing `;` on the user's line 8 came back as "engine line 10 ...
    #   outside your snippet" under a header asserting those were the user's own numbers.
    #
    #   The shift is CONSTANT within one submission, so it is detected ONCE — from the
    #   provable case, a number past the end of the snippet that lands inside it after the
    #   subtraction — and then applied to the whole batch. A number that is in range but
    #   still shifted cannot be detected from here, and is left alone rather than guessed at.
    claimed_offset = 0
    for reported, _col, _code, _msg, has_file in diags:
        if (has_file and reported > n_lines
                and 1 <= reported - _ENGINE_PREFIX_LINES <= n_lines):
            claimed_offset = _ENGINE_PREFIX_LINES
            break

    out: List[str] = []
    seen: set[tuple[int, str]] = set()
    used_legacy_offset = False
    used_claimed_correction = False

    for reported, col, code, message, has_file in diags:
        if has_file:
            user_line = reported - claimed_offset
            if claimed_offset:
                used_claimed_correction = True
        else:
            # Legacy engine: no filename, so the prelude offset is all there is.
            user_line = reported - _ENGINE_PREFIX_LINES
            used_legacy_offset = True

        if (user_line, code) in seen:
            continue
        seen.add((user_line, code))

        if not (1 <= user_line <= n_lines):
            # Genuinely inside the engine's own injected text. Say so rather than
            # quoting an unrelated line — and say how many lines the snippet has, so the
            # reader can tell "not mine" from "the count is wrong".
            out.append(f"  engine line {reported}: {code} — {message}\n"
                       f"    (not a line you wrote — it is inside the engine's prelude; "
                       f"your snippet has {n_lines} line(s))")
            continue

        text = lines[user_line - 1]
        width = len(str(user_line))
        out.append(f"  your line {user_line}:")
        out.append(f"    {user_line:>{width}} | {text}")
        if 1 <= col <= len(text) + 1:
            out.append(f"    {' ' * width} | {' ' * (col - 1)}^")
        out.append(f"    {code}: {message}")

    if not out:
        return None

    if used_legacy_offset:
        header = (
            f"⚠ Compiler line numbers are the ENGINE's (it prepends "
            f"{_ENGINE_PREFIX_LINES} lines), so the raw number is "
            f"+{_ENGINE_PREFIX_LINES}. Mapped back to your snippet:\n"
        )
    elif used_claimed_correction:
        header = (
            f"⚠ The engine reported these as your coordinates, but they were "
            f"+{claimed_offset}: its {_ENGINE_PREFIX_LINES}-line prelude was still counted. "
            f"Mapped back to your snippet:\n"
        )
    else:
        header = "⚠ The engine reported these in YOUR coordinates:\n"
    return header + "\n".join(out)


# ── Error → Paracore Suggestion Mapper ──────────────────────────────────────
# Regex patterns that match common compilation/runtime errors and map them
# to Paracore-specific suggestions for agent self-correction.

_ERROR_SUGGESTIONS: list[tuple[str, str]] = [
    # ⚠⚠ FIRST because it is the most misleading error this engine can produce.
    # The pipeline-tracking rewriter wraps a call by NAME, so any call named
    # Append/Prepend/Reverse/Cast/OfType/Concat/Join/... is wrapped in
    # TrackEnumerable(...) even when the receiver is NOT a LINQ sequence.
    # TrackEnumerable<T>(IEnumerable<T>) then cannot infer T and the compile
    # fails with a message that names the ENGINE's helper, never the user's
    # expression.
    #
    # ROOT CAUSE, proven out of process 2026-10-08 against the real engine code:
    # SemanticTrackingGuard builds a throwaway compilation from
    # ScriptReferenceProvider.GetCoreReferences(), which resolved
    # typeof(object).Assembly — System.Private.CoreLib, the IMPLEMENTATION
    # assembly — and NOT the framework FACADES (System.Runtime, System.Collections,
    # netstandard). Every assembly built against .NET Core names the facade as the
    # home of System.Object / System.Enum / IList<>, so in any submission touching
    # the Revit API the guard's compilation failed with CS0012, nothing resolved,
    # every candidate fell through the guard's unresolved branch, and the guard was
    # effectively inert: the rewriter wrapped by name alone. A legal
    # StringBuilder.Append became TrackEnumerable<T>(...) and CS0411 followed.
    # The script itself never noticed, because CSharpScript's ScriptOptions carries
    # a resolver that supplies the facades automatically — the guard had no such
    # resolver. Fixed in CoreScript.Engine by adding the facades to
    # GetCoreReferences, plus a self-test in IsEnumerableLike and a fail-open gate
    # in the guard.
    (
        r"CS0411.*TrackEnumerable|TrackEnumerable.*cannot be inferred"
        r"|cannot be inferred from the usage",

        "This is an ENGINE defect, not your mistake. The pipeline-tracking rewriter "
        "wraps any call named Append/Prepend/Reverse/Cast/OfType/Concat/Join by NAME, "
        "so a non-LINQ receiver can end up inside TrackEnumerable<T>(IEnumerable<T>), "
        "which cannot infer T. The engine's guard was supposed to prevent exactly that "
        "but analysed against a reference set missing the framework facades, so it "
        "resolved nothing in any Revit-touching submission (fixed 2026-10-08 in "
        "CoreScript.Engine — see ScriptReferenceProvider.FrameworkFacades). If you "
        "still see this, the installed engine predates that fix. Workarounds: "
        "(a) for strings use StringBuilder.AppendLine(), or build with `+`, instead "
        "of .Append(); (b) declare the receiver IN THE SAME script so its type is "
        "resolvable; (c) restructure so the call is not the outer expression."
    ),
    # LINQ banned patterns
    (
        r"does not contain a definition for 'Where'|'Where' is not|'Where' does not exist|\.Where\(.*not",

        "Use .WhereParam(\"Name\", \"value\") instead of .Where(). "
        "For a PARAMETER VALUE containing text use .WhereParam(\"Name\", \"contains\", \"text\"). "
        "⚠ .WhereMatches(\"pattern\") is NOT that — it searches the element's NAME and family "
        "name only, never a parameter, so WhereMatches(\"X\") on a Comments value finds nothing. "
        "For numeric comparisons: .WhereParam(\"Name\", \">\", 25, \"m2\")."
    ),
    (
        r"does not contain.*'OrderBy'|'OrderBy' is not|'OrderBy' does not",

        "Use .OrderByParam(\"Name\") or .OrderByParamDesc(\"Name\") instead of .OrderBy()/.OrderByDescending()."
    ),
    (
        r"does not contain.*'GroupBy'|'GroupBy' is not",

        "Use .GroupByParam(\"Name\") for single-key grouping, or .GroupByParam(\"Name\", \"SumParam\", \"unit\") to include totals."
    ),
    (
        r"does not contain.*'Sum'|'Sum' is not|\.Sum\(.*not",

        "Use .SumParam(\"Name\", \"unit\") instead of .Sum() on element collections."
    ),
    # Raw Revit API patterns
    (
        r"'FilteredElementCollector'|FilteredElementCollector is not|FilteredElementCollector does not",

        "Use GetElements<T>() for typed retrieval or GetElements(\"Category\") for string-based. "
        "System families: GetElements<Wall>(), GetElements<WallType>(). "
        "Loadable families: GetElements<FamilyInstance>(\"Doors\"), GetElements<FamilySymbol>(\"Doors\")."
    ),
    (
        r"'LookupParameter'|LookupParameter is not|LookupParameter does not",

        "Use .GetStr(\"Name\") for strings or .GetNum(\"Name\", \"unit\") for numbers. "
        "These auto-resolve instance → reflection → type parameters."
    ),
    (
        r"'get_Parameter'|get_Parameter is not|get_Parameter does not",

        "Use .GetStr(\"Name\"), .GetNum(\"Name\"), or .GetVal(\"Name\") instead of .get_Parameter()."
    ),
    # Print/Console errors
    (
        r"'Println' does not exist|'println' does not exist|The name 'Println'|The name 'println'",

        "Use Println() — capital P, lowercase rintln. NOT println, Print, or Console.WriteLine."
    ),
    (
        r"'Print' does not exist|The name 'Print'",

        "Use Println() — capital P, lowercase rintln. Print() is an alias but Println() is canonical."
    ),
    (
        r"'Console' does not exist|Console\.WriteLine",

        "Use Println() instead of Console.WriteLine(). Console is not available — use Println()."
    ),
    # Unit/type errors
    (
        r"cannot convert.*'string'.*'double'|cannot implicitly convert.*string.*double|Argument.*string.*double",

        "Pass the unit as a string argument: .GetNum(\"Name\", \"m2\") or .SetNum(\"Name\", value, \"cm\"). "
        "Never do manual math to convert units."
    ),
    (
        r"'Parameter'.*ambiguous|ambiguous.*'Parameter'|'Parameter' is defined",

        "The Parameter type (Autodesk.Revit.DB.Parameter) is pre-imported. "
        "Don't declare it yourself. Use .GetStr()/.GetNum() on elements instead of working with Parameter objects directly."
    ),
    # Structural errors
    (
        r"does not contain a definition for 'Table'|'Table' does not exist",

        ".Table() is a Paracore extension method. Make sure you are using Paracore collection extensions. "
        "Check read_extension_methods(\"Table\") for usage."
    ),
    (
        r"does not contain a definition for 'GetNum'|'GetNum' does not exist",

        "GetNum is a Paracore extension method on Element. "
        "Check your element type — are you calling it on an Element, or a plain object?"
    ),
    # CombinedParams / Peek with wrong arguments
    (
        r"can only concatenate str.*not.*list|CombinedParams.*(?:arg|param|filter)",
        "CombinedParams() takes NO arguments. It returns ALL instance+type parameters for a single element. Use: GetElements(\"Walls\").First().CombinedParams().Table(). To inspect specific parameters, call .Select() with .GetStr()/.GetNum()/.GetVal() instead."
    ),
    # SetVal/SetNum called on IEnumerable (collection) instead of single element
    (
        r"IEnumerable.*does not contain.*SetVal|IEnumerable.*does not contain.*SetNum|requires a receiver of type.*Element",
        ".SetVal() and .SetNum() work on SINGLE elements, not collections. For bulk writes on a collection use .SetParam(\"Name\", value). For per-element writes with custom logic, wrap a foreach loop in Transact(\"label\", () => { foreach (var e in collection) { e.SetVal(...); } })."
    ),
    # Null/empty collection errors
    (
        r"NullReferenceException|Object reference not set",

        "The element you're accessing might not exist. Use FirstOrDefault() and null-check, "
        "or verify the element name/ID before accessing it."
    ),
    (
        r"Index was outside|ArgumentOutOfRange|Sequence contains no",

        "The collection might be empty. Check with .Any() or use FirstOrDefault() instead of .First()."
    ),
    # AllElements / BuiltInParams errors
    (
        r"'AllElements' does not exist|AllElements is not|AllElements does not",
        "AllElements does not exist. Use GetElements<T>() for typed retrieval or GetElements(\"Category\") for string-based."
    ),
    (
        r"BuiltInParams.*Where|BuiltInParams.*Select|does not contain.*BuiltInParams",
        "BuiltInParams() returns untyped rows for display only — you cannot chain .Where() or .Select() on it. Use .CombinedParams().Table() for inspectable parameters, or .GetVal(\"Name\") / .GetStr(\"Name\") for specific param values."
    ),
    # C# structural errors
    (
        r"CS1002|CS1513|; expected|Syntax error.*;",

        "Semicolons are required for variable assignments and method calls (C#). "
        "Exception: expression-only lines in REPL (Selection.Count) don't need semicolons."
    ),
    (
        r"CS0103.*name.*does not exist|The name.*does not exist in the current",

        "This name is not recognized. Check spelling/case. "
        "Paracore globals: Doc, UIDoc, UIApp, ActiveView, Selection, Println(). "
        "All Autodesk.Revit.DB names (XYZ, Wall, Line, etc.) are pre-imported — no using needed."
    ),
    # using/namespace boilerplate
    (
        r"CS0116.*namespace|A namespace cannot directly contain|CS1002.*namespace",

        "No namespace needed — this is top-level C# scripting. Write code directly."
    ),
    (
        r"CS8803|top-level statements must precede|CS1525.*class",

        "Top-level statements must come BEFORE any class/interface definitions. "
        "Classes and interfaces go at the BOTTOM of the script."
    ),
    # General compilation failure — suggest checking the extension methods reference
    (
        r"error CS\d{4}",

        "Check the `_read_extension_methods` tool for the correct Paracore method syntax — "
        "call `_read_extension_methods(\"method-name\")` for a specific signature."
    ),
    # Hardcoded unit math in error messages
    (
        r"304\.8|0\.3048",

        "Never hardcode unit conversion (304.8, 0.3048). Use .InputUnit(\"mm\") to convert TO feet, "
        ".OutputUnit(\"mm\") to convert FROM feet, or .GetNum(\"Name\", \"mm\") for direct unit-aware access."
    ),
    # Fully qualified name errors
    (
        r"Autodesk\.Revit\.\w+\.\w+.*does not|type or namespace.*Autodesk",

        "All Autodesk.Revit namespaces are pre-imported. Use short names only: "
        "XYZ, StructuralType, WallType, Line, etc. Drop the Autodesk.Revit.DB. prefix."
    ),
    # doc (lowercase) not found
    (
        r"'doc' does not exist|The name 'doc' does not",

        "Use Doc (capital D) — the global Revit Document. All Paracore globals are PascalCase: "
        "Doc, UIDoc, UIApp, ActiveView, Selection."
    ),
]


def _suggest_paracore_fix(error_text: str) -> Optional[str]:
    """
    Map a C# compilation/runtime error to Paracore-specific suggestions.

    Returns ALL matching suggestions (up to 3), joined into one message.
    Previously returned only the first — now the agent gets multiple hints
    when an error matches several known patterns.
    """
    seen: set[str] = set()
    suggestions: list[str] = []
    for pattern, suggestion in _ERROR_SUGGESTIONS:
        if suggestion in seen:
            continue
        if re.search(pattern, error_text, re.IGNORECASE):
            seen.add(suggestion)
            suggestions.append(suggestion)
            if len(suggestions) >= 3:
                break

    if not suggestions:
        return None
    if len(suggestions) == 1:
        return f"Suggested fix: {suggestions[0]}"
    return "Possible fixes:\n  1. " + "\n  2. ".join(suggestions)

