#!/usr/bin/env python3
"""
THE ABSENCE GATE — folders that must NEVER sit inside `paracore/`.

⚠⚠ WHY THIS EXISTS. These are all separate projects with their own repos. They get cloned in here
by mistake, and they are **ignored** by `.gitignore`, so `git status` never mentions them — the only
way to notice is to browse the folder.

⚠ "Ignored" is not "harmless", but say WHERE it bites, because the difference decides what a stray
can damage. `build-frontend.ps1` never copies the repo root — the Tauri bundle ships one directory,
`rap-web/src-tauri/server-release`. Three robocopies fill it, with `/E` and no exclusion for any of
these names: `rap-server/server/` -> `server-release/server`, `mcp/` -> `server-release/paracore/mcp`,
and the venv's site-packages. So a stray INSIDE either of the first two ships in the desktop bundle
with no diff to show it; a stray at the ROOT ships nothing and only corrupts the working tree.

⚠⚠ `rap-auth-server/` is the one that has already cost something. A stale copy of the PUBLIC key sat
there from a key rotation, `rap-server/server/config.py` found it before the current one, and dev
offline auth verified tokens against a key nothing signs with any more. The build itself read the
SIBLING repo, so the shipped app was fine and the defect was invisible in exactly the place nobody
looks. The key now lives, tracked, at `rap-server/server/keys/jwt_public.pem` — `check-jwt-key.py`
owns its contents, this gate owns the folder.

⚠ An empty FORBIDDEN list FAILS. A gate whose list was emptied by an edit would otherwise report
green forever — "nothing to check" is not "clean" (rule 3).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARACORE = os.path.dirname(HERE)

#: folder name -> why its PRESENCE is the defect. Rooted at `paracore/`, case-insensitive on Windows.
FORBIDDEN = {
    "training": "an external project with its own repo - clone it outside the workspace",
    "SH_Tools": "an external project with its own repo - clone it outside the workspace",
    "rap-auth-server": (
        "its own PRIVATE repo (Sey56/rap-auth-server). A copy here is a second home for the JWT "
        "keys - the build reads the SIBLING repo, and the tracked fallback key is "
        "rap-server/server/keys/jwt_public.pem"
    ),
}

#: Proof that the scan looked at the real repo and not an empty or wrong directory.
MARKERS = ("CoreScript.Engine", "Paracore.Addin", "mcp")


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:,.0f} {unit}" if unit == "B" else f"{n:,.1f} {unit}"
        n /= 1024.0
    return f"{n:,.1f} GB"


def walk(path: str) -> tuple[int, int]:
    """(bytes, files). Never follows a symlink out of the tree."""
    total = files = 0
    for root, _dirs, names in os.walk(path):
        for name in names:
            try:
                total += os.path.getsize(os.path.join(root, name))
                files += 1
            except OSError:
                pass
    return total, files


def main() -> int:
    print(f"repo root : {PARACORE}")

    if not os.path.isdir(PARACORE):
        print("FAIL: the repo root does not exist - the gate cannot look, and cannot pass.")
        return 2

    if not FORBIDDEN:
        print("FAIL: the FORBIDDEN list is EMPTY - a gate with nothing to check is not a gate.")
        return 2

    missing_markers = [m for m in MARKERS if not os.path.exists(os.path.join(PARACORE, m))]
    if missing_markers:
        print(f"FAIL: not the repo root - these are absent: {', '.join(missing_markers)}")
        return 2

    entries = {name.lower(): name for name in os.listdir(PARACORE)}
    print(f"checked   : {len(FORBIDDEN)} forbidden name(s) against {len(entries)} root entr(y/ies)")

    hits = []
    for wanted, why in FORBIDDEN.items():
        actual = entries.get(wanted.lower())
        if actual is None:
            print(f"  ok      {wanted}/ is absent")
            continue
        path = os.path.join(PARACORE, actual)
        if not os.path.isdir(path):
            print(f"  ok      {actual} is a file, not a folder")
            continue
        size, files = walk(path)
        print(f"  X       {actual}/ is PRESENT ({human(size)}, {files:,} files)")
        hits.append((actual, size, files, why))

    if not hits:
        print()
        print("No external project is nested inside the repo.")
        return 0

    print()
    print(f"FAIL: {len(hits)} folder(s) must not be inside `paracore/`:")
    for name, size, files, why in hits:
        print(f"  + {name}/  ({human(size)}, {files:,} files)")
        print(f"      {why}")
    print()
    print("  These folders are IGNORED by `.gitignore`, so `git status` will NEVER mention them.")
    print("  Before removing one, prove it holds no uncommitted work:")
    print()
    for name, _size, _files, _why in hits:
        print(f"    git -C {os.path.join(PARACORE, name)!r} status")
    print()
    print("  A nested clone of a PRIVATE repo can carry secrets (jwt_private.pem, .env). Ignored means")
    print("  it will not be committed by accident - not that it cannot be force-added. Check, then")
    print("  delete the whole folder.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
