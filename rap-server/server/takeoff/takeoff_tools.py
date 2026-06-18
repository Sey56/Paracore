"""
TakeOff-specific C# code generators.
Each function generates a one-liner C# snippet that calls a domain-specific
Paracore extension method. The heavy lifting is in CoreScript.Engine/Globals/TakeOffExtensions.cs.
The Python layer does protocol translation + security + summarization only.
"""

from typing import Optional


def discover_model_categories() -> str:
    """List all model categories with element counts."""
    return "Doc.GetModelCategoryCounts().OrderByDescending(r => r.Count).Table();"


def get_room_data(level: Optional[str] = None) -> str:
    """Get room name, number, area (m²), perimeter (m), volume (m³)."""
    if level:
        return f'GetElements<Room>().WhereParam("Level", "{level}").GetRoomData().Table();'
    return "GetElements<Room>().GetRoomData().Table();"


def get_counts_by_type(category: str) -> str:
    """Count elements grouped by family type name."""
    return f'GetElements("{category}").GetCountsByType().Table();'


def get_elements_by_category(category: str, param_filter: Optional[str] = None, filter_value: Optional[str] = None) -> str:
    """Get element summary with optional parameter filter."""
    code = f'GetElements("{category}")'
    if param_filter and filter_value:
        code += f'.WhereParam("{param_filter}", "{filter_value}")'
    code += ".GetElementSummary(200).Table();"
    return code


def get_material_quantities(category: str) -> str:
    """Get material names, total volume (m³), total area (m²), element count."""
    return f'GetElements("{category}").GetMaterialQuantities().Table();'


def get_material_breakdown(category: str) -> str:
    """Per-element material breakdown with Id and name."""
    return f'GetElements("{category}").Take(200).GetMaterialBreakdown().Table();'


def get_compound_structure_layers(category: str) -> str:
    """Layer composition of wall/floor/roof types."""
    # Revit type names are singular: WallType, FloorType, RoofType, CeilingType
    # The category string is usually plural: Walls, Floors, Roofs, Ceilings
    singular = category.rstrip("s") if category.lower().endswith("s") else category
    return f'GetElements<{singular}Type>().GetCompoundStructureLayers().Table();'


def compute_formwork(category: str) -> str:
    """Compute shuttering/formwork area (m²) for concrete elements."""
    return f'GetElements("{category}").ComputeFormwork().Table();'
