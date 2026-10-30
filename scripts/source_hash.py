#!/usr/bin/env python3
"""
Compute a STABLE, CLONE-PROOF hash of a repo's Python SOURCE.

Usage:
    python source_hash.py <repo_root>

The hash is sha256 of sorted lines, each line being:
    <relpath>\0<sha256_of_file_contents>\n

Design — what counts as "source":
⚠⚠ ONLY TRACKED .py FILES. The list of files comes from `git ls-files *.py`, so every
   throwaway file — `scratch/`, `spikes/probe_*.py`, `_patch_*.py`, `_typewrite.py` — is
   excluded automatically, whatever its directory is called. These are ad-hoc experiments,
   not source, and folding them in makes the hash change whenever someone drops a scratch
   file, which defeats the identity. MEASURED 2026-10-30: forge's `scratch/` (12 untracked
   .py) and gen's `spikes/probe_*.py` etc. were being included, so the baked hash did not
   match the committed tree and the gate flagged a false "edited after build".
⚠⚠ CONTENT IS READ FROM DISK, not from git, so an uncommitted edit to a TRACKED file still
   changes the hash — that is exactly the "edited after build" case this pin exists to catch.
⚠ A NEW untracked .py (not yet `git add`ed) is NOT counted. That is deliberate: until it is
   tracked it is not "the source". (A brand-new module that should ship must be `git add`ed,
   at which point it is.)

Fallback: if git is unavailable (an exported tree, no .git), walk the filesystem and EXCLUDE
   the build/output dirs listed in EXCLUDE_DIRS. This is less safe (it can pick up loose
   files) but keeps the script working outside a git checkout.

Properties: clone-proof (same commit → same hash anywhere), timestamp-independent (contents
only), rebuild-safe (a no-change rebuild hashes the same). Returns "unknown" on error.
"""

import hashlib
import os
import subprocess
import sys

EXCLUDE_DIRS = frozenset({
    ".venv", "venv", "__pycache__", "build", "dist", "node_modules",
    ".git", ".workbuddy-ai", ".tox", ".pytest_cache", "_scratch", "scratch",
})
EXCLUDE_SUFFIXES = frozenset({".egg-info"})


def _tracked_py_files(root: str):
    """Return the list of tracked .py files (relpaths) via git, or None if git fails."""
    try:
        p = subprocess.run(
            ["git", "-C", root, "ls-files", "*.py"],
            capture_output=True, text=True, timeout=60,
        )
        if p.returncode != 0:
            return None
        files = [ln for ln in p.stdout.splitlines() if ln]
        return files if files else None
    except (OSError, subprocess.SubprocessError):
        return None


def _walk_py_files(root: str):
    """Filesystem fallback: every .py outside the build/output dirs."""
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not any(d.endswith(s) for s in EXCLUDE_SUFFIXES)
        ]
        for fname in filenames:
            if fname.endswith(".py"):
                files.append(os.path.relpath(os.path.join(dirpath, fname), root))
    return files


def compute(root: str) -> str:
    """Return the source hash, or raise."""
    root = os.path.abspath(root)

    files = _tracked_py_files(root)
    using_git = files is not None
    if not using_git:
        files = _walk_py_files(root)

    entries: list[tuple[str, str]] = []
    for rel in files:
        rel = rel.replace("\\", "/")
        if any(part in EXCLUDE_DIRS for part in rel.split("/")):
            continue
        fpath = os.path.join(root, rel)
        if not os.path.isfile(fpath):
            continue  # tracked-but-deleted; let git's view of the tree win
        with open(fpath, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        entries.append((rel, digest))

    if not entries:
        return "unknown"

    entries.sort(key=lambda t: t[0])
    h = hashlib.sha256()
    for rel, digest in entries:
        h.update(rel.encode("utf-8"))
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
