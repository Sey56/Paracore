#!/usr/bin/env python3
"""
Compute a STABLE, CLONE-PROOF hash of a repo's Python sources.

Usage:
    python source_hash.py <repo_root>

The hash is sha256 of sorted lines, each line being:
    <relpath>\0<sha256_of_file_contents>\n
This is:
- Clone-proof: the same commit hashes the same on any machine.
- Order-independent: files are sorted by relpath before hashing.
- Timestamp-independent: only file contents matter.
- Rebuild-safe: a no-change rebuild produces the same hash.

Excluded: .venv, __pycache__, build, dist, node_modules, .git, .workbuddy-ai,
.tox, .pytest_cache, *.egg-info, _scratch.

Returns "unknown" on error or if no .py files are found.
"""

import hashlib
import os
import sys

EXCLUDE_DIRS = frozenset({
    ".venv", "venv", "__pycache__", "build", "dist", "node_modules",
    ".git", ".workbuddy-ai", ".tox", ".pytest_cache", "_scratch",
})
EXCLUDE_SUFFIXES = frozenset({".egg-info"})


def compute(root: str) -> str:
    """Return the source hash, or raise."""
    root = os.path.abspath(root)
    entries: list[tuple[str, str]] = []

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories in-place so os.walk doesn't descend
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not any(d.endswith(s) for s in EXCLUDE_SUFFIXES)
        ]
        for fname in filenames:
            if not fname.endswith(".py"):
                continue
            fpath = os.path.join(dirpath, fname)
            relpath = os.path.relpath(fpath, root).replace("\\", "/")
            with open(fpath, "rb") as fh:
                digest = hashlib.sha256(fh.read()).hexdigest()
            entries.append((relpath, digest))

    if not entries:
        return "unknown"

    entries.sort(key=lambda t: t[0])
    h = hashlib.sha256()
    for relpath, digest in entries:
        h.update(relpath.encode("utf-8"))
        h.update(b"\x00")
        h.update(digest.encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()[:16]


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: source_hash.py <repo_root>", file=sys.stderr)
        return 1
    try:
        print(compute(sys.argv[1]))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"unknown  ({exc})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
