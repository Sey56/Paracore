import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# In-memory cache: category_name -> list of param dicts
_cache: Dict[str, List[dict]] = {}

# Track whether we attempted a full population (prevents repeated failures)
_populated_categories: set = set()


def _fetch_category_params(category_name: str) -> List[dict]:
    """Fetch parameter definitions for a category via gRPC."""
    try:
        from grpc_client import get_category_parameters
        result = get_category_parameters(category_name)
        if result.get("error_message"):
            logger.warning(f"Schema cache: error fetching {category_name}: {result['error_message']}")
            return []
        return result.get("parameters", [])
    except Exception as e:
        logger.warning(f"Schema cache: gRPC error fetching {category_name}: {e}")
        return []


def search_schema(category_name: str) -> str:
    """
    Search the cached model schema for a Revit category's parameter definitions.
    Returns parameter names, storage types, and type/instance classification.
    First call for a category fetches from Revit via gRPC; subsequent calls use cache.
    """
    global _cache, _populated_categories

    # Try exact match first
    if category_name not in _cache:
        # Also try case-insensitive match
        match = None
        for key in _cache:
            if key.lower() == category_name.lower():
                match = key
                break
        if match:
            category_name = match
        else:
            # Fetch from Revit
            logger.info(f"Schema cache: fetching parameters for '{category_name}'")
            params = _fetch_category_params(category_name)
            if not params:
                # Try with common Revit plural/singular variations
                alt_name = _try_alt_name(category_name)
                if alt_name:
                    logger.info(f"Schema cache: retrying with '{alt_name}'")
                    params = _fetch_category_params(alt_name)
            _cache[category_name] = params
            _populated_categories.add(category_name)

    params = _cache.get(category_name, [])
    if not params:
        return f"No parameters found for category '{category_name}'. Try GetMagicNames() to list valid category names."

    # Format as compact LLM-friendly list
    lines = [f"**{category_name}** — {len(params)} parameters:\n"]
    for p in params:
        storage = p.get("storage_type", "?")
        scope = "Type" if p.get("is_type") else "Instance"
        builtin = f" [{p.get('builtin_name', '')}]" if p.get("builtin_name") else ""
        lines.append(f"- `{p['name']}` [{storage}][{scope}]{builtin}")
    return "\n".join(lines)


def _try_alt_name(name: str) -> Optional[str]:
    """Try common plural/singular variations and Revit naming conventions."""
    variations = []
    lower = name.lower()
    # Strip trailing 's' for singular
    if lower.endswith("s") and len(name) > 2:
        variations.append(name[:-1])
    # Add 's' for plural
    if not lower.endswith("s"):
        variations.append(name + "s")
    # Try spaces → no spaces
    if " " in name:
        variations.append(name.replace(" ", ""))
    # Try Revit OST_ prefix
    ost_name = "OST_" + name.replace(" ", "")
    variations.append(ost_name)

    for alt in variations:
        params = _fetch_category_params(alt)
        if params:
            _cache[alt] = params
            _populated_categories.add(alt)
            return alt
    return None


def get_all_categories() -> List[str]:
    """Return list of all currently cached categories (populate first)."""
    global _cache
    if not _cache:
        # Seed cache with all model categories at once
        try:
            from grpc_client import get_model_categories
            result = get_model_categories()
            cats = result.get("categories", [])
            for cat in cats:
                name = cat.get("label") or cat.get("id", "?")
                if name not in _cache:
                    params = _fetch_category_params(name)
                    _cache[name] = params
                    _populated_categories.add(name)
            logger.info(f"Schema cache: populated {len(_cache)} categories")
            return list(_cache.keys())
        except Exception as e:
            logger.warning(f"Schema cache: failed to populate all categories: {e}")
            return list(_cache.keys())
    return list(_cache.keys())


def clear_cache():
    """Clear the schema cache (call on document switch)."""
    global _cache, _populated_categories
    _cache = {}
    _populated_categories = set()
    logger.info("Schema cache cleared.")
