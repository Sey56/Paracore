"""The server factory — the SHARED half of every Paracore MCP.

Every Paracore MCP is assembled from this module plus a `Domain` (see `domain.py`).
The split is deliberate:

    COMMON  →  the eight REPL tools, the skill delivery, the resources, the common
               instruction block, logging, metrics.
    DOMAIN  →  the server name, the domain instructions, the domain skills, the
               prompt overrides, the domain tools.

⚠ WHY `list_skills` / `read_skill` EXIST (read `domain.py` for the measurement).
    The skills were MCP *resources* with templated URIs. Claude Desktop calls
    `resources/list` but never `resources/templates/list`, and never calls
    `resources/read` at all — so across 70 sessions the model saw ZERO skills and fell
    back to the raw Revit API. Serving them as TOOLS makes them reachable on any client.

⚠ `create_server` is the whole-server path. A server whose tool surface is genuinely
different (forge, takeoff) builds its own `FastMCP` and calls the `register_*` pieces
directly — the PATTERN is identical even where the tool list is not.
"""

from __future__ import annotations

import logging
import os
from typing import Callable

from mcp.server.fastmcp import FastMCP, Image

from mcp_core import tools as _t
from mcp_core.domain import (
    Domain,
    load_skill_text,
    read_prompt_section,
    render_catalogue_markdown,
    skill_catalogue,
)
from mcp_core import prompt_assembler as _pa

logger = logging.getLogger("paracore-mcp")

# ── The common instruction block ─────────────────────────────────────────────
# ⚠ TRUE OF EVERY MCP — anything domain-specific belongs in `Domain.intro`.
# ⚠ This string is the ONE guidance channel Claude Desktop reliably delivers (it is
#   sent in the `initialize` response), so the skill catalogue is embedded in it.
COMMON_RULES = """CRITICAL RULES — violations will be rejected:

GLOBALS (use EXACTLY these — PascalCase):
  Doc (NOT doc, NOT ActiveDocument, NOT activeDocument)
  ActiveView, Selection, Println()

QUERY (use Paracore methods, NOT raw Revit API):
  GetElements("Walls")  — NOT new FilteredElementCollector(Doc)
  GetElements<Wall>()   — typed retrieval
  .WhereParam("Name", "value")  — NOT .Where(e => e.Property)
  .WhereParam("Id", 359588)     — an element Id is a valid name too (also "ElementId")
  .Table()  — NOT foreach+Println loops

FORBIDDEN — these WILL fail:
  doc / document / ActiveDocument    → use Doc (capital D)

AVOID — these RUN, with an advisory note attached; the Paracore method is better:
  new FilteredElementCollector(...)  → GetElements("Walls")
  LookupParameter / get_Parameter    → .GetStr() / .GetNum()
  .AsString() / .AsDouble()          → .GetStr() / .GetNum()
  Console.WriteLine()                → Println(); its output is NOT captured

PARAMETER NAMES — NEVER GUESS:
  Revit parameters use spaces: "Fire Rating" NOT "FireRating",
  "Base Constraint" NOT "BaseConstraint", "Top Offset" NOT "TopOffset"

  CRITICAL — "Level" is NOT universal. It only works for Rooms, Doors,
  Windows. Walls use "Base Constraint". Columns use "Base Level". Beams
  and Structural Framing use "Reference Level". GetStr("Level") on a Wall
  silently returns empty — no error, just blank. Same for GroupByParam.

  A name that NO element in the set declares now RAISES in WhereParam instead of
  returning an empty result — so a typo can never look like "nothing matched".
  The error names the categories it checked and suggests the closest real name.

  Discovery BEFORE filtering or grouping:
    → _search_schema("Category") for fast schema lookup
    → .First().CombinedParams().Table() for live parameter names + values
    → .CombinedParams().Table() shows instance, type, AND native params
  A mistyped name returns empty — indistinguishable from "no matches."
  NEVER guess parameter names. Discover first on the actual category.

START EVERY SESSION WITH:
  1. ping  → verifies the connection for real. If it reports NO CONNECTION, stop
             and tell the user what to fix. Do not attempt Revit operations.
  2. get_context  → active view, current selection, project levels
  3. list_skills  → the skill catalogue (which skill covers which operation)
  4. read_skill("<name>") for the skills relevant to the user's request
  5. Then explore. NEVER write code before reading the relevant skills.

NEVER CALL `Pick()` — AND NEVER ASK THE USER TO CLICK FOR YOU. (operator ruling, 2026-10-28)
  `Pick()` exists for a HUMAN writing a script by hand. It is the wrong tool for an agent,
  and there is no way to make it right:
    • It holds Revit's UI thread until the user clicks, and NOTHING you print reaches the
      chat until it returns — so you cannot tell them in time. Measured on the operator's
      screen: during a bare `Pick()` he saw only the generic "Running …", which appears for
      every call. He had no way to know a pick was pending.
    • Its only cue is Revit's status bar, which repaints on mouse activity — it is invisible
      unless the pointer is already over Revit. The operator's verdict: "not useful at all."
  WHAT TO DO INSTEAD — all of these are better, and none of them interrupts anyone:
    1. THE USER SELECTS FIRST. `get_context` returns `Selection` (a List<Element>). If they
       say "this wall", "these rooms", they have already selected it — read it.
    2. ASK BY NAME OR PARAMETER. GetElements("Walls").WhereParam("Comments","contains","x").
       `WhereMatches` searches element and family names. A category + a parameter narrows
       almost anything a person would point at.
    3. ASK THEM TO READ OUT AN ID. Every element has one, and `get_context` shows theirs.
    4. ASK A QUESTION. "Which wall — the one on the south, or the 5065 one?" is one sentence
       and costs nobody a modal state.
  If none of that can name the element, say so and ask — do not reach for a pick.

A DIALOG IS NOT YOURS TO CLOSE — THE WATCHER HANDLES IT:
  Revit is MODAL. When it raises a warning, error or task dialog while a script is
  running, Revit stops responding until that dialog is dismissed — so your call looks
  like a hang, and Revit looks broken when it is only waiting for a button.

  A separate EXTERNAL process, the PARACORE DIALOG WATCHER, watches for those dialogs.
  When one appears it does two things, in this order:
    1. it tells you WHY the dialog appeared and which button it pressed, inside the
       result of the very call that hit it — look for
       "REVIT SHOWED A DIALOG WHILE THIS CALL RAN", which names the title, the message,
       the buttons offered and the button actually pressed; and
    2. it dismisses the dialog, so Revit answers you again.

  Therefore:
    • Do NOT try to click it, and do NOT ask the user to click it.
    • A dialog is NOT a failure of your call and NOT a hang. It is a note attached to
      a call that already ran.
    • pressed OK / a keep-option  → the edit usually STANDS. Still VERIFY the element
                                    exists before building on it.
    • pressed Cancel / an error   → the edit was probably ROLLED BACK. Re-read the
                                    model; assume nothing changed.
  Only if a call times out with NO watcher note should you suspect a dialog the watcher
  could not reach. Then stop and say so — do not retry into it.

NEVER RETRY BLINDLY:
  Revit's API is single-threaded. Repeating a failed or slow call queues behind the
  one still running and can wedge Revit until it is restarted. If a call reports
  REVIT IS BUSY or a timeout, STOP — do not retry, and confirm Revit responds with a
  small query first.

VERIFY BEFORE YOU BUILD ON IT:
  Check each result before the next call — row count, value range, units, and that
  the parameters you asked for actually appeared. A number you did not dimension is
  approximate, however plausible it looks.
  The same call failing TWICE means the APPROACH is wrong, not the spelling: change
  the approach (the category name, typed vs string retrieval, the filter) instead of
  retrying it. After three failed attempts on one thing, STOP and report what you
  tried and what you saw — do not keep exploring to fill the gap."""


def build_instructions(domain: Domain) -> str:
    """Common rules + the domain's own block + the skill catalogue.

    ⚠ The catalogue is embedded HERE because this string is the one channel that
    reaches the model on every client. The skills themselves are fetched on demand
    with `read_skill` — a 2–12 KB skill beats the full 17 K catalogue.
    """
    parts = [COMMON_RULES]
    if domain.intro.strip():
        parts.append(domain.intro.strip())
    parts.append(render_catalogue_markdown(domain))
    return "\n\n".join(parts)


# ── The handshake: version + catalogue, ONE implementation ───────────────────
# ⚠ Both of these exist because a server may build its OWN `FastMCP` (forge, takeoff)
#   instead of calling `create_server`. Before them the same two facts were set — or
#   forgotten — per repo: Forge had a hand-rolled version block, the other four had none,
#   and forge/takeoff never put the catalogue in their instructions at all. A rule in N
#   places must be changed in N places, so there is now ONE place.

def apply_server_version(mcp: FastMCP, domain: Domain) -> str:
    """Set the handshake's `serverInfo.version` from `<domain.root>/VERSION`.

    ⚠ FastMCP takes NO `version` argument, so without this the handshake reports the mcp
    SDK's own version (e.g. "1.27.2") and every client shows the wrong product version.
    `mcp._mcp_server.version` is a plain attribute, so set it directly.

    ⚠ NEVER FATAL. It is a private attribute, and a future SDK rename must not stop the
    server from starting — a wrong version number is a cosmetic bug, a dead server is not.
    Returns the version applied, or "" when it could not be read.
    """
    path = os.path.join(domain.root, "VERSION")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            version = fh.read().strip()
    except OSError as exc:
        logger.warning(
            "%s: no VERSION file at %s (%s) - clients will show the SDK version",
            domain.name, path, exc,
        )
        return ""
    if not version:
        logger.warning(
            "%s: VERSION file at %s is EMPTY - clients will show the SDK version",
            domain.name, path,
        )
        return ""
    try:
        mcp._mcp_server.version = version
    except Exception as exc:  # noqa: BLE001 - never fatal, see the docstring
        logger.warning("%s: could not set the server version (%s)", domain.name, exc)
        return ""
    logger.info("%s: handshake version set to %s", domain.name, version)
    return version


def attach_skill_catalogue(mcp: FastMCP, domain: Domain) -> None:
    """Append the skill catalogue to a HAND-WRITTEN `instructions` block.

    ⚠ `create_server` needs nothing — `build_instructions` already ends with the
    catalogue. A server that supplies its OWN literal (forge, takeoff) does not, so its
    skills are discoverable ONLY by calling `list_skills`. The catalogue belongs in
    `instructions` because that is the one channel every client delivers: Claude Desktop
    sends it in the `initialize` response (see `domain.py` for the measurement).

    ⚠ Idempotent — the catalogue is not appended twice if it is already present, so this
    is safe to call on a server built by `create_server` as well.
    """
    catalogue = render_catalogue_markdown(domain)
    try:
        current = mcp._mcp_server.instructions or ""
        if catalogue in current:
            return
        mcp._mcp_server.instructions = f"{current.rstrip()}\n\n{catalogue}"
    except Exception as exc:  # noqa: BLE001 - never fatal
        logger.warning("%s: could not attach the skill catalogue (%s)", domain.name, exc)


# ── The common tools ─────────────────────────────────────────────────────────
# One definition each, written once. The `_`-prefixed names sort last in the client's
# tool list, which is why the four "advanced" ones carry it.

def _tool_ping() -> str:
    """Verify the Paracore MCP server is alive AND that Revit is genuinely reachable.
    Always call this first at the start of every session.

    Reports one of four states, each needing a different fix:
      * connected                     — safe to proceed
      * server up, no document        — Revit is open but no project is loaded
      * Revit running, no connection  — the in-Revit Paracore server is toggled off
      * Revit not running             — start Revit

    Returns the quick-start cheat sheet ONLY when genuinely connected. If this reports
    NO CONNECTION, do not attempt any Revit operation — every call will fail. Tell the
    user what to fix and call ping again.
    """
    _t._SESSION.record_ping()
    return _t.ping()


def _tool_get_context() -> str:
    """Get the current Revit context: project, active view, current selection, and levels.

    Call this early, right after ping. Without it you do not know which view is active,
    what the user has selected, or which levels exist — and 'the walls' or 'this level'
    in a request will be guesses.

    Use the returned element Ids directly with execute_dynamic_query or explore_revit_data.
    Levels include their elevations, so you can place or filter by height without a
    separate query.

    Cheap and read-only. No arguments.
    """
    _t._SESSION.record_discovery()
    return _t.get_context_report()


def _tool_export_view(view_name: str = "", pixel_size: int = 1200,
                      annotations: str = "model") -> Image:
    """Render a Revit view to an image and return it, so you can SEE the model.

    Use this whenever the request is visual — "does this look right?", "check the
    proportions", "show me what you built" — and after every build stage, not only at
    the end. A picture catches a wall in the wrong place long before a count would.

    Args:
        view_name: name of the view to export, e.g. "3D View - {3D}" or "Level 1".
            Omit it to export the ACTIVE view. Matched case-insensitively; a view
            template cannot be exported.
        pixel_size: longest-edge pixel size. Default 1200; 2000 for detail.
        annotations: what to do with dimensions, tags and datum marks.
            * "model" (default) — hide ALL annotation. The model fills the frame;
              dimensions, room tags and text notes are NOT in the picture.
            * "tags" — hide only the datum/marker categories (levels, grids,
              section and elevation marks, callouts) and KEEP dimensions, text
              notes and room/door/window tags. Use this whenever you are checking
              a dimensioned drawing, reading a room tag, or comparing against a
              plan you were asked to reproduce.
            * "all" — hide nothing. Everything is visible, but Revit does not clip
              annotation to the view, so markers sitting outside the model are
              drawn too and the model shrinks to a small part of the frame.
            ⚠ "model" is the only mode where you cannot check a dimension by eye.
              If the task mentions dimensions, tags or room names, ask for "tags".

    Returns the rendered image. On failure it returns a text explanation instead — most
    often the named view does not exist, in which case the message lists views that do.

    ⚠ Seeing is not measuring: an image shows a wrong proportion, never a wrong quantity.
    Pair it with the count check (GetElements(...).Count(), Doc.GetWarnings()).
    """
    result = _t.export_view_report(view_name, pixel_size, annotations)
    if result.get("path"):
        return Image(path=result["path"])
    return result.get("error") or "The view export failed."


def _tool_explore_revit_data(csharp_code: str, justification: str) -> str:
    """Execute a READ-ONLY C# snippet in Revit to explore model data.
    Use this to DISCOVER parameter names, check element counts, verify values
    exist, or inspect schema — anything that DOES NOT modify the model.

    Do NOT use this for modifications. Use execute_dynamic_query for writes.

    ⚠ HOW "READ-ONLY" IS ENFORCED — two layers, and only the second is a guarantee:
      1. A pattern scan refuses the obvious raw-API writes (new Transaction,
         Parameter.Set, Doc.Delete, element creation, transforms) before anything runs.
      2. The engine then runs the whole snippet inside a transaction group that is
         ALWAYS rolled back, so a model write reached by any other route — reflection,
         a name assembled at runtime — is DISCARDED. You would get a success and an
         unchanged model, which is worse than the refusal.
      Neither layer is a sandbox for files, network or processes.

    TIME BUDGET: the snippet is killed after 90 s of wall clock, checked inside every
    loop. For a genuinely long discovery, put SetExecutionTimeout(600); FIRST.

    The 'csharp_code' must be valid C# top-level statements. The engine has
    all Revit namespaces pre-imported. Prefer Paracore extension methods
    (.GetStr, .WhereParam, .GroupByParam, .Table, etc.) over raw LINQ and
    FilteredElementCollector.

    OUTPUT: Summarized results — tables show up to 50 rows (all rows if the table is
    that small or smaller) plus a total count, text output shows the first 24 and last 16
    lines, eliding the middle so a value printed last is never lost.
    Charts report their type. Empty results return "No results found" with the query
    context. If a table is truncated you will be told how many rows were hidden.

    FAILURE: Returns a structured error with the error type, line number,
    and a suggested fix. Common failures: wrong parameter name (run
    search_schema first), missing Transact() around a foreach loop, or
    accidentally including write operations (SetVal, Delete) in read-only mode.

    If a call reports REVIT IS BUSY, do not retry it. Wait for the running operation
    to finish — a retry queues behind it and can wedge Revit.
    """
    return _t.explore_revit_data(csharp_code, justification)


def _tool_execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """Execute C# in Revit — supports both reads AND writes. This is the tool
    for the user's FINAL action after discovery is complete.

    Do NOT use this for initial exploration — use explore_revit_data or
    search_schema first. This tool is ONLY for the final result after
    discovery is complete. Unlike explore_revit_data, this tool runs
    without read-only restrictions and supports model modifications.

    WRITE OPERATIONS (auto-transact — no Transact() needed):
      Single element: .SetVal("Comments","Done"), .SetNum("Offset",-150,"cm"),
        .Delete(), .Hide(), .Unhide(), .Isolate()
      Collection bulk (one transaction): .SetParam("Comments","Done"),
        .Delete(), .Hide(), .Unhide(), .Isolate()

    Manual foreach loops with writes MUST wrap in Transact("name", () => {...}).

    TIME BUDGET: the script is killed after 90 s of wall clock, checked inside every loop.
    If a run genuinely needs longer, put SetExecutionTimeout(600); as the FIRST statement —
    anywhere else it is too late for the loops that already ran.

    DISPLAY: Always use .Table() for data, never foreach+Println loops.
    For .Select() tables, include Id as the first column.

    OUTPUT: Summarized — tables (up to 50 rows, or every row if the table is that small
    or smaller, plus a total), text (first 24 and last 16 lines, middle elided), charts
    (type reported). Write operations include a confirmation message.

    FAILURE: Structured error with type, line number, and suggested fix.
    Common failures: wrong parameter name, missing Transact() on foreach, or trying
    to chain .Select() after .GroupByParam() (chain .Table() directly instead).

    Fix the reported cause, then retry ONCE with the correction. Do not repeat an
    identical call — if it failed once it will fail the same way. If a call reports
    REVIT IS BUSY, do not retry at all: the retry queues behind the operation that is
    still running and repeated retries can wedge Revit until it is restarted.
    """
    return _t.execute_dynamic_query(csharp_code, justification)


def _tool_search_schema(category_name: str) -> str:
    """Fast parameter schema lookup for a Revit category. Use this INSTEAD of
    explore_revit_data when you just need to know what parameters exist for
    a category — it's faster and cheaper than running live C#.

    PREFERRED for discovery. Results are cached in memory after the first
    call per category — instant on subsequent calls.

    'category_name' is a Revit category string. Common values: "Rooms",
    "Walls", "Doors", "Floors", "Ceilings", "Windows", "Structural Columns",
    "Structural Framing", "Ducts", "Pipes". For unknown categories, use
    GetMagicNames() via explore_revit_data to discover available names.

    OUTPUT: A compact list of parameter names with storage types (String,
    Double, Integer, ElementId) and scope (Instance / Type). Copy ONLY the
    parameter name — do NOT include [String] or [Double] annotations in
    your code.

    FAILURE: If the category is not found, returns an error suggesting you
    try explore_revit_data with .CombinedParams().Table() instead. This is
    rare — most standard Revit category names work directly.
    """
    return _t.search_schema(category_name)


def _tool_read_extension_methods(query: str = "") -> str:
    """The Paracore Extension Methods reference. Pass `query` to get one section or method.

    ⚠ WITHOUT a query this returns only the first ~8,000 characters, cut on a section
    boundary, with a trailer saying where it stopped — the catalogue is larger than that.
    (The description used to claim it returned "the complete ~17,000-char catalog" while the
    code capped at 8,000, so a caller could not tell a truncated read from a short one.)

    PREFER `read_skill` INSTEAD. A single skill is 2–12 KB and covers one operation,
    so it is far cheaper than pulling a large slice of the catalog. Use this tool when
    you need a method's exact signature or a section by keyword.

    Args:
        query: keyword — returns only the matching method subsection or section. Omit
            only if you genuinely want the opening sections.
    """
    return _t.read_extension_methods(query)


def _tool_get_globals() -> str:
    """The exact globals, the pre-imported namespaces, and the DOCUMENT-level properties.

    Call this when a name was rejected ("doc is not defined", "no such namespace") or when
    you need something about the FILE rather than the elements in it:
    `Doc.ProjectInformation.Name/.Number/.ClientName/.Address`, `Doc.PathName`,
    `Doc.IsWorkshared`, `Doc.Title`.

    ⚠ WHY THIS IS A TOOL (2026-10-27). The same text is served as the `paracore://globals`
    RESOURCE, and resources are never read by the clients this server targets (0
    `resources/read` in 70 Claude Desktop sessions — see domain.py). So `Doc.IsWorkshared`
    and the project-information block existed only somewhere no caller ever looked. The
    resource is kept for clients that do read them; this tool is the reachable copy.
    """
    return _t.get_globals()


# name → (callable, is_optional). ⚠ The dict is the SINGLE list of common tools; a
# server that omits one (takeoff has its own read-only export_view) says so by name.
_COMMON_TOOLS: dict[str, Callable] = {
    "ping": _tool_ping,
    "get_context": _tool_get_context,
    "export_view": _tool_export_view,
    "_explore_revit_data": _tool_explore_revit_data,
    "_execute_dynamic_query": _tool_execute_dynamic_query,
    "_search_schema": _tool_search_schema,
    "_read_extension_methods": _tool_read_extension_methods,
    "get_globals": _tool_get_globals,
}


def register_common_tools(mcp: FastMCP, *, omit: tuple[str, ...] = ()) -> None:
    """Register the common tools, minus anything the caller names in `omit`."""
    for name, fn in _COMMON_TOOLS.items():
        if name in omit:
            continue
        mcp.add_tool(fn, name=name)


def register_skill_tools(mcp: FastMCP, domain: Domain) -> None:
    """Register `list_skills` and `read_skill` — the skill delivery that works on
    every client. See the module docstring for why these are tools and not resources."""

    def list_skills() -> str:
        """List every skill this server offers — name and what it covers.

        Call this early, right after get_context. Then call `read_skill("<name>")` for
        each skill relevant to the user's request, BEFORE writing any code.

        The catalogue is also in this server's instructions, so this is mainly a
        refresh — but it is the authoritative list.
        """
        lines = [f"# {domain.name} — skills ({len(skill_catalogue(domain))})", ""]
        for spec in skill_catalogue(domain):
            lines.append(f"## {spec.name}")
            lines.append(spec.description)
            lines.append("")
        lines.append('Read one with: read_skill("<name>")')
        return "\n".join(lines)

    def read_skill(name: str) -> str:
        """Return one skill's full text — the recipes, the traps, the verification steps.

        CALL THIS BEFORE WRITING CODE. The skills are the difference between a working
        result and a plausible-looking one: they carry the ordered recipe, the traps
        already paid for, and the check that proves the result.

        Args:
            name: a skill name from `list_skills`. ⚠ That tool lists exactly what THIS
                server offers, and the set DIFFERS between the servers — so read the
                catalogue rather than naming one from memory (e.g. "query-filter" and
                "write-modify" are on every server; "create-geometry" is not).

        Returns the skill's markdown. If the name is unknown, returns the catalogue so
        you can pick a valid one — never guess a name.
        """
        text = load_skill_text(domain, name)
        if text is None:
            known = ", ".join(s.name for s in skill_catalogue(domain))
            return f"No skill named {name!r}. Available: {known}"
        return text

    mcp.add_tool(list_skills, name="list_skills")
    mcp.add_tool(read_skill, name="read_skill")


def register_resources(mcp: FastMCP, domain: Domain) -> None:
    """The resource mirrors, kept for clients that DO read resources (MCP Inspector,
    VS Code). ⚠ On Claude Desktop these are inert — see `domain.py` — which is exactly
    why the same content is also served as tools."""

    @mcp.resource("paracore://skills", description="Skill catalogue — same content as list_skills().")
    def _skills_catalogue() -> str:
        lines = []
        for spec in skill_catalogue(domain):
            lines.append(f"## {spec.name}\n{spec.description}\n")
        return "\n".join(lines)

    @mcp.resource("paracore://system-prompt", description="The assembled system prompt — the same text the server sends as `instructions`.")
    def _system_prompt() -> str:
        return build_instructions(domain)

    @mcp.resource("paracore://globals", description="Complete list of globals, methods and pre-imported namespaces.")
    def _globals() -> str:
        return _t.get_globals()

    @mcp.resource("paracore://repl-guide", description="The authoritative REPL guide — magic category hydration strings and retrieval shortcuts.")
    def _repl_guide() -> str:
        return _pa.build_repl_guide()

    @mcp.resource("paracore://extension-methods", description="The complete extension-method reference.")
    def _extension_methods() -> str:
        return _pa.build_extension_reference()

    for spec in skill_catalogue(domain):
        def _make(name: str):
            @mcp.resource(f"skill://{name}/SKILL.md", description=spec.description)
            def _skill() -> str:
                return load_skill_text(domain, name) or f"Skill not found: {name}"
            return _skill
        _make(spec.name)


def register_prompts(mcp: FastMCP, domain: Domain) -> None:
    """One prompt template, for clients that surface `prompts/list`."""

    @mcp.prompt()
    def analyze_revit_model() -> str:
        """Prompt template for analysing the current Revit model."""
        return (
            f"Call ping, then get_context, then list_skills. Read the skills relevant to "
            f"the request with read_skill, and only then explore the Revit model."
        )


def setup_logging(domain: Domain, log_dir: str) -> str:
    """Rotating file log for this MCP, plus this MCP's metrics file. Returns the log path."""
    from logging.handlers import RotatingFileHandler

    os.makedirs(log_dir, exist_ok=True)
    path = os.path.join(log_dir, f"paracore_{domain.slug}.log")
    handler = RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3)
    handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    handler.setLevel(logging.INFO)
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    # ⚠ The metrics filename was the ONLY per-repo difference in `metrics.py`; it is a
    # parameter now, so the shared module writes `paracore_<slug>_metrics.json`.
    from mcp_core.metrics import init as init_metrics
    init_metrics(log_dir, domain.slug)

    logger.info("MCP logging initialised at %s", path)
    return path


def create_server(
    domain: Domain,
    *,
    omit_common: tuple[str, ...] = (),
    with_skills: bool = True,
    with_resources: bool = True,
) -> FastMCP:
    """Build a complete Paracore MCP server from a Domain.

    This is the whole-server path used by the REPL family (gen / model / family). A
    server with a genuinely different tool surface (forge, takeoff) builds its own
    FastMCP and calls `build_instructions` + the `register_*` helpers directly.
    """
    # ⚠ Record the domain FIRST: `tools.get_globals()` reads a prompt section through
    # `prompt_assembler`, which resolves the domain from here.
    _pa.set_active_domain(domain)

    mcp = FastMCP(domain.name, instructions=build_instructions(domain))
    register_common_tools(mcp, omit=omit_common)
    if with_skills:
        register_skill_tools(mcp, domain)
    if with_resources:
        register_resources(mcp, domain)
        register_prompts(mcp, domain)
    for fn in domain.extra_tools:
        mcp.add_tool(fn)

    # ⚠ The handshake version. `build_instructions` already carries the catalogue, so
    #   `attach_skill_catalogue` is NOT needed here — only a server with a hand-written
    #   instructions literal calls that (see its docstring).
    apply_server_version(mcp, domain)
    return mcp
