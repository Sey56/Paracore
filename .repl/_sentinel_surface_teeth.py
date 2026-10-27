#!/usr/bin/env python3
"""TEETH PROVER — `_sentinel_surface_check.py` must actually fail when the surface moves.

WHY THIS EXISTS
    A gate that has never been seen to fail is not a gate. `_sentinel_surface_check.py` passed on
    its first run, which proves only that the state is currently correct — not that the check can
    detect it being wrong. This prover mutates one thing at a time, re-runs the gate, asserts the
    expected failure appears, and restores the file byte-for-byte.

    ⚠ RESTORATION IS THE POINT. The mutation is applied to the REAL file (that is the only way to
      test the real code path), so every mutation is bracketed by a read → write → run → write-back
      and the original bytes are compared at the end. A prover that leaves the tree mutated is
      worse than no prover.

⚠ THE ANCHORS ROT. Each case names the literal it rewrites and fails loudly if the literal is no
  longer there — retarget it, never delete the case (rule 3).

Usage:  python _sentinel_surface_teeth.py     (exit 0 = every case was detected)
"""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
REPO = HERE.parent.parent
ROOT = REPO.parent
GATE = HERE.parent / "_sentinel_surface_check.py"


def load_gate():
    """(Re)import the gate fresh, so each case runs against the mutated tree."""
    spec = importlib.util.spec_from_file_location("_sentinel_surface_gate", GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_gate() -> tuple[int, str]:
    import io
    import contextlib

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = load_gate().main()
    return code, buf.getvalue()


def case(label, path: Path, mutate, expect: str) -> bool:
    original = path.read_bytes()
    try:
        text = original.decode("utf-8")
        mutated = mutate(text)
        if mutated == text:
            print(f"  ANCHOR ROT: {label} — the mutation changed nothing in {path.name}")
            return False
        path.write_bytes(mutated.encode("utf-8"))
        code, out = run_gate()
        if code == 0:
            print(f"  NOT DETECTED: {label} — the gate still passed")
            return False
        if expect not in out:
            print(f"  WRONG FAILURE: {label} — expected {expect!r}, gate said:\n{out}")
            return False
        print(f"  detected: {label}")
        return True
    finally:
        path.write_bytes(original)
        if path.read_bytes() != original:
            print(f"  !! RESTORE FAILED for {path}")
            raise SystemExit(2)


def main() -> int:
    ok = True
    print("teeth prover — one mutation at a time")

    ok &= case(
        "a sentinel name in the engine authority",
        REPO / "EXTENSION_METHODS.md",
        lambda t: t + "\nWatchdog(callback, 5)\n",
        "FORBIDDEN: paracore/EXTENSION_METHODS.md",
    )

    ok &= case(
        "a sentinel name in the VS Code tree",
        REPO / "corescript-vscode" / "ai" / "copilot-instructions.md",
        lambda t: t + "\nWatchdogReport(\"ok\")\n",
        "FORBIDDEN tree: paracore/corescript-vscode/ai",
    )

    ok &= case(
        "the deploy-manual rule removed from the Forge skill",
        ROOT / "paracore-forge" / "skills" / "sentinels" / "SKILL.md",
        lambda t: t.replace("undeploy", "release"),
        "DRIFT",
    )

    ok &= case(
        "the Forge skill dropped from the catalogue",
        ROOT / "paracore-forge" / "forge_server.py",
        lambda t: t.replace('name="sentinels"', 'name="sentinel-removed"'),
        "does not register a `sentinels` skill",
    )

    ok &= case(
        "the desktop router stops naming the skill",
        REPO / "ai" / "desktop" / "copilot-instructions.md",
        lambda t: t.replace("paracore-sentinel", "paracore-engine"),
        "does not name `paracore-sentinel`",
    )

    # the restore path is part of the prover: a clean run must pass again
    code, out = run_gate()
    if code != 0:
        print(f"  !! the gate does not pass after restoration:\n{out}")
        ok = False
    else:
        print("  restored: the gate passes again")

    print("\nVERDICT:" , "every mutation was detected" if ok else "THE GATE HAS NO TEETH")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
