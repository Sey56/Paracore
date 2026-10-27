#!/usr/bin/env python3
"""gate.py — ONE command, ONE verdict, for every gate in the ecosystem.

WHY THIS EXISTS
    There are ~30 instruments that each protect something, spread over 6 repos, run
    from 4 different interpreters. Nobody runs them, because remembering the list is
    the whole cost. So a gate that nobody runs is a gate that is not there — and the
    rule it protects quietly stops existing, exactly the way a dropped MEMORY.md tail
    does.

    This file is the list. `python .repl/gate.py` runs everything that can run
    unattended and prints one verdict.

WHAT IT WILL NOT DO
    * It will not SKIP a gate that is missing. A declared auto gate whose file has
      vanished is a FAILURE, because "the gate is gone" and "the gate is green" must
      never look the same.
    * It will not report green when it had nothing to run. An empty gate list exits 2.
    * It will not let an allowance rot. A gate carrying a `known_red` entry that
      PASSES is reported CLEARED and FAILS the run — the allowance must be deleted in
      the same commit as the fix, or it becomes a lie that outlives its reason.

VERDICTS
    PASS      exit 0 from the gate.
    FAIL      exit 1, or a launch error, or a timeout. The thing it protects is wrong.
    BLOCKED   exit 2. The gate could not look (missing interpreter, stale build,
              precondition unmet). Not green, and not the same as broken — but the
              distinction only exists if the gate uses exit 2. Anything else is FAIL.

USAGE
    python .repl/gate.py                 run every auto gate, print one verdict
    python .repl/gate.py --list          what each gate protects, and why some are manual
    python .repl/gate.py --only ID[,ID]  run a subset (still prints a real verdict)
    python .repl/gate.py --strict        treat every known_red allowance as a failure
    python .repl/gate.py --verbose       show each gate's last output line on PASS too
    python .repl/gate.py --prove-teeth   prove THIS runner's verdict logic can fail

EXIT CODES  0 = all green, 1 = something is wrong, 2 = could not look (bad manifest,
            no gates, unresolvable interpreter). 2 is never "fine".
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent          # paracore/.repl
REPO = HERE.parent                              # paracore
MANIFEST = HERE / "gates.json"
LOGS = HERE / "_gate_logs"

# A gate's interpreter is part of its contract: check-mcp-exes.py imports PyInstaller,
# the spikes import mcp_server.py. Naming the venv here keeps absolute paths out of the
# manifest (they rot) and turns a missing venv into a loud BLOCKED instead of a traceback.
VENVS = {
    "gen": "paracore-gen/mcp-build/.venv/Scripts/python.exe",
    "family": "paracore-family/mcp-build/.venv/Scripts/python.exe",
    "model": "paracore-model/mcp-build/.venv/Scripts/python.exe",
    "takeoff": "paracore-takeoff/mcp-build/.venv/Scripts/python.exe",
    "forge": "paracore-forge/.venv/Scripts/python.exe",
}

VERDICT_OF_EXIT = {0: "PASS", 1: "FAIL", 2: "BLOCKED"}
REQUIRED = ("path", "cwd", "python", "runs", "protects")
ALLOWANCE_KEYS = ("id", "why", "remedy", "blocked_by", "owner")


class CannotLook(Exception):
    """The run itself is impossible — bad manifest, no gates, no interpreter."""


def _empty(value) -> bool:
    return not str(value or "").strip()


# ---------------------------------------------------------------------------------------
# manifest
# ---------------------------------------------------------------------------------------

def workspace_root() -> Path:
    env = os.environ.get("PARACORE_WORKSPACE")
    if env:
        root = Path(env).resolve()
        if not root.is_dir():
            raise CannotLook(f"PARACORE_WORKSPACE points at a folder that does not exist: {root}")
        return root
    root = REPO.parent
    # The workspace root is deliberately NOT a git repo, so there is nothing to ask git.
    # A sibling that must exist is the only honest marker.
    if not (root / "paracore-ecosystem").is_dir():
        raise CannotLook(
            f"cannot find the workspace root: {root} has no paracore-ecosystem/ beside it.\n"
            f"         Set PARACORE_WORKSPACE to the folder holding paracore/, paracore-gen/, ...")
    return root


def load_manifest(path: Path) -> dict:
    if not path.is_file():
        raise CannotLook(f"no manifest at {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise CannotLook(f"{path.name} is not valid JSON: {e}")
    if not isinstance(data, dict) or not isinstance(data.get("gates"), list):
        raise CannotLook(f"{path.name} has no 'gates' list")
    return data


def validate(gates: list, root: Path) -> list[str]:
    """Every rule here exists because breaking it would make a verdict LIE."""
    if not gates:
        raise CannotLook("the manifest declares ZERO gates — an empty run is not a green run")

    problems: list[str] = []
    seen: set[str] = set()

    for i, g in enumerate(gates):
        if not isinstance(g, dict):
            problems.append(f"gates[{i}]: not an object")
            continue
        gid = g.get("id")
        if _empty(gid):
            problems.append(f"gates[{i}]: no 'id'")
            continue
        where = f"gate '{gid}'"
        if gid in seen:
            problems.append(f"{where}: duplicate id")
        seen.add(gid)

        missing = [k for k in REQUIRED if _empty(g.get(k))]
        if missing:
            problems.append(f"{where}: empty {', '.join(missing)}")
            continue

        if g["runs"] not in ("auto", "manual"):
            problems.append(f"{where}: runs='{g['runs']}' must be 'auto' or 'manual'")
        # A manual gate must say WHY. Otherwise 'manual' is the escape hatch that turns
        # every inconvenient red into a declaration.
        if g["runs"] == "manual" and _empty(g.get("why_not_auto")):
            problems.append(f"{where}: runs='manual' but 'why_not_auto' is empty")
        if g["python"] != "auto" and g["python"] not in VENVS:
            problems.append(f"{where}: python='{g['python']}' is not 'auto' or one of "
                            f"{', '.join(sorted(VENVS))}")

        kr = g.get("known_red")
        if kr is not None:
            if not isinstance(kr, dict):
                problems.append(f"{where}: known_red must be an object or null")
            else:
                blank = [k for k in ALLOWANCE_KEYS if _empty(kr.get(k))]
                if blank:
                    problems.append(f"{where}: known_red has empty {', '.join(blank)} — an "
                                    f"allowance without them is a red nobody is fixing")

    # An auto gate pointing at a file that is not there must be reported once, up front.
    for g in gates:
        if isinstance(g, dict) and g.get("runs") == "auto" and not _empty(g.get("path")):
            if not (root / g["path"]).is_file():
                problems.append(f"gate '{g.get('id')}': auto gate file is missing: {g['path']}")
    return problems


# ---------------------------------------------------------------------------------------
# running
# ---------------------------------------------------------------------------------------

def resolve_python(key: str, root: Path) -> Path:
    if key == "auto":
        return Path(sys.executable)
    rel = VENVS.get(key)
    if rel is None:
        raise CannotLook(f"unknown interpreter key '{key}'")
    path = root / rel
    if not path.is_file():
        raise CannotLook(f"interpreter for '{key}' is missing: {path}")
    return path


def last_line(text: str, limit: int = 78) -> str:
    for line in reversed(text.splitlines()):
        line = line.strip()
        if line:
            return line[:limit] + ("..." if len(line) > limit else "")
    return "(no output)"


def run_one(g: dict, root: Path) -> tuple[str, str, str]:
    """Return (verdict, note, full_output). Never raises for a gate's own failure."""
    gate_path = root / g["path"]
    if not gate_path.is_file():
        # Missing != green. This is the whole point of the anti-vacuity rule.
        return "FAIL", "the gate file is missing", ""
    try:
        py = resolve_python(g["python"], root)
    except CannotLook as e:
        return "BLOCKED", str(e), ""
    cwd = root / g["cwd"]
    if not cwd.is_dir():
        return "FAIL", f"cwd does not exist: {g['cwd']}", ""

    cmd = [str(py), str(gate_path), *g.get("args", [])]
    timeout = g.get("timeout") or 900
    try:
        p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        return "FAIL", f"TIMEOUT after {timeout}s", ""
    except OSError as e:
        return "BLOCKED", f"could not launch: {e}", ""

    out = (p.stdout or "") + (p.stderr or "")
    verdict = VERDICT_OF_EXIT.get(p.returncode)
    if verdict is None:
        return "FAIL", f"exit {p.returncode} (only 0/1/2 are defined)", out
    return verdict, last_line(out), out


def decide(rows: list, strict: bool = False) -> tuple[int, list[str]]:
    """rows: [(gate, verdict)]. Returns (exit_code, summary_lines). Pure, so it is testable.

    This is where the honesty lives:
      * a known_red gate that FAILS is tolerated, but always counted and named;
      * a known_red gate that PASSES is a STALE ALLOWANCE and fails the run;
      * a manual gate is counted, never treated as green;
      * strict drops every allowance, so nothing is tolerated.
    """
    failures: list[str] = []
    blocked: list[str] = []
    cleared: list[str] = []
    allowed: list[str] = []
    green: list[str] = []
    manual: list[str] = []

    for g, verdict in rows:
        gid = g.get("id", "?")
        if g.get("runs") == "manual":
            manual.append(gid)
            continue
        kr = None if strict else g.get("known_red")
        if verdict == "PASS":
            if kr:
                cleared.append(f"{kr['id']} ({gid})")
            else:
                green.append(gid)
        elif kr:
            allowed.append(f"{kr['id']} ({gid})")
        elif verdict == "BLOCKED":
            blocked.append(gid)
        else:
            failures.append(gid)

    lines: list[str] = []
    if green:
        lines.append(f"{len(green)} auto gate(s) green")
    if allowed:
        lines.append(f"{len(allowed)} known-red allowance(s) OPEN: {', '.join(allowed)}")
    if manual:
        lines.append(f"{len(manual)} manual gate(s) not run (--list says why)")
    for gid in blocked:
        lines.append(f"BLOCKED: {gid} could not look — that is not green")
    for item in cleared:
        lines.append(f"STALE ALLOWANCE: {item} now PASSES — delete its known_red entry")

    return (1 if (failures or blocked or cleared) else 0), lines


# ---------------------------------------------------------------------------------------
# teeth
# ---------------------------------------------------------------------------------------

def prove_teeth(root: Path) -> int:
    """A runner nobody has seen fail is not a runner. Drives every branch of `decide` and
    every exit-code mapping of `run_one`. No repo file is touched: the subprocess
    scenarios use throwaway scripts in a temp directory."""
    checks: list[tuple[bool, str]] = []

    def ck(ok: bool, label: str) -> None:
        checks.append((bool(ok), label))

    # A COMPLETE gate. An incomplete fixture would be rejected by `validate` for a missing
    # required key and would then pass a test it never actually reached — which is exactly
    # how the first version of this prover reported 19/19 while testing nothing.
    BASE = {"id": "g", "path": "paracore/.repl/gate.py", "cwd": ".", "python": "auto",
            "runs": "auto", "protects": "p", "known_red": None}
    GREEN = dict(BASE)
    KR = {"id": "K", "why": "w", "remedy": "r", "blocked_by": "b", "owner": "user"}
    KR_G = dict(BASE, known_red=KR)
    MAN_G = dict(BASE, runs="manual", why_not_auto="needs a live model")

    # --- the pure decision table
    ck(decide([(GREEN, "PASS")])[0] == 0, "a green auto gate exits 0")
    ck(decide([(GREEN, "FAIL")])[0] == 1, "a red auto gate exits 1")
    ck(decide([(GREEN, "BLOCKED")])[0] == 1, "BLOCKED with no allowance exits 1 (not green)")
    ck(decide([(KR_G, "FAIL")])[0] == 0, "a known-red gate that fails does not fail the run")
    ck(decide([(KR_G, "PASS")])[0] == 1, "a known-red gate that PASSES fails the run")
    ck(decide([(KR_G, "FAIL")], strict=True)[0] == 1, "--strict turns an allowance back into a failure")
    man_lines = " ".join(decide([(MAN_G, "PASS")])[1])
    ck("1 manual" in man_lines, "a manual gate is counted, never silently green")
    ck(decide([])[0] == 0, "decide([]) is 0 — the empty case is guarded in main(), not here")

    # --- the exit-code mapping, driven through the REAL subprocess path
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        for code, want in ((0, "PASS"), (1, "FAIL"), (2, "BLOCKED"), (7, "FAIL")):
            (tdp / f"exit{code}.py").write_text(f"import sys; sys.exit({code})\n", encoding="utf-8")
            got, _, _ = run_one({"id": f"x{code}", "path": f"exit{code}.py", "cwd": ".",
                                 "python": "auto", "runs": "auto", "args": [], "timeout": 30}, tdp)
            ck(got == want, f"exit {code} maps to {want} (got {got})")

        (tdp / "loud.py").write_text("print('hello')\nprint('VERDICT: ok')\n", encoding="utf-8")
        got, note, _ = run_one({"id": "loud", "path": "loud.py", "cwd": ".", "python": "auto",
                                "runs": "auto", "args": [], "timeout": 30}, tdp)
        ck(got == "PASS" and note == "VERDICT: ok", "a passing gate's last line is captured")

        got, note, _ = run_one({"id": "ghost", "path": "nope.py", "cwd": ".", "python": "auto",
                                "runs": "auto", "args": [], "timeout": 30}, tdp)
        ck(got == "FAIL" and "missing" in note, "a missing gate file is FAIL, not skip")

        got, note, _ = run_one({"id": "hang", "path": "loud.py", "cwd": ".", "python": "auto",
                                "runs": "auto", "args": [], "timeout": 30}, tdp / "nope")
        ck(got == "FAIL", "a bad cwd is FAIL, not a crash")

    # --- the manifest guards
    try:
        validate([], root)
        ck(False, "an empty gate list raises")
    except CannotLook:
        ck(True, "an empty gate list raises (anti-vacuity)")

    ck(any("why_not_auto" in p for p in validate([dict(GREEN, runs="manual")], root)),
       "runs='manual' with no reason is rejected")

    blank = dict(KR_G, known_red={k: "" for k in ALLOWANCE_KEYS})
    ck(any("known_red" in p for p in validate([blank], root)),
       "a known_red with blank why/remedy/blocked_by is rejected")

    ck(any("missing" in p for p in validate([dict(GREEN, path="no/such/file.py")], root)),
       "an auto gate whose file is absent is a manifest problem")

    ok = sum(1 for passed, _ in checks if passed)
    for passed, label in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}")
    print(f"\nTEETH: {ok}/{len(checks)}")
    return 0 if ok == len(checks) else 1


# ---------------------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------------------

def render_list(gates: list) -> None:
    auto = [g for g in gates if g["runs"] == "auto"]
    manual = [g for g in gates if g["runs"] == "manual"]
    kr = [g for g in gates if g.get("known_red")]
    print(f"{len(gates)} gate(s): {len(auto)} auto, {len(manual)} manual, "
          f"{len(kr)} carrying a known-red allowance\n")

    def block(title: str, rows: list) -> None:
        if not rows:
            return
        print(title)
        for g in rows:
            tag = f"  [{g['known_red']['id']}]" if g.get("known_red") else ""
            print(f"  {g['id']}{tag}")
            print(f"    protects : {g['protects']}")
            print(f"    runs     : {g['path']}  (cwd {g['cwd']}, python {g['python']})")
            if g["runs"] == "manual":
                print(f"    not auto : {g['why_not_auto']}")
            if g.get("known_red"):
                k = g["known_red"]
                print(f"    RED      : {k['why']}")
                print(f"    remedy   : {k['remedy']}")
                print(f"    blocked  : {k['blocked_by']}  (owner: {k['owner']})")
            print()

    block("AUTO — run by `python .repl/gate.py`", auto)
    block("MANUAL — declared, deliberately not run", manual)


def main() -> int:
    ap = argparse.ArgumentParser(description="one command, one verdict, for every gate")
    ap.add_argument("--list", action="store_true", help="what each gate protects")
    ap.add_argument("--only", default="", help="comma-separated gate ids")
    ap.add_argument("--strict", action="store_true", help="known_red allowances count as failures")
    ap.add_argument("--verbose", action="store_true", help="show a passing gate's output line")
    ap.add_argument("--prove-teeth", action="store_true", help="prove the runner can fail")
    ap.add_argument("--manifest", default=str(MANIFEST))
    args = ap.parse_args()

    try:
        root = workspace_root()
        data = load_manifest(Path(args.manifest))
        gates = data["gates"]
        problems = validate(gates, root)
    except CannotLook as e:
        print(f"CANNOT RUN — {e}", file=sys.stderr)
        return 2

    if args.list:
        render_list(gates)
        return 0
    if args.prove_teeth:
        return prove_teeth(root)

    if problems:
        print("CANNOT RUN — the manifest is wrong:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 2

    selected = gates
    if args.only:
        want = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = want - {g["id"] for g in gates}
        if unknown:
            print(f"CANNOT RUN — no gate with id(s): {', '.join(sorted(unknown))}", file=sys.stderr)
            return 2
        selected = [g for g in gates if g["id"] in want]

    if not any(g["runs"] == "auto" for g in selected):
        print("CANNOT RUN — the selection holds no auto gate; nothing would be checked",
              file=sys.stderr)
        return 2

    LOGS.mkdir(parents=True, exist_ok=True)
    n_auto = sum(1 for g in selected if g["runs"] == "auto")
    print(f"GATE RUN — {n_auto} auto gate(s), workspace {root}")
    print(f"manifest: {Path(args.manifest)}\n")

    rows: list[tuple[dict, str]] = []
    width = max(len(g["id"]) for g in selected)

    for g in selected:
        if g["runs"] == "manual":
            rows.append((g, "MANUAL"))
            print(f"  {'SKIP':<10}  {g['id']:<{width}}  {'-':>6}  "
                  f"{(g.get('why_not_auto') or '')[:58]}")
            continue

        t0 = time.time()
        verdict, note, out = run_one(g, root)
        elapsed = time.time() - t0
        rows.append((g, verdict))

        kr = g.get("known_red")
        label = verdict
        if kr and verdict == "PASS":
            label = "CLEARED"
        elif kr:
            label = "KNOWN-RED"
            note = f"{kr['id']}  {note}"

        if label != "PASS":
            (LOGS / f"{g['id']}.log").write_text(out or "(no output)", encoding="utf-8")
        if args.verbose or label != "PASS":
            print(f"  {label:<10}  {g['id']:<{width}}  {elapsed:5.1f}s  {note}")

    code, lines = decide(rows, strict=args.strict)

    print()
    print("VERDICT: PASS" if code == 0 else "VERDICT: FAIL")
    for line in lines:
        print(f"  {line}")
    if code != 0:
        print(f"\n  logs: {LOGS}")
    return code


if __name__ == "__main__":
    sys.exit(main())
