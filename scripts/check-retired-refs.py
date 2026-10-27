#!/usr/bin/env python3
"""check-retired-refs.py — FAIL when a LIVE file still names something we removed.

WHY THIS EXISTS
  A removed feature does not remove its documentation. The docs, prompts, comments and probes
  that described it stay behind and keep reading as true. That is not a tidiness problem — it is
  how an agent gets told to use something that is not there.

  Measured twice, both times costing real work:
    * `prompt_assembler.build_prompt()` had NO caller for two weeks (2026-10-13 → 2026-10-27)
      while the module still read like the system prompt and eight dead prompt files shipped in
      every installer.
    * `paracore-pro` was deleted on 2026-10-09, and paths to it kept being followed afterwards.

  Neither was caught by any gate, because no gate asked "does this thing still exist?".

THE THREE REGISTERS — this is the whole idea
  The ecosystem kept confusing itself because one document held three different kinds of
  statement with no way to tell them apart. They are now separated and this gate knows which is
  which:

    CURRENT     must be true now. A retired symbol here is a FAILURE.
    HISTORICAL  was true at a date. Exempt — but it must SAY SO, on line 1-12 of the file:
                  > **STATUS: HISTORICAL** — as of 2026-09-25; not current.
                (or SUPERSEDED / ARCHIVED). An unmarked plan is indistinguishable from a live spec,
                which is exactly how `prompt_assembler` looked authoritative for two weeks.
    RETIRED     does not exist. Lives in `RETIRED.md` only, and nowhere else.

WHAT IT ASSERTS
  1. Every row in RETIRED.md has at least one backticked symbol, and every row is machine-checkable.
  2. No CURRENT tracked file mentions a retired symbol.
  3. The scan actually saw something.

⚠⚠ A GATE WITH NO SUBJECT MUST NOT REPORT GREEN. Missing register, unparseable rows, zero files
  scanned — all exit 2. "I could not look" and "I looked and it is clean" are different answers.

⚠ ONLY TRACKED FILES ARE SCANNED. Untracked work in progress is not the repo's truth yet.

⚠ PATHS ARE REPO-QUALIFIED (`paracore-gen/README.md`, not `README.md`). Bare repo-relative paths
  collide across eight repos, and a `startswith()` match on a repo name is worse: `paracore` is a
  prefix of `paracore-business`. Both were this script's own first bugs.

USAGE
  python scripts/check-retired-refs.py
  python scripts/check-retired-refs.py --verbose          # also list allowed / historical hits
  python scripts/check-retired-refs.py --symbol R2        # one row, while writing it
  python scripts/check-retired-refs.py --unmarked         # list docs that declare no status

EXIT
  0 = clean.  1 = violations.  2 = the gate could not look.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

OK = "  ok      "
BAD = "  FAIL    "
WARN = "  warn    "

REGISTER = Path(".workbuddy-ai") / "memory" / "RETIRED.md"

TEXT_SUFFIXES = {
    ".md", ".py", ".cs", ".ps1", ".psm1", ".cmd", ".bat", ".sh",
    ".json", ".proto", ".ts", ".tsx", ".js", ".jsx", ".html", ".css",
    ".csproj", ".sln", ".spec", ".yaml", ".yml", ".txt", ".xaml", ".props", ".targets",
    ".psd1", ".ini", ".cfg", ".toml",
}

MAX_BYTES = 4 * 1024 * 1024

# A HISTORICAL marker must be near the top to count — a stray mention at line 900 is not a
# declaration, and a file that only says so at the end is still read as current.
#
# ⚠⚠ THIS ACCEPTS THE ECOSYSTEM'S EXISTING CONVENTION, NOT A NEW ONE. Files already carry
#   `> ⚠ **HISTORICAL — 2026-10-09.**` and `> ⚠⚠ **SUPERSEDED IN PART — 2026-10-09.**`.
#   The first version of this gate demanded `STATUS: HISTORICAL` and therefore reported both
#   of those as unmarked — a gate that fails on documents that are already correct teaches the
#   reader to ignore it. So: the word must appear in a blockquote or in bold, within the window.
STATUS_WORDS = re.compile(r"\b(HISTORICAL|SUPERSEDED|ARCHIVED|OBSOLETE)\b", re.IGNORECASE)
STATUS_WINDOW = 12


# ── parsing ──────────────────────────────────────────────────────────────────

ROW_RE = re.compile(r"^\|\s*(R\d+)\s*\|")
BACKTICK_RE = re.compile(r"`([^`]+)`")


def parse_register(path: Path) -> tuple[list[dict], list[str], list[str]]:
    problems: list[str] = []
    if not path.is_file():
        return [], [], [f"register not found: {path}"]

    with path.open("r", encoding="utf-8", newline="") as fh:
        lines = fh.read().splitlines()

    rows: list[dict] = []
    for line in lines:
        if not ROW_RE.match(line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7:
            problems.append(f"row has {len(cells)} cells, expected 7: {line[:80]}…")
            continue
        rid = cells[0]
        symbols = [s.strip() for s in BACKTICK_RE.findall(cells[1]) if s.strip()]
        if not symbols:
            problems.append(f"{rid}: no backticked symbol in the symbol column")
            continue
        allowed = [a.strip().strip("`") for a in cells[6].split(",") if a.strip()]
        rows.append({"id": rid, "symbols": symbols, "allowed": allowed})

    globals_: list[str] = []
    in_section = in_fence = False
    for line in lines:
        if line.startswith("## Global allowances"):
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if not in_section:
            continue
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence and line.strip():
            globals_.append(line.strip())

    if not globals_:
        problems.append("no global-allowance block parsed — an unparseable exemption list "
                        "would silently exempt nothing, or everything")

    return rows, globals_, problems


# ── scanning ─────────────────────────────────────────────────────────────────

def tracked_files(root: Path) -> list[Path]:
    try:
        proc = subprocess.run(["git", "-C", str(root), "ls-files", "-z"],
                              capture_output=True, check=False)
    except OSError as exc:
        print(f"{WARN}{root.name}: git unavailable ({exc})")
        return []
    if proc.returncode != 0:
        return []
    out: list[Path] = []
    for raw in proc.stdout.split(b"\0"):
        if not raw:
            continue
        p = root / raw.decode("utf-8", "replace")
        if p.suffix.lower() in TEXT_SUFFIXES:
            out.append(p)
    return out


def declares_history(text: str) -> bool:
    """True when the file declares itself historical near the top.

    Accepts both forms in use: `> ⚠ **HISTORICAL — <date>.**` and
    `> **STATUS: HISTORICAL** — as of <date>; not current.`
    """
    for line in text.splitlines()[:STATUS_WINDOW]:
        if not STATUS_WORDS.search(line):
            continue
        stripped = line.lstrip()
        if stripped.startswith(">") or "**" in line:
            return True
    return False


def fragment_hit(rel: str, fragments: list[str]) -> bool:
    norm = rel.replace("\\", "/")
    return any(f and f in norm for f in fragments)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--symbol", help="check only this row id (e.g. R2)")
    ap.add_argument("--verbose", action="store_true", help="also list exempt hits")
    ap.add_argument("--unmarked", action="store_true",
                    help="list docs under Docs/ that declare no status, then exit")
    ap.add_argument("--all", action="store_true",
                    help="print every violation, not the first 10 per row")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    register = repo / REGISTER
    print(f"register  : {register}")

    rows, globals_, problems = parse_register(register)
    if problems:
        for p in problems:
            print(f"{BAD}{p}")
        print("\nVERDICT: FAIL (the gate could not read its subject)")
        return 2

    if args.symbol:
        rows = [r for r in rows if r["id"] == args.symbol]
        if not rows:
            print(f"{BAD}no row {args.symbol}")
            return 2

    print(f"rows      : {len(rows)}")
    print(f"exempt    : {len(globals_)} global path fragment(s)")
    if not rows:
        print(f"{BAD}the register has no rows — an empty register must not report green")
        print("\nVERDICT: FAIL")
        return 2

    roots = [repo]
    for sib in sorted(repo.parent.iterdir()):
        if sib.is_dir() and (sib / ".git").exists() and sib.resolve() != repo:
            roots.append(sib.resolve())

    files: list[tuple[Path, Path]] = []
    for root in roots:
        files.extend((root, p) for p in tracked_files(root))
    print(f"scanned   : {len(files):,} tracked text file(s) across {len(roots)} repo(s)")

    if not files:
        print(f"{BAD}no files scanned — the gate did not look, which is not the same as clean")
        print("\nVERDICT: FAIL")
        return 2

    violations: list[tuple[str, str, int, str]] = []
    exempt_hits: list[tuple[str, str, str, str]] = []   # (kind, rid, rel, sym)
    unmarked: list[str] = []

    for rel_root, path in files:
        # ⚠ The root travels WITH the file. Never re-derive it by string prefix: `paracore` is a
        #   prefix of `paracore-business`.
        try:
            sub = str(path.relative_to(rel_root)).replace("\\", "/")
        except ValueError:
            continue
        rel = f"{rel_root.name}/{sub}"

        if fragment_hit(rel, globals_):
            continue
        try:
            if path.stat().st_size > MAX_BYTES:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        historical = declares_history(text)

        if args.unmarked and "/Docs/" in f"/{rel}" and path.suffix.lower() == ".md":
            if not historical:
                unmarked.append(rel)

        for row in rows:
            hit = next((s for s in row["symbols"] if s in text), None)
            if hit is None:
                continue

            if fragment_hit(rel, row["allowed"]):
                exempt_hits.append(("allowed", row["id"], rel, hit))
                continue
            if historical:
                exempt_hits.append(("historical", row["id"], rel, hit))
                continue

            lineno = next((i for i, ln in enumerate(text.splitlines(), 1) if hit in ln), 1)
            violations.append((row["id"], rel, lineno, hit))

    if args.unmarked:
        for rel in sorted(unmarked):
            print(f"  unmarked  {rel}")
        print(f"\n{len(unmarked)} doc(s) under Docs/ declare no status")
        return 0

    print()
    if args.verbose:
        for kind, rid, rel, sym in sorted(exempt_hits):
            print(f"  {kind:<10}{rid}  {rel}  ({sym})")

    if violations:
        by_row: dict[str, list[tuple[str, int, str]]] = {}
        for rid, rel, lineno, sym in violations:
            by_row.setdefault(rid, []).append((rel, lineno, sym))

        for rid in sorted(by_row, key=lambda r: int(r[1:])):
            print(f"{BAD}{rid} — {len(by_row[rid])} live reference(s):")
            cap = None if args.all else 10
            for rel, lineno, sym in sorted(by_row[rid])[:cap]:
                print(f"            {rel}:{lineno}  ({sym})")
            if cap and len(by_row[rid]) > cap:
                print(f"            … and {len(by_row[rid]) - cap} more  "
                      f"(re-run with --all to see every one)")
        print()
        print("  FIX IN ONE OF THREE WAYS — and be honest about which:")
        print("    1. STALE      -> delete or rewrite the text.")
        print("    2. CORRECT    -> add that file to the row's 'Also allowed in' column.")
        print("    3. HISTORY    -> the file describes a past state: add a marker in its first")
        print("                     12 lines:  > **STATUS: HISTORICAL** — as of <date>; not current.")
        print("  ⚠ Do not widen the global allowance block to make this pass.")
        print("\nVERDICT: FAIL")
        return 1

    print(f"{OK}{len(rows)} retired symbol set(s), no live reference outside the allow-lists")
    if args.verbose:
        print(f"{OK}{len(exempt_hits)} exempt reference(s) "
              f"({sum(1 for e in exempt_hits if e[0] == 'historical')} in HISTORICAL files)")
    print("\nVERDICT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
