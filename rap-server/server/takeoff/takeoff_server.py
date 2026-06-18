"""
Paracore-TakeOff MCP Server — Read-only quantity takeoff for Revit.

This is a SPECIALIZED MCP server. Unlike the generalist Paracore MCP which
exposes the full REPL engine, this server exposes curated takeoff tools.
The LLM never writes C# directly — it calls these structured functions with
parameters, and the server generates the C# internally.

All tools are READ-ONLY. No modifications, no HITL approval needed.
"""

import os
import sys

# Path handling — same pattern as generalist MCP
if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)
else:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(current_dir)
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)

import logging
from mcp.server.fastmcp import FastMCP
from grpc_client import init_channel, close_channel, execute_repl

from mcp_core.tools import validate_csharp, handle_execution_result

# TakeOff-specific C# code generators
from takeoff.takeoff_tools import (
    discover_model_categories,
    get_room_data,
    get_counts_by_type,
    get_elements_by_category,
    get_material_quantities,
    get_material_breakdown,
    get_compound_structure_layers,
    compute_formwork,
)

# Configure logging to %APPDATA%\paracore-data\logs\
if getattr(sys, 'frozen', False):
    _log_dir = os.path.join(os.getenv("APPDATA", ""), "paracore-data", "logs")
    os.makedirs(_log_dir, exist_ok=True)
    _log_file = os.path.join(_log_dir, "paracore_takeoff.log")
    _handler = logging.FileHandler(_log_file)
    _handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger = logging.getLogger("paracore-takeoff")
    logger.setLevel(logging.INFO)
    logger.addHandler(_handler)
else:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("paracore-takeoff")

# ── System prompt (focused, domain-specific) ──────────────────────────────

TAKEOFF_SYSTEM_PROMPT = """You are a professional quantity surveyor using NRM2 measurement rules.
Your tools extract structured quantity data from a live Revit model via the Paracore engine.

WORKFLOW:
  1. discover_model_categories → see what's in the model
  2. get_counts_by_type → understand family type breakdown per category
  3. get_material_quantities → extract material volumes and areas
  4. get_compound_structure_layers → layer-by-layer composition for walls/floors/roofs
  5. get_room_data → room areas, perimeters, volumes (filter by level if needed)
  6. compute_formwork → shuttering area for concrete elements
  7. get_elements_by_category → detailed element listing with filters

OUTPUT: All quantities in metric (m, m², m³, mm, kg). Areas in m² to 2 decimal places.
Always summarize totals. Group by material, level, or work section as appropriate.

UNITS: Length=m, Area=m², Volume=m³, Thickness=mm, Weight=kg.
The engine handles conversion from Revit internal units (decimal feet) automatically.
"""

# ── MCP Server ─────────────────────────────────────────────────────────────

mcp = FastMCP(
    "Paracore-TakeOff",
    instructions=TAKEOFF_SYSTEM_PROMPT,
)


def _execute(code: str, justification: str) -> str:
    """Execute takeoff C# code and return formatted results."""
    error = validate_csharp(code)
    if error:
        return error
    logger.info(f"TakeOff: {justification}")
    try:
        result = execute_repl(code, "takeoff-session",
                              execution_mode="read_only", source="takeoff_mcp")
        return handle_execution_result(result)
    except Exception as e:
        logger.error(f"TakeOff execution error: {e}")
        return f"Error: {str(e)}"


# ── Tools ──────────────────────────────────────────────────────────────────

@mcp.tool()
def ping() -> str:
    """Verify the TakeOff MCP server is alive and connected to Revit.
    Always call this first."""
    return "pong — Paracore-TakeOff MCP server connected to Revit."


@mcp.tool()
def _discover_model_categories() -> str:
    """List all model categories with element counts. Use this FIRST to
    see what's in the model before running detailed takeoff queries.
    Returns a table of Category | Count, sorted by count descending."""
    return _execute(discover_model_categories(), "List model categories with counts")


@mcp.tool()
def _get_room_data(level: str = "") -> str:
    """Extract room data: name, number, area (m²), perimeter (m), volume (m³).
    If 'level' is provided (e.g. "Level 1"), filters to that level.
    Returns a table sorted by level then area descending."""
    return _execute(get_room_data(level if level else None), f"Get room data (level={level or 'all'})")


@mcp.tool()
def _get_counts_by_type(category: str) -> str:
    """Count elements of a category grouped by family type.
    'category' is a Revit category name (e.g. "Walls", "Doors", "Windows").
    Returns a table of Type | Count."""
    return _execute(get_counts_by_type(category), f"Count {category} by type")


@mcp.tool()
def _get_elements_by_category(category: str, filter_param: str = "", filter_value: str = "") -> str:
    """Get detailed element listing for a category.
    'category': Revit category name (e.g. "Structural Columns").
    'filter_param': Optional parameter name to filter by (e.g. "Level").
    'filter_value': Optional value for the filter (e.g. "Level 1").
    Returns up to 200 elements with Id, Name, Level, and Type."""
    return _execute(
        get_elements_by_category(category, filter_param if filter_param else None, filter_value if filter_value else None),
        f"List {category} elements"
    )


@mcp.tool()
def _get_material_quantities(category: str) -> str:
    """Extract material quantities grouped and summed by material name.
    Returns Material | TotalVolume_m3 | TotalArea_m2 | ElementCount.
    Use this for summary-level takeoff. For per-element detail, use
    _get_material_breakdown."""
    return _execute(get_material_quantities(category), f"Material quantities for {category}")


@mcp.tool()
def _get_material_breakdown(category: str) -> str:
    """Per-element material breakdown with ElementId, ElementName, Material,
    Volume_m3, and Area_m2. Use this for detailed line-item takeoff where
    each element's contribution needs to be tracked individually."""
    return _execute(get_material_breakdown(category), f"Material breakdown for {category}")


@mcp.tool()
def _get_compound_structure_layers(category: str) -> str:
    """Get layer-by-layer composition of wall/floor/roof types.
    Returns type name, layer function, material, and thickness (mm).
    Only works for categories with compound structures (Walls, Floors, Roofs, Ceilings)."""
    return _execute(get_compound_structure_layers(category), f"Compound structure layers for {category}")


@mcp.tool()
def _compute_formwork(category: str) -> str:
    """Compute shuttering/formwork area (m²) for concrete elements.
    For columns: calculates perimeter × height. For walls/slabs: 2 × face area.
    Returns per-element formwork area and a total."""
    return _execute(compute_formwork(category), f"Formwork calculation for {category}")


# ── Resources ──────────────────────────────────────────────────────────────

@mcp.resource("takeoff://system-prompt")
def read_system_prompt() -> str:
    """Full TakeOff system prompt with workflow and NRM2 guidance."""
    return TAKEOFF_SYSTEM_PROMPT


if __name__ == "__main__":
    init_channel()
    logger.info("Starting Paracore-TakeOff MCP Server via stdio...")
    try:
        mcp.run(transport="stdio")
    finally:
        close_channel()
        logger.info("Paracore-TakeOff MCP Server closed.")
