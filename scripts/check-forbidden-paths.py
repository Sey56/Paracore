#!/usr/bin/env python3
"""
THE ABSENCE GATE — what must NOT sit inside `paracore/`, and what may.

⚠⚠ WHY THIS EXISTS. `training/` is an external project with its own repo. It gets cloned in here by
mistake, and it is **ignored** by `.gitignore`, so `git status` never mentions it — the only way to
notice is to browse the folder. "Ignored" is not "harmless": `build-frontend.ps1` robocopies this
repo with `/E`, so an ignored folder still ships inside the desktop bundle, and no diff shows it.

⚠⚠ TWO DIFFERENT ASSERTIONS, and conflating them makes the gate wrong in both directions:
  * `training/`, `SH_Tools/` — a separate project. Its PRESENCE is the defect.
  * `rap-auth-server/` — **expected to be here**, as the drop for the PUBLIC key that
    `build-frontend.ps1:157` reads into the desktop release. Its presence is fine; its CONTENTS are
    the assertion, because the sibling repo also holds the PRIVATE signing key and `.env`, and this
    repo is PUBLIC. One copy of `jwt_private.pem` here is a leaked signing key.

⚠ An empty rule set FAILS. A gate whose lists were emptied by an edit would otherwise report green
forever — "nothing to check" is not "clean" (rule 3).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARACORE = os.path.dirname(HERE)

#: folder → why its PRESENCE is the defect. Rooted at `paracore/`, case-insensitive on Windows.
FORBIDDEN = {
    "training": "an external project with its own repo — clone it outside the workspace",
    "SH_Tools": "an external project with its own repo — clone it outside the workspace",
}

#: folder → the ONLY contents it may hold. A nested `.git` is always a defect: a second clone of a
#: private repo inside a public one, carrying whatever that repo carries.
ALLOWED_CONTENTS = {
    "rap-auth-server": {
        "server/jwt_public.pem",
    },
}

#: Proof that the scan looked at the real repo and not an empty or wrong directory.
MARKERS = ("CoreScript.Engine", "Paracore.Addin", "mcp")


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:,.0f} {unit}" if unit == "B" else f"{n:,.1f} {unit}"
        n /= 1024.0
    return f"{n:,.1f} GB"


def walk_files(path: str) -> tuple[int, int, set[str]]:
    """(bytes, file count, posix-relative paths). Never follows a symlink out of the tree."""
    total = files = 0
    rel: set[str] = set()
    for root, _dirs, names in os.walk(path):
        for name in names:
            full = os.path.join(root, name)
            try:
                total += os.path.getsize(full)
                files += 1
            except OSError:
                pass
            rel.add(os.path.relpath(full, path).replace("\\", "/"))
    return total, files, rel


def main() -> int:
    print(f"repo root : {PARACORE}")

    if not os.path.isdir(PARACORE):
        print("FAIL: the repo root does not exist — the gate cannot look, and cannot pass.")
        return 2

    if not FORBIDDEN and not ALLOWED_CONTENTS:
        print("FAIL: both rule sets are EMPTY — a gate with nothing to check is not a gate.")
        return 2

    missing_markers = [m for m in MARKERS if not os.path.exists(os.path.join(PARACORE, m))]
    if missing_markers:
        print(f"FAIL: not the repo root — these are absent: {', '.join(missing_markers)}")
        return 2

    entries = {name.lower(): name for name in os.listdir(PARACORE)}
    print(f"checked   : {len(FORBIDDEN)} forbidden + {len(ALLOWED_CONTENTS)} bounded "
          f"against {len(entries)} root entr(y/ies)")

    failures: list[str] = []

    for wanted, why in FORBIDDEN.items():
        actual = entries.get(wanted.lower())
        if actual is None:
            print(f"  ok      {wanted}/ is absent")
            continue
        if not os.path.isdir(os.path.join(PARACORE, actual)):
            print(f"  ok      {actual} is a file, not a folder")
            continue
        size, files, _ = walk_files(os.path.join(PARACORE, actual))
        print(f"  ✗       {actual}/ is PRESENT ({human(size)}, {files:,} files)")
        failures.append(f"{actual}/ must not be here — {why}")

    for wanted, allowed in ALLOWED_CONTENTS.items():
        actual = entries.get(wanted.lower())
        if actual is None:
            print(f"  ok      {wanted}/ is absent (the build then fails loudly, which is correct)")
            continue
        base = os.path.join(PARACORE, actual)
        if not os.path.isdir(base):
            print(f"  ✗       {actual} is a FILE, expected a folder")
            failures.append(f"{actual} must be a folder holding {sorted(allowed)}")
            continue
        size, files, rel = walk_files(base)
        extra = sorted(rel - allowed)
        absent = sorted(allowed - rel)
        print(f"          {actual}/ holds {files:,} file(s), {human(size)}")
        for name in sorted(allowed & rel):
            print(f"  ok      {actual}/{name}")
        for name in extra:
            print(f"  ✗       {actual}/{name} — NOT allowed here")
        for name in absent:
            print(f"  ✗       {actual}/{name} — MISSING (the desktop build reads it)")
        if extra:
            failures.append(
                f"{actual}/ holds {len(extra)} file(s) it must not — "
                f"{', '.join(extra)}. ⚠ The sibling repo also holds jwt_private.pem and .env; "
                f"this repo is PUBLIC, so one copy of either is a leaked secret"
            )
        if absent:
            failures.append(
                f"{actual}/ is missing {', '.join(absent)} — build-frontend.ps1:157 reads it into "
                f"the desktop release"
            )

    if failures:
        print()
        print(f"FAIL: {len(failures)} problem(s):")
        for line in failures:
            print(f"  + {line}")
        print()
        print("  ⚠ These folders are ignored by `.gitignore`, so `git status` will NEVER mention")
        print("    them — that is exactly why this gate exists. Before removing one, check it holds")
        print("    no uncommitted work: `git -C <the nested repo> status`.")
        return 1

    print()
    print("No external project is nested in the repo, and the key drop holds only the public key.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
