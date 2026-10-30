#!/usr/bin/env python3
"""
THE BOUNDARY GATE — `paracore/mcp/` may hold ONLY the wire contract.

⚠⚠ WHY THIS EXISTS. The shared MCP framework lives in its own PUBLIC repo,
`paracore-mcp-core/`, and NOT here — this repo is the generic engine, and the framework is shared by
five MCP servers. A directory that "used to hold the shared core" is an invitation: the next person
who needs a helper for two MCPs adds it here — where it is MIT and public the moment it is committed
— and nobody reviewing the other products would think to look.

⚠⚠ A TEXT SCAN CANNOT DEFEND THIS. `check-retired-refs.py` can only flag a path somebody
wrote down; the defect is a FILE THAT EXISTS. So this gate asserts the directory's CONTENTS
against a whitelist: anything not named below fails, however it is spelled, whoever added it.

⚠ An absent or empty directory FAILS. "Nothing to check" is not "clean" (rule 3): the wire
contract must be present, because `mcp_core` imports `grpc_client` in five places
(`tools.py:22,763,826`, `schema_cache.py:17,203`) and every build passes this directory as
`$WireDir`.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARACORE = os.path.dirname(HERE)
MCP = os.path.join(PARACORE, "mcp")

#: Everything `paracore/mcp/` is allowed to contain. The three `corescript_pb2*` files are
#: GENERATED from `protos/corescript.proto` by `scripts/gen-protos.py`; they live here rather
#: than in the core repo so the stubs sit beside the proto that makes them.
ALLOWED_FILES = {
    "grpc_client.py",
    "utils.py",
    "corescript_pb2.py",
    "corescript_pb2.pyi",
    "corescript_pb2_grpc.py",
}

#: Directories that are build output, not source.
ALLOWED_DIRS = {"__pycache__"}


def main() -> int:
    print(f"directory : {MCP}")

    if not os.path.isdir(MCP):
        print("FAIL: the wire-contract directory is MISSING.")
        print("      Every MCP build passes it as $WireDir and imports grpc_client from it.")
        return 1

    entries = sorted(os.listdir(MCP))
    if not entries:
        print("FAIL: the directory is EMPTY — an empty scan is not a clean one.")
        return 1

    print(f"entries   : {len(entries)}")

    extra = []
    for name in entries:
        path = os.path.join(MCP, name)
        if os.path.isdir(path):
            if name not in ALLOWED_DIRS:
                extra.append(f"{name}/  (directory)")
            continue
        if name not in ALLOWED_FILES:
            extra.append(f"{name}  ({os.path.getsize(path):,} B)")

    present = {n for n in entries if os.path.isfile(os.path.join(MCP, n))}
    missing = sorted(ALLOWED_FILES - present)

    for name in sorted(ALLOWED_FILES & present):
        print(f"  ok      {name}")

    for name in missing:
        # ⚠ A missing generated stub is not a style problem: `gen-protos.py --check` would
        #   also catch it, but this gate must not report green on a half-present contract.
        print(f"  ⚠ MISSING {name}")

    if extra:
        print()
        print(f"FAIL: {len(extra)} entr(y/ies) in `paracore/mcp/` are NOT the wire contract:")
        for line in extra:
            print(f"  + {line}")
        print()
        print("  This directory is the WIRE CONTRACT only — grpc_client.py, utils.py and the")
        print("  generated corescript_pb2*.py, beside protos/corescript.proto which makes them.")
        print("  ⚠ Shared MCP-server code belongs in `paracore-mcp-core/mcp_core/`, which is")
        print("    PUBLIC MIT. Anything committed HERE is MIT and public immediately, so this")
        print("    repo must not carry framework code its owner keeps private.")
        print("  ⚠ If the file is legitimate wire-contract code, add it to ALLOWED_FILES and")
        print("    say why in the commit message. Do not widen the rule to make a file pass.")
        return 1

    if missing:
        print()
        print(f"FAIL: {len(missing)} wire-contract file(s) absent — the contract is incomplete.")
        return 1

    print()
    print("`paracore/mcp/` holds the wire contract and nothing else.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
