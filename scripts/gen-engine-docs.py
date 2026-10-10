"""Generate the repo copies of the shared engine docs + the shared REPL skill set.

WHY THIS EXISTS
    EXTENSION_METHODS.md and REPL_GUIDE.md each existed in SIX places, hand-maintained.
    They had already drifted 76 lines apart, and the drift was not cosmetic: one copy was
    missing 13 improvements that existed only in the other. A rename
    (.BarChart() -> .BarGraph()) therefore had to be made by hand in every copy.

    So: ONE authority (`paracore-gen/EXTENSION_METHODS.md` + `REPL_GUIDE.md`) and the other
    copies are GENERATED from it. Generated output cannot drift.

⚠⚠ 2026-10-10 — EVERY ENGINE-DRIVING MCP IS A TARGET, AND THE REPL SKILL SET IS SHARED.
    Two gaps closed (the authority and the copies were in sync, so nothing LOOKED wrong —
    the target list simply did not cover the specialist MCPs, so they would drift silently
    the first time the authority changed):

      * `paracore-model` and `paracore-family` were NOT targets. They bundle the same two
        engine docs, so they are now generated like every other copy.
      * The REPL / dynamic-execution SKILL SET (the nine method skills: query-filter,
        aggregate-group, parameter-access, write-modify, display-visualize, discovery-debug,
        create-geometry, identity-orientation, materials-units) is the SAME in every MCP —
        it teaches the GENERIC engine's methods, so there is nothing to specialise. It is now
        generated from the one authority in `paracore-gen` into every engine-driving MCP.
        A specialist keeps its own DOMAIN skills (project-modeling, family-authoring, ...)
        ALONGSIDE this set; the shared set is never hand-edited per repo.
        ⚠ Because it is generated, a shared skill must be context-neutral. Routing that is
        true in only ONE repo belongs in that repo's server instructions, not in the skill.

⚠⚠ 2026-10-09 — SINGLE VARIANT, ENGINE-ONLY. The free/Pro split is GONE.
    This tool used to emit TWO variants: the authority was a "Pro superset" carrying
    `<!-- #PRO-ONLY-BEGIN/END -->` regions, stripped for a "free variant", alongside a
    verbatim copy for `paracore-pro/Docs/`. `paracore-pro` was DELETED (user ruling), and the
    engine doc was split by OWNER, not by tier:

      * engine methods             -> `paracore-gen/EXTENSION_METHODS.md`  (this tool's authority)
      * a pack's own methods       -> that repo's own doc (see PACK_APPENDIX below)

    So there are NO `#PRO-ONLY` markers left anywhere, and this tool no longer strips or
    renumbers: every target below is a VERBATIM copy of its authority (plus, for a
    pack-bearing repo, that repo's own appendix).

THE PACK RULE
    The generic engine declares the methods EVERY client gets. A specialist repo may add its
    OWN extension methods through a `pack/` — `paracore-takeoff` is the only one today
    (`pack/TakeOffScriptApi.cs`). So the extension-method reference a client serves is
    "generic engine methods + this repo's pack methods" — see PACK_APPENDIX.

USAGE
    python gen-engine-docs.py --check    # report drift only; exit 1 if anything is stale
    python gen-engine-docs.py --write    # regenerate the copies
"""

import argparse
import importlib.util
import sys
from pathlib import Path

MCP = Path(r"C:\Users\seyou\Paracore\paracore-gen")
FREE = Path(r"C:\Users\seyou\Paracore\paracore")
FORGE = Path(r"C:\Users\seyou\Paracore\paracore-forge")
MODEL = Path(r"C:\Users\seyou\Paracore\paracore-model")
FAMILY = Path(r"C:\Users\seyou\Paracore\paracore-family")

# The REPL / dynamic-execution skill set. ONE authority (paracore-gen), the same in every MCP
# that drives the generic engine — it documents the GENERIC engine's methods, so there is
# nothing to specialise. A specialist's own DOMAIN skills sit alongside it and are NOT listed
# here (they are not shared).
# ⚠ Derived from the authority module, never listed twice: the set of skill FILES propagated
# and the set of registry ENTRIES a server declares must be the same set, or a skill ships
# without being served.
_SHARED_SPEC = importlib.util.spec_from_file_location(
    "_shared_skills", MCP / "mcp_core" / "shared_skills.py"
)
_SHARED_MOD = importlib.util.module_from_spec(_SHARED_SPEC)
_SHARED_SPEC.loader.exec_module(_SHARED_MOD)
SHARED_SKILLS = list(_SHARED_MOD.SHARED_SKILL_DESCRIPTIONS)

# (authority filename, destination). ⚠ Every destination is GENERATED — a hand edit there is
# silently discarded by the next `--write` (MASTER_SYSTEM_SPEC §3/§5). Edit the authority.
TARGETS = [
    ("EXTENSION_METHODS.md", FREE / "EXTENSION_METHODS.md"),
    ("REPL_GUIDE.md", FREE / "REPL_GUIDE.md"),
    # ⚠ paracore-forge gets the engine doc so a Forge-written tool knows the real API instead of
    # reaching for raw Revit calls (FilteredElementCollector / get_Parameter / LookupParameter).
    # Bundled into the exe and served as `forge://extension-methods`.
    # ⚠ REPL_GUIDE.md is deliberately NOT sent to Forge — Forge does not write REPL snippets.
    ("EXTENSION_METHODS.md", FORGE / "forge_core" / "reference" / "EXTENSION_METHODS.md"),
    # The scaffolded-workspace tree (`paracore/ai/`) serves the same doc as the engine skill's
    # on-demand reference. ⚠ It is a GENERATED copy like the others — edit the authority.
    # `scripts/gen-ai-workspace.py` then mirrors this whole tree into corescript-vscode.
    ("EXTENSION_METHODS.md",
     FREE / "ai" / "shared" / "skills" / "paracore-engine" / "references" / "EXTENSION_METHODS.md"),
]

# ⚠ Every engine-driving MCP bundles the same two engine docs AND the same REPL skill set.
# Without this, a specialist's copies are unmanaged and drift the first time the authority moves.
for _repo in (MODEL, FAMILY):
    TARGETS.append(("EXTENSION_METHODS.md", _repo / "EXTENSION_METHODS.md"))
    TARGETS.append(("REPL_GUIDE.md", _repo / "REPL_GUIDE.md"))
    # ⚠ The registry MODULE too, not just the skill files: a skill whose FILE ships but whose
    # name is missing from the server's `_SKILL_DESCRIPTIONS` is never served — it is not
    # cached and no `skill://` resource is registered. Generating both keeps them from
    # diverging, and generating the module is what stops the shared set being hand-maintained.
    TARGETS.append(("mcp_core/shared_skills.py", _repo / "mcp_core" / "shared_skills.py"))
    for _skill in SHARED_SKILLS:
        TARGETS.append((
            f"mcp_core/skills/{_skill}/SKILL.md",
            _repo / "mcp_core" / "skills" / _skill / "SKILL.md",
        ))

# A repo may own EXTRA extension methods — its "pack". Those are declared IN the repo and are
# APPENDED to the generic engine doc, so the reference a client serves is
# "generic engine methods + this repo's pack methods".
# ⚠ EMPTY today: `paracore-takeoff` is the only repo with a `pack/`, and takeoff is a
# DETERMINISTIC tool server — it does not serve EXTENSION_METHODS.md at all (its reference is
# its own Docs/TAKEOFF_REFERENCE.md). Add an entry here when a pack-bearing repo starts serving
# the engine doc, e.g. { MODEL / "EXTENSION_METHODS.md": MODEL / "Docs" / "PACK_METHODS.md" }.
PACK_APPENDIX: dict[Path, Path] = {}


def build(relname: str, dest: Path | None = None) -> str:
    """The intended content of one destination: the authority, plus its pack appendix if any."""
    src = MCP / relname
    if not src.exists():
        raise FileNotFoundError(f"authority missing: {src}")
    text = src.read_text(encoding="utf-8")
    appendix = PACK_APPENDIX.get(dest) if dest is not None else None
    if appendix is not None and appendix.exists():
        text = text.rstrip() + "\n\n" + appendix.read_text(encoding="utf-8").lstrip()
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    ap.add_argument("--write", action="store_true", help="regenerate outputs")
    args = ap.parse_args()
    if not (args.check or args.write):
        ap.error("pass --check or --write")

    stale, written, missing = [], [], []
    for relname, dest in TARGETS:
        try:
            want = build(relname, dest)
        except FileNotFoundError as e:
            print(f"  ERROR   {relname}: {e}")
            return 2
        have = dest.read_text(encoding="utf-8") if dest.exists() else None
        # compare modulo line endings: git normalizes to LF in both repos
        same = have is not None and have.replace("\r\n", "\n") == want.replace("\r\n", "\n")
        if same:
            print(f"  ok      {dest.relative_to(dest.parents[1])}")
            continue
        if have is None:
            missing.append(dest)
            print(f"  MISSING {dest}")
        else:
            stale.append(dest)
            print(f"  STALE   {dest}")
        if args.write:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(want, encoding="utf-8", newline="\n")
            written.append(dest)

    print()
    if args.write:
        print(f"wrote {len(written)} file(s); {len(stale) + len(missing)} were out of date")
        return 0
    if stale or missing:
        print(f"DRIFT: {len(stale)} stale, {len(missing)} missing — run --write")
        return 1
    print(f"generated docs are up to date ({len(TARGETS)} targets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
