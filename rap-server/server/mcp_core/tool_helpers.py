"""
Shared helper functions used by both PydanticAI agent tools (v4_repl_agent.py)
and MCP server tools (mcp_server.py).

Extracted to eliminate ~45 lines of duplicated search logic and ~20 lines
of duplicated result-wrapping logic.
"""

import re
from typing import Any, Dict, Optional

# Known Revit storage types that LLMs sometimes append to parameter names
_TYPE_SUFFIXES = [
    'String', 'Double', 'Integer', 'ElementId', 'Length', 'Area', 'Volume',
    'Boolean', 'YesNo', 'Number', 'Text', 'Enum',
]

# ── Anti-Pattern Detection ──────────────────────────────────────────────────
# Regex patterns that indicate raw Revit API usage instead of Paracore extensions.
# Each tuple: (regex, suggestion message). Order matters — more specific first.

_ANTI_PATTERNS: list[tuple[str, str]] = [
    # Display: foreach+Println for data output
    (
        r'foreach\s*\(.*\)\s*\{?[^}]*Println',
        'Use .Select(x => new{...}).Table() instead of foreach+Println to display data.'
    ),
    # Display: string.Join with Select for output
    (
        r'string\.Join\s*\([^)]*Select\s*\(',
        'Use .Select(x => new{...}).Table() instead of string.Join for data display.'
    ),
    # Chain anti-pattern: .Select() after .GroupByParam()
    (
        r'\.GroupByParam\s*\([^)]+\)\s*\.\s*Select\s*\(',
        'NEVER chain .Select() after .GroupByParam(). Chain .Table() directly: .GroupByParam("Level").Table()'
    ),
    # Raw element collection instead of GetElements
    (
        r'new\s+FilteredElementCollector\s*\(',
        'Use GetElements<T>() for typed or GetElements("Category") for string-based retrieval instead of new FilteredElementCollector().'
    ),
    # Raw parameter access
    (
        r'\.LookupParameter\s*\(',
        'Use .GetStr("Name") or .GetNum("Name") instead of .LookupParameter().'
    ),
    (
        r'\.get_Parameter\s*\(',
        'Use .GetStr("Name"), .GetNum("Name", "unit"), or .GetVal("Name") instead of .get_Parameter().'
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
    # Lowercase doc (should be Doc — the global). (?-i) disables IGNORECASE so Doc. passes.
    (
        r'(?-i:(?<![.\w])doc\.)',
        'Use Doc (capital D) — it\'s the global Revit Document. doc (lowercase) is not defined.'
    ),
    (
        r'(?-i:\bdocument\b)',
        'Use Doc (capital D) — the global Revit Document. \"Document\" as a type/class is not available; Doc is the injected global.'
    ),
    # LINQ on element collections instead of Paracore equivalents
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
    # Console.WriteLine instead of Println
    (
        r'Console\.WriteLine\s*\(',
        'Use Println() instead of Console.WriteLine() in Paracore scripts.'
    ),
    # Transact called without a name string — must be Transact("name", () => {})
    (
        r'Transact\s*\(\s*\(',
        'Transact() requires a name string: Transact("description", () => { ... }). Do NOT call Transact(() => {}) — the first argument must be a string label.'
    ),
    # CombinedParams called with arguments — takes none
    (
        r'\.CombinedParams\s*\([^)]+\s*\)',
        'CombinedParams() takes NO arguments — it returns ALL instance+type parameters for a single element. Use: element.CombinedParams().Table() or element.CombinedParams().Peek(). To filter specific parameters, use .Select() with .GetStr()/.GetNum() instead.'
    ),
    # .SetVal() or .SetNum() called on a collection (IEnumerable) — these are single-element methods
    (
        r'\.WhereParam\s*\([^)]+\)\s*\.\s*Set(?:Val|Num)\s*\(',
        '.SetVal() and .SetNum() work on SINGLE elements only (e.g., wall.SetVal("Comments", "Done")). For COLLECTIONS use .SetParam("Name", value) for bulk writes, or wrap in Transact("label", () => { foreach (var e in collection) { e.SetVal(...); } }).'
    ),
    # AllElements — doesn't exist. Use GetElements
    (
        r'\bAllElements\b',
        'Use GetElements<T>() for typed retrieval or GetElements("Category") for string-based. "AllElements" does not exist — the correct global is GetElements.'
    ),
]

# ── Dangerous Pattern Detection ──────────────────────────────────────────────
# Two-tier security guard: BlockedAlways patterns have no legitimate use in any
# Paracore execution context (process spawn, registry, destructive I/O).
# BlockedAgentOnly patterns are blocked for AI agent / MCP execution but
# permitted for user-triggered console/gallery REPL.
# Each tuple: (regex, human-readable violation description).

_BLOCKED_ALWAYS: list[tuple[str, str]] = [
    (r'Process\.Start\s*\(',       "Process.Start() — spawning external processes"),
    (r'Environment\.Exit\s*\(',     "Environment.Exit() — killing the Revit process"),
    (r'Environment\.FailFast\s*\(', "Environment.FailFast() — killing the Revit process"),
    (r'Microsoft\.Win32\.Registry', "Windows Registry access"),
    (r'\bRegistryKey\b',            "Windows Registry access"),
    (r'Assembly\.Load\s*\(',        "Runtime assembly loading"),
    (r'Assembly\.LoadFrom\s*\(',    "Runtime assembly loading"),
    (r'Assembly\.LoadFile\s*\(',    "Runtime assembly loading"),
    (r'File\.Delete\s*\(',         "File.Delete() — destructive file deletion"),
    (r'Directory\.Delete\s*\(',    "Directory.Delete() — destructive directory deletion"),
]

_BLOCKED_AGENT_ONLY: list[tuple[str, str]] = [
    (r'new\s+HttpClient\s*\(',     "HttpClient — use the pre-imported RestSharp instead"),
    (r'HttpClient\s*\.',           "HttpClient — use the pre-imported RestSharp instead"),
    (r'new\s+WebClient\s*\(',      "WebClient — use the pre-imported RestSharp instead"),
    (r'WebClient\s*\.',            "WebClient — use the pre-imported RestSharp instead"),
    (r'\bHttpWebRequest\b',        "HttpWebRequest — use the pre-imported RestSharp instead"),
    (r'new\s+Socket\s*\(',         "Raw socket — no Paracore use case"),
    (r'new\s+TcpClient\s*\(',      "Raw TCP socket — no Paracore use case"),
    (r'new\s+UdpClient\s*\(',      "Raw UDP socket — no Paracore use case"),
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

    msg = "❌ Dangerous pattern detected:\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += ("\nThese patterns have no legitimate use in Paracore scripts. "
            "Remove them before re-submitting.")
    return msg


def check_paracore_compliance(code: str) -> Optional[str]:
    """
    Scan C# code for raw Revit API anti-patterns.

    Returns None if code passes (no anti-patterns found), or a structured
    error message with specific suggestions for each detected anti-pattern.
    The error message is designed to help the LLM self-correct.
    """
    issues: list[str] = []
    seen_patterns: set[str] = set()  # deduplicate by suggestion text

    for pattern, suggestion in _ANTI_PATTERNS:
        if suggestion in seen_patterns:
            continue
        if re.search(pattern, code, re.IGNORECASE | re.DOTALL):
            issues.append(suggestion)
            seen_patterns.add(suggestion)

    # ── Special: foreach + SetVal/SetNum without Transact wrapper ─────────
    # The engine auto-transacts single-element SetVal/SetNum and collection
    # .SetParam(), but a foreach loop doing SetVal/SetNum creates separate
    # transactions per iteration — polluting the undo stack. The fix is to
    # wrap the foreach in Transact("label", () => { ... }), which makes
    # IsModifiable true and suppresses individual auto-transactions.
    _FOREACH_TRANSACT_KEY = "foreach-transact"
    if _FOREACH_TRANSACT_KEY not in seen_patterns:
        if re.search(r'foreach\s*\(', code):
            if re.search(r'\.Set(?:Val|Num)\s*\(', code):
                if not re.search(r'Transact\s*\(', code):
                    issues.append(
                        'foreach loops using .SetVal()/.SetNum() MUST be wrapped in '
                        'Transact("label", () => { ... foreach (...) { w.SetVal(...); } }). '
                        'Without Transact(), each .SetVal/.SetNum creates its own undo entry — '
                        'polluting the undo stack. The engine skips individual auto-transactions '
                        'when IsModifiable is true (inside a Transact block). Single-element '
                        'SetVal/SetNum and collection .SetParam() auto-transact safely.'
                    )
                    seen_patterns.add(_FOREACH_TRANSACT_KEY)

    if not issues:
        return None

    msg = "❌ Use Paracore extension methods instead of raw Revit API:\n\n"
    for i, issue in enumerate(issues, 1):
        msg += f"{i}. {issue}\n"
    msg += ("\nRead paracore://system-prompt for the complete method catalog. "
            "Call read_extension_methods(\"method-name\") for specific syntax.")
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


def search_extension_methods(query: str, doc: str) -> str:
    """
    Search the EXTENSION_METHODS.md content for a specific method or topic.

    Three-pass search, ordered by precision:
      1. Exact method-name match (### `method.Name()` header) — extracts that subsection.
      2. Section header match (## Section containing keyword) — extracts whole section.
      3. Keyword search with context, deduplicated and truncated.
    """
    words = [w.strip() for w in query.split() if len(w.strip()) > 1]
    if not words:
        return doc[:8000]
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


def format_execution_error(result: Dict[str, Any]) -> str:
    """
    Format a failed execution result as a user-facing error string with
    Paracore-specific self-correction suggestions.

    Handles both execute_repl (error_message = str) and execute_script
    (error_message = list of compilation errors).
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

    msg = f"Execution Failed: {err_msg}"
    if err_detail:
        msg += f"\nDetails: {err_detail}"
    if suggestion:
        msg += f"\n\n{suggestion}"
    return msg


# ── Error → Paracore Suggestion Mapper ──────────────────────────────────────
# Regex patterns that match common compilation/runtime errors and map them
# to Paracore-specific suggestions for agent self-correction.

_ERROR_SUGGESTIONS: list[tuple[str, str]] = [
    # LINQ banned patterns
    (
        r"does not contain a definition for 'Where'|'Where' is not|'Where' does not exist|\.Where\(.*not",

        "Use .WhereParam(\"Name\", \"value\") instead of .Where(). "
        "For string matching use .WhereMatches(\"pattern\"). "
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
        "Paracore globals: Doc, Uidoc, UIApp, ActiveView, Selection, Println(). "
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

        "Check paracore://system-prompt for the correct Paracore method syntax. "
        "Call read_extension_methods(\"method-name\") for specific method signatures."
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
        "Doc, Uidoc, UIApp, ActiveView, Selection."
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
        return f"💡 {suggestions[0]}"
    return "💡 Possible fixes:\n  1. " + "\n  2. ".join(suggestions)

