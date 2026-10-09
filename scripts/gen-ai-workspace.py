"""Compose the per-target AI-instruction file sets from the authority tree in `paracore/ai/`.

WHY THIS EXISTS
    A scaffolded Paracore workspace gets its AI instructions from a FILE SET, not one file:

        .github/copilot-instructions.md        always loaded   (the router)
        .github/instructions/*.instructions.md auto-applied    (path-scoped, via `applyTo`)
        .github/skills/<name>/SKILL.md         on activation   (progressive disclosure)
        .github/skills/<name>/references/*.md  on demand       (the full API reference)

    Two products consume it and they differ in exactly two ways:

      * the WORKSPACE LAYOUT — a gallery tool project (`Scripts/<Name>.cs`, optional `Params`
        class) versus a VS Code workspace (`Scripts/Main.cs`, no `Params`);
      * the SKILLS PRESENT   — only the gallery flow has a `Params` UI, so only it gets
        `paracore-tool`.

    So the authority is ONE tree, split by SCOPE rather than by target:

        paracore/ai/shared/**    → emitted into BOTH
        paracore/ai/desktop/**   → emitted only into the desktop scaffold
        paracore/ai/vscode/**    → emitted only into the VS Code scaffold

    Nothing is stripped, renumbered or rewritten on the way out: every emitted file is a
    VERBATIM copy of its authority. (The project retired a markdown stripper once already —
    a composed tree with no text surgery is the point.)

USAGE
    python gen-ai-workspace.py --check    # report drift only; exit 1 if anything is stale
    python gen-ai-workspace.py --write    # regenerate the copies

⚠ STALE FILES ARE REPORTED, NEVER DELETED. If a file is removed from the authority, the copy
left on disk is listed as ORPHAN and the run stays non-zero so it is not forgotten. Deleting is
left to a human: a generated directory is not worth an unrecoverable mistake.
"""

import argparse
import sys
from pathlib import Path

FREE = Path(r"C:\Users\seyou\Paracore\paracore")
VSCODE = FREE / "corescript-vscode"
RAPSERVER = FREE / "rap-server"

SHARED = FREE / "ai" / "shared"

# (variant directory, destination root). Every file under SHARED and the variant directory is
# copied to the SAME relative path under the destination.
#
# ⚠ The desktop destination lives INSIDE the Python package (`server/api/ai_workspace/`) so any
# packager that collects the `server` package picks it up automatically. `ai_instructions.py`
# reads it from there and nowhere else, so dev and production take the identical code path.
TARGETS = [
    ("desktop", FREE / "ai" / "desktop", RAPSERVER / "server" / "api" / "ai_workspace"),
    ("vscode", FREE / "ai" / "vscode", VSCODE / "ai"),
]


def collect(variant_dir: Path) -> dict[str, Path]:
    """{relative posix path: source file} for SHARED plus this variant. Shared wins on a clash."""
    files: dict[str, Path] = {}
    for root in (SHARED, variant_dir):
        if not root.is_dir():
            continue
        for src in sorted(root.rglob("*")):
            if src.is_file():
                files.setdefault(src.relative_to(root).as_posix(), src)
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    ap.add_argument("--write", action="store_true", help="regenerate outputs")
    args = ap.parse_args()
    if not (args.check or args.write):
        ap.error("pass --check or --write")

    if not SHARED.is_dir():
        print(f"  ERROR   authority tree missing: {SHARED}")
        return 2

    stale, missing, orphans, written = [], [], [], []

    for variant, variant_dir, dest_root in TARGETS:
        print(f"\n{variant}:  {variant_dir}  ->  {dest_root}")
        if not variant_dir.is_dir():
            print(f"  ERROR   variant directory missing: {variant_dir}")
            return 2

        want = collect(variant_dir)

        for rel, src in want.items():
            dest = dest_root / rel
            want_text = src.read_text(encoding="utf-8")
            have_text = dest.read_text(encoding="utf-8") if dest.exists() else None
            # compare modulo line endings, as gen-engine-docs.py does
            same = have_text is not None and have_text.replace("\r\n", "\n") == want_text.replace("\r\n", "\n")
            if same:
                print(f"  ok      {rel}")
                continue
            if have_text is None:
                missing.append(dest)
                print(f"  MISSING {rel}")
            else:
                stale.append(dest)
                print(f"  STALE   {rel}")
            if args.write:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(want_text, encoding="utf-8", newline="\n")
                written.append(dest)

        # files present in the destination but no longer produced by the authority
        if dest_root.is_dir():
            for found in sorted(dest_root.rglob("*")):
                if not found.is_file():
                    continue
                rel = found.relative_to(dest_root).as_posix()
                if rel not in want:
                    orphans.append(found)
                    print(f"  ORPHAN  {rel}   (not in the authority — review by hand)")

    print()
    if args.write:
        print(f"wrote {len(written)} file(s); {len(stale) + len(missing)} were out of date")
    if orphans:
        print(f"⚠ {len(orphans)} orphaned file(s) left in place — nothing was deleted.")
    if args.write:
        return 1 if orphans else 0
    if stale or missing or orphans:
        print(f"DRIFT: {len(stale)} stale, {len(missing)} missing, {len(orphans)} orphaned — run --write")
        return 1
    print("AI workspace tree is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
