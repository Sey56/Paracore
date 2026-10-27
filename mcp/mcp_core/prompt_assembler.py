"""Prompt sections and the two big engine docs — read on demand, never assembled.

⚠⚠ THE SYSTEM PROMPT IS NOT BUILT HERE (2026-10-27). This module used to assemble TEN
`prompts/*.md` files into one ~36 K string via `build_prompt()`. When the shared core moved
here (2026-10-13) the live channel became `server.build_instructions()` — `COMMON_RULES` +
the Domain's intro + the skill catalogue, delivered as `instructions=` in the handshake —
and nothing called `build_prompt()` again. It was dead for two weeks while still reading
like the authority, and the eight prompt files behind it stayed on disk and shipped in
every installer. They are DELETED, not left inert: a stale file nothing reads is
indistinguishable from one that is about to be read.

What remains is what is genuinely read:
  * `globals.md` — the `paracore://globals` resource, via `tools.get_globals`.
  * `catalog.md` — the abbreviated fallback for `build_extension_reference()` when the
    bundled `EXTENSION_METHODS.md` is missing.
A Domain may still OVERRIDE either by shipping a file of the same name in
`<repo>/prompts/` — see `domain.read_prompt_section()`.

⚠⚠ THE DOC AUTHORITY IS TWO LEVELS UP FROM THIS FILE — AND GETTING IT WRONG IS SILENT.
    This module used to live in `paracore-gen/mcp_core/`, where the engine docs were
    `../../paracore/<doc>`. It now lives in `paracore/mcp/mcp_core/`, so the SAME authority
    is `../../<doc>` — one level LESS. A wrong path here raises nothing: `_doc_path()`
    simply finds no file and `build_extension_reference()` degrades to the abbreviated
    `catalog.md`, so the model is served a summary where it should have the full ~40 K
    catalog. That is the "a missing file must never look like success" rule, applied to a
    path. `_doc_path()` therefore returns None rather than a guess, and
    `build_extension_reference()` reports the degradation in its return value.
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROMPTS_DIR = os.path.join(_HERE, "prompts")

# `paracore/` — the ENGINE repo, and the AUTHORITY for EXTENSION_METHODS.md / REPL_GUIDE.md
# (see paracore/scripts/gen-engine-docs.py). From `paracore/mcp/mcp_core/` that is `../..`.
_PARACORE_REPO = os.path.normpath(os.path.join(_HERE, "..", ".."))

_cache: dict[str, str] = {}

# The domain currently being served. Set once by `server.create_server()`, so the shared
# tools (`tools.get_globals`) can read a section WITHOUT knowing the domain. A module-level
# value is right here: one process serves exactly one domain.
_active_domain = None


def set_active_domain(domain) -> None:
    """Tell the assembler which Domain is being served. Called once, at server build."""
    global _active_domain
    _active_domain = domain


def _resolve(domain):
    """`domain` if given, else the one `set_active_domain()` recorded, else None."""
    return domain if domain is not None else _active_domain


def _read(filename: str) -> str:
    """Read a prompt file from the SHARED prompts directory, with caching."""
    if filename in _cache:
        return _cache[filename]
    path = os.path.join(_PROMPTS_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        _cache[filename] = content
        return content
    except FileNotFoundError:
        return f"[Prompt file not found: {filename}]"


# ── Prompt sections ───────────────────────────────────────────────────────
# ⚠ THERE IS NO COMPOSED PROMPT, AND THERE MUST NOT BE ONE (2026-10-27). `_SECTIONS` +
#   `build_prompt()` were removed: nothing called them, and keeping a ten-file list on disk
#   made the dead files look maintained. The live prompt is `server.build_instructions()`.
#   ⚠ A new rule belongs in `server.COMMON_RULES` or the Domain's `intro` — NOT in a new
#     `prompts/*.md`, which would be dead the moment it was written.


def get_section(name: str, domain=None) -> str:
    """One section by filename (e.g. 'globals.md'), preferring the domain's override."""
    domain = _resolve(domain)
    if domain is None:
        return _read(name)
    from mcp_core.domain import read_prompt_section
    return read_prompt_section(domain, name)


# ── The two big ENGINE docs (authority: paracore/) ────────────────────────

def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _doc_path(filename: str) -> str | None:
    """Where `filename` (an engine doc) actually is — or None. Never a guess.

    Frozen: PyInstaller unpacked the bundled copy into `sys._MEIPASS` (see the repo's
    build script, `--add-data "<doc>;."`).
    Dev: the AUTHORITY in `paracore/` — its ONE home. (Until 2026-10-13 a `paracore-gen/`
    copy was tried second. That repo does not own the docs any more, and a second candidate
    is exactly the drift surface this module exists to avoid.)
    """
    if _frozen():
        candidates = [os.path.join(getattr(sys, "_MEIPASS", _HERE), filename)]
    else:
        candidates = [os.path.join(_PARACORE_REPO, filename)]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def _read_doc(filename: str) -> str | None:
    path = _doc_path(filename)
    if path is None:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def build_extension_reference() -> str:
    """The complete EXTENSION_METHODS.md.

    ⚠ Falls back to the abbreviated `catalog.md` only when the full doc cannot be found,
    and SAYS SO in the returned text — a silent downgrade here is how the model ends up
    without the API reference while everything looks healthy.
    """
    content = _read_doc("EXTENSION_METHODS.md")
    if content:
        return content
    return (
        "[EXTENSION_METHODS.md NOT FOUND — serving the abbreviated catalog instead. "
        "The full reference is the authority `paracore/EXTENSION_METHODS.md`; run "
        "`paracore/scripts/gen-engine-docs.py --write` if a repo copy is missing.]\n\n"
        + _read("catalog.md")
    )


def build_repl_guide() -> str:
    """The complete REPL_GUIDE.md (magic hydration strings, retrieval shortcuts)."""
    content = _read_doc("REPL_GUIDE.md")
    if content:
        return content
    return (
        "[REPL_GUIDE.md NOT FOUND — the authority is `paracore/REPL_GUIDE.md`.]"
    )


def reload() -> None:
    """Clear caches so files are re-read on next access (useful for hot-reload)."""
    _cache.clear()
    _prompt_cache.clear()
