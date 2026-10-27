import logging
import re
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


# ── Parameter-name hygiene ──────────────────────────────────────────────────
# ⚠⚠ AN OLDER ADD-IN PRINTS A NAME THAT CANNOT BE USED (2026-10-27). It used to
#   disambiguate two parameters that share a name by appending the STORAGE TYPE —
#   "Level [Reference]", "Frame Material [String]" — while this module's own header
#   says "COPY THE EXACT NAME". Measured on the live model: GetStr("Level [Reference]")
#   returns "" and warns "parameter not found". The add-in no longer appends it, but an
#   add-in installed before that change still does, and the MCP must not repeat a name
#   it knows is wrong. Strip the annotation here, and show the real name.
#
#   ⚠ Only a KNOWN annotation token is stripped. A blanket `\s*\[.*\]$` would corrupt a
#   real name that happens to end in brackets, which is unlikely but not impossible —
#   and silently renaming a parameter is exactly the failure this whole fix is about.
_ANNOTATION_TOKENS = {
    "reference", "instance", "type",
    "string", "double", "integer", "elementid", "length", "area", "volume",
    "boolean", "yesno", "number", "text", "enum",
}

_ANNOTATION_RE = re.compile(r"\s*\[([^\[\]]*)\]\s*$")


def base_parameter_name(name: str) -> str:
    """`"Level [Reference]"` → `"Level"`. Any other bracketed tail is left alone."""
    raw = (name or "").strip()
    m = _ANNOTATION_RE.search(raw)
    if m and m.group(1).strip().lower() in _ANNOTATION_TOKENS:
        return raw[: m.start()].strip()
    return raw


def _resolve_key(category_name: str) -> Optional[str]:
    """The cache key for `category_name`, exact first then case-insensitive.

    ⚠ The cache is keyed by whatever name SUCCEEDED (often an `OST_` variant found by
    `_try_alt_name`), so a caller's spelling is not necessarily a key. Returning None
    rather than the caller's string is deliberate: "not cached" must not be reported as
    "a category with no parameters".
    """
    if category_name in _cache:
        return category_name
    for key in _cache:
        if key.lower() == category_name.lower():
            return key
    return None


def schema_rows(category_name: str) -> List[dict]:
    """The parameter rows for a category: de-duplicated, annotations stripped.

    ⚠⚠ THE ONE PLACE THAT DECIDES WHAT A ROW IS. `search_schema` renders these, and the
    usage example in `tools.search_schema` is built from these, so the example can only
    ever name a parameter that appears in the list above it. They used to be written
    independently — the list said `Base Constraint`, the example said `Level`, and on
    Walls (62 parameters, no `Level` at all) the example produced a silently empty
    column. Returns [] when the category is not cached, which is also the signal that
    there is nothing to build an example from.
    """
    key = _resolve_key(category_name)
    if key is None:
        return []

    # ⚠ Two rows can still be IDENTICAL — two distinct parameters that share a name, a
    #   storage type and a scope (measured: "Level" twice on Doors). They are collapsed:
    #   a second identical line teaches the agent nothing and reads as a bug in this tool.
    #   Rows that differ in storage or scope are kept, because THAT is the difference.
    seen: set = set()
    rows: List[dict] = []
    for p in _cache[key]:
        name = base_parameter_name(p.get("name", ""))
        storage = p.get("storage_type", "?")
        scope = "Type" if p.get("is_type") else "Instance"
        dedupe = (name.lower(), storage, scope)
        if dedupe in seen:
            continue
        seen.add(dedupe)
        rows.append({"name": name, "storage": storage, "scope": scope})
    return rows


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
            # Fetch from Revit — try display name then BuiltInCategory enum variants
            logger.info(f"Schema cache: fetching parameters for '{category_name}'")
            params = _fetch_category_params(category_name)
            if not params:
                alt_name = _try_alt_name(category_name)
                if alt_name and alt_name != category_name:
                    logger.info(f"Schema cache: retrying with '{alt_name}'")
                    params = _fetch_category_params(alt_name)
                    # Cache under BOTH names for future lookups
                    if params:
                        _cache[alt_name] = params
                        _populated_categories.add(alt_name)
            # Only cache non-empty results — empty means "try again with different name"
            if params:
                _cache[category_name] = params
                _populated_categories.add(category_name)

    params = _cache.get(category_name, [])
    if not params:
        return (
            f"No parameters found for category '{category_name}'. "
            f"Try GetMagicNames() via explore_revit_data to list valid category names, "
            f"or use GetElements(\"{category_name}\").First().CombinedParams().Table() "
            f"to discover parameters directly from a live element."
        )

    # Format as compact LLM-friendly list
    # CRITICAL: only the name inside backticks is the parameter name. Storage/scope are metadata ONLY.
    # ⚠ The de-duplication and the annotation stripping live in `schema_rows` — see its
    #   docstring for why the ROWS had to become the single source of truth.
    rows = schema_rows(category_name)
    lines = [f"**{category_name}** — {len(rows)} parameters:\n"]
    lines.append("COPY THE EXACT NAME (the text in backticks). The rest is metadata — DO NOT include it in your code.\n")
    lines.extend(f"- `{r['name']}` | {r['storage']} | {r['scope']}" for r in rows)
    return "\n".join(lines)


def _try_alt_name(name: str) -> Optional[str]:
    """Try variations to match the gRPC GetCategoryParameters naming convention.

    The C# GetCategoryParameters uses Enum.TryParse<BuiltInCategory> which requires
    OST_ prefix + no spaces (e.g. "OST_StructuralColumns"). But GetElements() in C#
    accepts display names ("Structural Columns"). So we try enum-compatible names first.
    """
    variations = []
    lower = name.lower()

    # 1. OST_ prefix with no spaces — matches BuiltInCategory enum (MOST LIKELY to work)
    variations.append("OST_" + name.replace(" ", ""))
    # 2. OST_ prefix with spaces preserved
    variations.append("OST_" + name)
    # 3. No spaces, no prefix
    if " " in name:
        variations.append(name.replace(" ", ""))
    # 4. Singular/Plural variants
    if lower.endswith("s") and len(name) > 2:
        variations.append(name[:-1])
    if not lower.endswith("s"):
        variations.append(name + "s")

    for alt in variations:
        params = _fetch_category_params(alt)
        if params:  # Only consider non-empty results
            _cache[alt] = params
            _populated_categories.add(alt)
            logger.info(f"Schema cache: alt name '{alt}' succeeded with {len(params)} params")
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
