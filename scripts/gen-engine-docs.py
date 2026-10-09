"""Generate the repo copies of the shared engine docs from the authority in paracore-gen.

WHY THIS EXISTS
    EXTENSION_METHODS.md and REPL_GUIDE.md each existed in SIX places, hand-maintained.
    They had already drifted 76 lines apart, and the drift was not cosmetic: one copy was
    missing 13 improvements that existed only in the other. A rename
    (.BarChart() -> .BarGraph()) therefore had to be made by hand in every copy.

    So: ONE authority (`paracore-gen/EXTENSION_METHODS.md` + `REPL_GUIDE.md`) and the other
    copies are GENERATED from it. Generated output cannot drift.

⚠⚠ 2026-10-09 — SINGLE VARIANT, ENGINE-ONLY. The free/Pro split is GONE.
    This tool used to emit TWO variants: the authority was a "Pro superset" carrying
    `<!-- #PRO-ONLY-BEGIN/END -->` regions, stripped for a "free variant", alongside a
    verbatim copy for `paracore-pro/Docs/`. `paracore-pro` was DELETED (user ruling), and the
    engine doc was split by OWNER, not by tier:

      * engine methods             -> `paracore-gen/EXTENSION_METHODS.md`  (this tool's authority)
      * the takeoff PACK's methods -> `paracore-takeoff/Docs/TAKEOFF_REFERENCE.md`  (hand-written)

    So there are NO `#PRO-ONLY` markers left anywhere, and this tool no longer strips or
    renumbers: every target below is a VERBATIM copy of its authority. (Removing the old
    `paracore-pro` target was not cosmetic — `main()` calls `dest.parent.mkdir(...)`, so a
    `--write` would have RE-CREATED the deleted directory.)

USAGE
    python gen-engine-docs.py --check    # report drift only; exit 1 if anything is stale
    python gen-engine-docs.py --write    # regenerate the copies
"""

import argparse
import sys
from pathlib import Path

MCP = Path(r"C:\Users\seyou\Paracore\paracore-gen")
FREE = Path(r"C:\Users\seyou\Paracore\paracore")
FORGE = Path(r"C:\Users\seyou\Paracore\paracore-forge")

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


def build(relname: str) -> str:
    """Read one authority document. Every target is a verbatim copy of it."""
    src = MCP / relname
    if not src.exists():
        raise FileNotFoundError(f"authority missing: {src}")
    return src.read_text(encoding="utf-8")


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
            want = build(relname)
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
    print("generated docs are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
