"""
WHERE THE SHARED MCP CORE LIVES — one definition, used by every gate in this repo.

⚠⚠ THE CORE MOVED OUT OF THIS REPO ON 2026-10-30. It used to sit at
`paracore/mcp/mcp_core/`, i.e. inside the FREE engine repo, while every product that
bundles it is paid. That made the free repo the source of truth for commercial code, and
it made "which core is in this exe?" unanswerable. It now lives in its own PUBLIC, MIT
repo (`paracore-mcp-core`) at `mcp_core/` — the root — and this module is how the engine's
gates find it.

⚠ TWO paths are needed, not one, and they are NOT in the same repo:

  * `CORE_REPO`  — `paracore-mcp-core`, the Python package (`mcp_core/…`).
  * `WIRE_DIR`   — `paracore/mcp`, which still holds `grpc_client.py`, `utils.py` and the
                   generated `corescript_pb2*.py` beside the `protos/corescript.proto`
                   that makes them. `mcp_core` imports `grpc_client` in five places, so a
                   build or a gate that sets only `CORE_REPO` fails at import.

⚠ The defaults assume the sibling layout (`<workspace>/paracore` + `<workspace>/
paracore-mcp-core`). The env vars are the SAME two the five build scripts read, so a gate
and a build can never disagree about where the core is:
    PARACORE_MCP_CORE   PARACORE_WIRE_DIR

⚠ Resolution FAILS LOUDLY. A missing core must stop a gate, not let it scan nothing and
report green — an empty scan that passes is the defect this whole suite exists to prevent.
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
PARACORE = os.path.dirname(_HERE)          # this repo
WORKSPACE = os.path.dirname(PARACORE)      # the parent that holds the sibling repos


def _resolve(env_var: str, default: str, probe: tuple, label: str) -> str:
    root = os.environ.get(env_var) or default
    if not os.path.isfile(os.path.join(root, *probe)):
        raise SystemExit(
            f"BUILD GATE FAILED: {label} was not found at {root!r}\n"
            f"  expected {'/'.join(probe)} there.\n"
            f"  The repos must be SIBLING checkouts under one parent "
            f"({WORKSPACE!r}), or set {env_var}.")
    return root


CORE_REPO = _resolve(
    "PARACORE_MCP_CORE",
    os.path.join(WORKSPACE, "paracore-mcp-core"),
    ("mcp_core", "__init__.py"),
    "the shared MCP core",
)

WIRE_DIR = _resolve(
    "PARACORE_WIRE_DIR",
    os.path.join(PARACORE, "mcp"),
    ("grpc_client.py",),
    "the wire contract (grpc_client.py)",
)

#: the package directory itself — `<core repo>/mcp_core`
CORE = os.path.join(CORE_REPO, "mcp_core")


def install_syspath() -> None:
    """Make `import mcp_core…` and `import grpc_client` work from a gate in this repo."""
    import sys

    for path in (WIRE_DIR, CORE_REPO):
        if path not in sys.path:
            sys.path.insert(0, path)
