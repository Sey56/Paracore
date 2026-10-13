"""The REPL / dynamic-execution skill set — the SAME in every MCP that drives the engine.

⚠ THIS FILE IS THE AUTHORITY — and nothing is copied from it any more.
    Until 2026-10-13 it lived in `paracore-gen/mcp_core/` and was GENERATED into every other
    engine-driving MCP. The shared core is now ONE imported package, `paracore/mcp/mcp_core/`
    (read `domain.py`), so there is no copy to keep in step: this file IS the single home, and
    `paracore/scripts/gen-engine-docs.py` only READS it, to render each repo's `SKILLS.md`
    catalogue. Edit it here and every MCP sees the change on its next start.

WHY IT IS SHARED
    These nine skills teach the GENERIC engine's own methods (GetElements, WhereParam,
    SetVal, Wall.Create, ...), so there is nothing to specialise — every client that drives
    the engine gets the identical set. A specialist's own DOMAIN skills are declared
    ALONGSIDE this set in that repo's `mcp_server.py` (e.g. `project-modeling`,
    `family-authoring`), and those are not shared.

    A shared skill must therefore be CONTEXT-NEUTRAL. Routing that is true in only one repo
    belongs in that repo's server instructions, not in the skill body.

TWO VIEWS OF THE SAME SET, and they must not diverge:
    * `SHARED_SKILL_DESCRIPTIONS` — the one-line registry entry the MCP serves to the model.
    * `SHARED_SKILL_WHEN`         — the routing trigger, used to build each repo's `SKILLS.md`
                                    catalogue. `render_shared_skills()` FAILS if the two key
                                    sets differ, so a skill cannot be added to one and not
                                    the other.
"""

SHARED_SKILL_DESCRIPTIONS: dict[str, str] = {
    "query-filter":         "Element retrieval, filtering, and sorting — GetElements, WhereParam, WhereMatches, OrderByParam",
    "aggregate-group":      "Grouping, counting, and summing — GroupByParam, SumParam, aggregated totals",
    "parameter-access":     "Reading element parameters — GetStr, GetNum, GetVal, GetInt, type-level accessors",
    "write-modify":         "Modifying elements — SetVal, SetNum, SetParam, Delete, Hide, Isolate, Transact",
    "display-visualize":    "Rendering data — Table, BarGraph, PieGraph, LineGraph, ExportImage (view → image file), Println, Select projection",
    "discovery-debug":      "Exploring unknown elements — CombinedParams, Peek, BuiltInParams, GeometrySummary",
    "create-geometry":      "Creating new Revit elements — Wall.Create, Floor.Create, XYZ, CurveLoop, InputUnit",
    "identity-orientation": "Element identity and door/window data — FamilyName, Matches, RoomFrom, Handing",
    "materials-units":      "Materials, unit conversion, numeric helpers — InputUnit, OutputUnit, IsAlmostEqualTo",
}

# ⚠ CONTEXT-NEUTRAL by requirement. "or looking at the family" would be false in the other
# repos; "How many per level?" is a building question. These lines ship in EVERY MCP.
SHARED_SKILL_WHEN: dict[str, str] = {
    "query-filter":         "Always. Every query starts here.",
    "aggregate-group":      '"How many per type?", "Total volume?", any aggregation.',
    "parameter-access":     "Reading any data from elements.",
    "write-modify":         "Any modification request.",
    "display-visualize":    "Rendering results — or looking at the model.",
    "discovery-debug":      '"What parameters does this element have?", first time with a category.',
    "create-geometry":      "Any creation — a wall/floor/door/column.",
    "identity-orientation": "Identifying what something is, door schedules, orientation queries.",
    "materials-units":      "Material queries, unit conversion, geometry comparisons.",
}
