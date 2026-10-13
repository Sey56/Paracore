"""Where the shared core and the domain's own data live — one answer, in one place.

Every Paracore MCP runs in one of two worlds, and the difference is only ever *where files
are*, never *what the code does*:

    DEV      the repo checkout. The shared core is a SIBLING (`../paracore/mcp`), the
             domain's `skills/` and `prompts/` sit next to the server file.
    FROZEN   a PyInstaller one-file exe. Everything was unpacked into `sys._MEIPASS`:
             the shared core at the top level (`_MEIPASS/mcp_core/`, `_MEIPASS/grpc_client.py`)
             and the domain's data as `_MEIPASS/skills/` and `_MEIPASS/prompts/`.

⚠ `domain_root()` is the ONLY thing that differs between the two, and it is the value a
    Domain carries (`Domain.root`). A Domain built with the wrong root finds no skills —
    which is exactly the silent failure this module exists to prevent.
"""

from __future__ import annotations

import os
import sys


def is_frozen() -> bool:
    """True inside a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def domain_root(caller_file: str) -> str:
    """The directory holding the DOMAIN's `skills/` and `prompts/`.

    Frozen: `sys._MEIPASS` (the bundle root — the build script puts `skills/` and
    `prompts/` there with `--add-data "skills;skills"`).
    Dev: the directory of the calling server file.
    """
    if is_frozen():
        return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(caller_file)))
    return os.path.dirname(os.path.abspath(caller_file))


def resource_path(caller_file: str, *parts: str) -> str:
    """A bundled data file of THIS repo, e.g. `resource_path(__file__, "REPL_GUIDE.md")`."""
    return os.path.join(domain_root(caller_file), *parts)


def shared_core_dir() -> str:
    """The directory that must be on `sys.path` — the one holding `mcp_core/`.

    ⚠ Derived from THIS file, so it is correct in both worlds without a branch:
    dev `paracore/mcp/mcp_core/bootstrap.py` → `paracore/mcp`;
    frozen `_MEIPASS/mcp_core/bootstrap.py`  → `_MEIPASS`.
    """
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
