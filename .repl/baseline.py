"""Stage 0 baseline harness for the finishing takeoff (Docs/MODULARIZATION_PLAN.md).

Replaces the "build -> close Revit -> install -> reopen -> probe by hand" loop with a
capture/diff pair, so a change to one section can be proven not to have moved any other.

    python .repl/baseline.py capture [tag]   # capture the live model -> Docs/baseline/<tag>.txt
    python .repl/baseline.py check           # capture, diff vs the newest baseline, exit 1 on drift
    python .repl/baseline.py diff <a> <b>    # diff two captured baselines

The `#` header carries the provenance (doc title, engine size + sha256, timestamp); the
differ ignores `#` lines and blank lines, so provenance churn never shows up as drift.

Exit codes: 0 = same, 1 = drift or failure, 2 = usage/precondition error.
"""
import difflib
import hashlib
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import g as runner  # noqa: E402  — reuses the gRPC channel + the enterprise license tier

BASELINE_DIR = ROOT / "Docs" / "baseline"
SCRIPT = HERE / "capture_baseline.cs"
# The engine the LIVE Revit is running, not the repo build output. If these disagree the
# baseline describes a build nobody is executing — the exact trap that made D21 look broken.
INSTALLED_DLL = Path(
    "C:/ProgramData/Autodesk/Revit/Addins/2025/Paracore/CoreScript.Engine.dll"
)
BUILT_DLL = (
    ROOT / "CoreScript.Engine/bin/Debug/net8.0-windows/win-x64/CoreScript.Engine.dll"
)


def _fingerprint(path: Path) -> str:
    if not path.exists():
        return "absent"
    data = path.read_bytes()
    return f"{len(data)}B sha256={hashlib.sha256(data).hexdigest()[:16]}"


BEGIN = ">>>BASELINE-BEGIN"
END = ">>>BASELINE-END"


def capture_body() -> str:
    """Run capture_baseline.cs against the live Revit and return just the data block.

    The engine interleaves chatter (`[INFO]`, `⚠ GetStr(...)`, `[finishes] collector ...`,
    `Pipeline: [...]`) with the inspector calls, and that chatter is NOT stable: timings vary,
    and a warm cache run emits a different set of lines from a cold one. So the C# script
    wraps the data in sentinels and we take only what is between them. Without this the
    baseline differs from itself on every run — which is exactly what the first attempt did.
    """
    if not SCRIPT.exists():
        raise SystemExit(f"*** missing {SCRIPT}")
    r = runner.execute(SCRIPT.read_text(encoding="utf-8"))
    if not r.is_success:
        detail = getattr(r, "error_message", "") or "(no error_message)"
        raise SystemExit(f"*** script failed:\n{detail}")
    out = r.output or ""
    if BEGIN not in out or END not in out:
        raise SystemExit(
            f"*** missing {BEGIN}/{END} sentinels — is .repl/capture_baseline.cs current?\n"
            f"--- raw output tail ---\n{out[-2000:]}"
        )
    body = out.split(BEGIN, 1)[1].split(END, 1)[0]
    return "\n".join(ln.rstrip() for ln in body.splitlines() if ln.strip()) + "\n"


def header(doc_title: str) -> str:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"# finishing baseline — Stage 0\n"
        f"# captured : {stamp}\n"
        f"# document : {doc_title}\n"
        f"# installed: {INSTALLED_DLL.name} {_fingerprint(INSTALLED_DLL)}\n"
        f"# built    : {BUILT_DLL.name} {_fingerprint(BUILT_DLL)}\n"
        f"#\n"
        f"# Do not hand-edit. `python .repl/baseline.py check` re-captures and diffs this.\n"
    )


def doc_title() -> str:
    r = runner.execute('Print(Doc.Title);')
    return (r.output or "").strip() if r.is_success else "(unknown)"


def body_lines(path: Path) -> list[str]:
    """The comparable part: drop provenance comments and blank lines."""
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.rstrip()
        if not s or s.startswith("#"):
            continue
        out.append(s)
    return out


def cmd_capture(tag: str | None) -> int:
    body = capture_body()
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    tag = tag or datetime.now().strftime("%Y-%m-%d")
    path = BASELINE_DIR / f"{tag}.txt"
    path.write_text(header(doc_title()) + "\n" + body, encoding="utf-8")
    n = len(body_lines(path))
    print(f"captured {n} lines -> {path.relative_to(ROOT)}")
    return 0


def newest_baseline() -> Path | None:
    if not BASELINE_DIR.exists():
        return None
    files = sorted(BASELINE_DIR.glob("*.txt"), key=lambda p: p.name)
    return files[-1] if files else None


def diff_files(a: Path, b: Path, a_label: str, b_label: str) -> int:
    d = list(
        difflib.unified_diff(
            body_lines(a), body_lines(b), fromfile=a_label, tofile=b_label, lineterm="", n=2
        )
    )
    if not d:
        print(f"IDENTICAL — {a_label} == {b_label}")
        return 0
    print(f"DRIFT — {len(d)} diff lines\n")
    for line in d:
        print(line)
    return 1


def cmd_check() -> int:
    base = newest_baseline()
    if base is None:
        print("*** no baseline to check against — run: python .repl/baseline.py capture")
        return 2
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = BASELINE_DIR / ".check.tmp"
    tmp.write_text(header(doc_title()) + "\n" + capture_body(), encoding="utf-8")
    rc = diff_files(base, tmp, base.name, "live")
    tmp.unlink(missing_ok=True)
    if rc == 0:
        print("(no section moved)")
    return rc


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    cmd = args[0]
    if cmd == "capture":
        return cmd_capture(args[1] if len(args) > 1 else None)
    if cmd == "check":
        return cmd_check()
    if cmd == "diff":
        if len(args) < 3:
            print("usage: python .repl/baseline.py diff <a> <b>")
            return 2
        a, b = Path(args[1]), Path(args[2])
        if not a.is_absolute():
            a = BASELINE_DIR / a
        if not b.is_absolute():
            b = BASELINE_DIR / b
        return diff_files(a, b, a.name, b.name)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
