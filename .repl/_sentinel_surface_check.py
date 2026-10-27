#!/usr/bin/env python3
"""GATE — the sentinel (watchdog) surface is exposed EXACTLY where it is allowed to be.

WHY THIS EXISTS
    `Watchdog` / `WatchdogReport` exist in the engine and are perfectly callable. Whether an
    agent should be TOLD about them is a policy question, and the answer differs by consumer:

      ALLOWED  — the desktop gallery scaffold (`paracore/ai/desktop/**`, which becomes
                 `.github/copilot-instructions.md` + `.github/skills/` in a scaffolded gallery
                 workspace) and `paracore-forge`. Both WRITE gallery scripts, and a gallery
                 script can be a sentinel. They must know how to write one, and must know that
                 DEPLOYING it is the operator's job in the desktop app.

      FORBIDDEN — the VS Code extension tree, and every copy of the engine's extension-method
                 index. Those are served to `paracore-model` / `paracore-family` / `paracore-gen`,
                 which write REPL code, and to the VS Code editor flow, which has no gallery and
                 no deploy. A callable `Watchdog(...)` sitting in a pre-imported `ScriptApi`, in
                 front of an agent that cannot use it, is an invitation to arm a background
                 process in someone's Revit.

    So the rule is TWO-SIDED, and both sides have failed before: the names were in every
    generated reference (an agent could see them), and then they were removed from everywhere
    including the two places that legitimately need them. A gate that only checks one side
    would let the other half regress silently.

WHAT IT CHECKS
    1. FORBIDDEN files (the generated index copies + the VS Code tree) contain no sentinel name.
    2. ALLOWED carriers exist and carry the load-bearing contract: both calls, the
       `__sentinel_action__` protocol, "undeploy", and the deploy-time snapshot.
    3. The two carriers — the desktop skill and Forge's `sentinels` skill — AGREE on that
       contract. They are two hand-written documents describing one API, which is the exact
       shape that drifts (a rule in N places must be changed in N places), so the markers are
       compared rather than trusted.
    4. Forge's `sentinels` skill is REGISTERED in `FORGE_SKILLS`. An unregistered skill is
       unreachable: the catalogue is the only channel a client reads.

⚠ AN EMPTY SCAN MUST FAIL. A missing tree or a missing file is an error, never a pass.

Usage:  python _sentinel_surface_check.py     (exit 0 = the surface is where it belongs)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
REPO = HERE.parent.parent                     # .../paracore
ROOT = REPO.parent                            # .../Paracore  (holds every sibling repo)

# ── the files that must NEVER name a sentinel ────────────────────────────────────────────────
# The engine index and every copy of it. ⚠ Listed by path, not discovered by glob: a glob over
# `**/EXTENSION_METHODS.md` would one day pick up a file this policy does not cover and report a
# failure that is not real — or miss one that is.
FORBIDDEN_FILES = [
    REPO / "EXTENSION_METHODS.md",
    REPO / "ai" / "shared" / "skills" / "paracore-engine" / "references" / "EXTENSION_METHODS.md",
    REPO / "rap-server" / "server" / "api" / "ai_workspace" / "skills" / "paracore-engine"
    / "references" / "EXTENSION_METHODS.md",
    REPO / "corescript-vscode" / "ai" / "skills" / "paracore-engine" / "references"
    / "EXTENSION_METHODS.md",
    ROOT / "paracore-gen" / "EXTENSION_METHODS.md",
    ROOT / "paracore-model" / "EXTENSION_METHODS.md",
    ROOT / "paracore-family" / "EXTENSION_METHODS.md",
    ROOT / "paracore-forge" / "forge_core" / "reference" / "EXTENSION_METHODS.md",
]

# Trees where a sentinel name anywhere is a leak.
FORBIDDEN_TREES = [
    REPO / "ai" / "vscode",
    REPO / "corescript-vscode" / "ai",
]

# ── the files that MUST carry the contract ───────────────────────────────────────────────────
# (path, what it is) — the authority and the copy generated from it.
REQUIRED_FILES = [
    (REPO / "ai" / "desktop" / "skills" / "paracore-sentinel" / "SKILL.md",
     "the desktop scaffold skill (authority)"),
    (REPO / "rap-server" / "server" / "api" / "ai_workspace" / "skills" / "paracore-sentinel"
     / "SKILL.md",
     "the desktop scaffold skill (generated copy)"),
    (ROOT / "paracore-forge" / "skills" / "sentinels" / "SKILL.md",
     "Forge's sentinels skill"),
]

# The router in the always-loaded desktop instructions must name the skill, or the skill is
# discoverable only by listing the folder — which an agent does not do.
DESKTOP_ROUTER = REPO / "ai" / "desktop" / "copilot-instructions.md"

# ── the contract both carriers must state ────────────────────────────────────────────────────
# Literal markers, deliberately not semantic: a phrase is either there or it is not.
CONTRACT = [
    ("Watchdog call", ["Watchdog("]),
    ("WatchdogReport call", ["WatchdogReport("]),
    ("both calls are required", ["BOTH"]),
    ("action protocol", ["__sentinel_action__"]),
    ("select action", ['"select"']),
    ("isolate action", ['"isolate"']),
    ("table action", ['"table"']),
    ("deploy is manual", ["undeploy"]),
    ("params snapshotted at deploy", ["snapshot"]),
    # ⚠ The worked example is a RULE, not decoration: `[Unit("mm")]` arrives in internal feet and
    #   so does `GetNum(name)`, so comparing `GetNum("Length", "mm")` against the property is a
    #   silent factor-of-304.8 bug. Pinned in both copies because two hand-written examples drift.
    ("example compares in internal units", ['GetNum("Length") < p.MinLength']),
    ("the [Unit] trap is stated", ["ARRIVES in internal feet"]),
]

# Any of these in a FORBIDDEN surface is a failure.
SENTINEL_NAMES = ["Watchdog", "WatchdogReport", "__sentinel_action__"]


def blob(path: Path) -> str:
    """One whitespace-normalised blob, so a marker never breaks on a line wrap."""
    return " ".join(path.read_text(encoding="utf-8", errors="replace").split())


def tree_blob(root: Path) -> str:
    if not root.is_dir():
        return ""
    parts = [
        p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(root.rglob("*"))
        if p.is_file()
    ]
    return " ".join(" ".join(parts).split())


def main() -> int:
    failures: list[str] = []
    checks = 0

    # 1 — forbidden files
    for path in FORBIDDEN_FILES:
        checks += 1
        if not path.exists():
            failures.append(f"FORBIDDEN file is missing (cannot prove it is clean): {path}")
            continue
        text = blob(path)
        hits = [n for n in SENTINEL_NAMES if n in text]
        if hits:
            failures.append(f"FORBIDDEN: {path.relative_to(ROOT).as_posix()} names {hits}")

    # 1b — forbidden trees
    for root in FORBIDDEN_TREES:
        checks += 1
        text = tree_blob(root)
        if not text:
            failures.append(f"FORBIDDEN tree is missing or empty: {root}")
            continue
        hits = [n for n in SENTINEL_NAMES if n in text]
        if hits:
            failures.append(f"FORBIDDEN tree: {root.relative_to(ROOT).as_posix()} names {hits}")

    # 2 — required carriers state the whole contract
    carriers: dict[str, str] = {}
    for path, what in REQUIRED_FILES:
        checks += 1
        if not path.exists():
            failures.append(f"MISSING {what}: {path}")
            continue
        text = blob(path)
        carriers[what] = text
        absent = [label for label, needles in CONTRACT if not all(n in text for n in needles)]
        if absent:
            failures.append(f"INCOMPLETE {what} ({path.name}): missing {absent}")

    # 3 — the two hand-written carriers must agree on the contract
    checks += 1
    if len(carriers) >= 2:
        desktop = carriers.get("the desktop scaffold skill (authority)", "")
        forge = carriers.get("Forge's sentinels skill", "")
        if desktop and forge:
            for label, needles in CONTRACT:
                d = all(n in desktop for n in needles)
                f = all(n in forge for n in needles)
                if d != f:
                    failures.append(
                        f"DRIFT: '{label}' is in {'the desktop skill' if d else 'the Forge skill'} "
                        f"but not in {'the Forge skill' if d else 'the desktop skill'}"
                    )

    # 2b — the desktop router names the skill
    checks += 1
    if not DESKTOP_ROUTER.exists():
        failures.append(f"MISSING desktop router: {DESKTOP_ROUTER}")
    elif "paracore-sentinel" not in blob(DESKTOP_ROUTER):
        failures.append("DESKTOP router does not name `paracore-sentinel` — the skill is unreachable")

    # 4 — Forge's skill is in the catalogue
    checks += 1
    forge_server = ROOT / "paracore-forge" / "forge_server.py"
    if not forge_server.exists():
        failures.append(f"MISSING {forge_server}")
    elif 'name="sentinels"' not in blob(forge_server):
        failures.append('Forge does not register a `sentinels` skill in FORGE_SKILLS')

    print(f"checks run: {checks}")
    print(f"forbidden files: {len(FORBIDDEN_FILES)}   forbidden trees: {len(FORBIDDEN_TREES)}"
          f"   required carriers: {len(REQUIRED_FILES)}")
    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  x {f}")
        return 1
    print("\nVERDICT: sentinels are taught where they are writable, and invisible everywhere else")
    return 0


if __name__ == "__main__":
    sys.exit(main())
