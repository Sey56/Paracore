"""
Is the add-in that Revit will load the one you just built?

⚠⚠ WHY THIS EXISTS. On 2026-10-27 I told the user "the add-in was never installed" because I
searched only %APPDATA%\\Autodesk\\Revit\\Addins. The real install is machine-wide, under
%ProgramData% — and it was there all along, two days old. That is a whole class of mistake:
every conclusion drawn from a running Revit was drawn against a build that predated the fix.

⚠ And the version number cannot save you: the 2026-10-25 build and the 2026-10-27 build are
BOTH FileVersion 4.8.1.0. The only reliable question is "does this file contain the code I
just wrote?" — so this checks the symbols, in the bytes, and it FAILS when it finds no
installed copy rather than reporting a clean sweep of nothing.

⚠⚠ TWO CORRECTIONS, BOTH MADE 2026-10-27 AFTER THEY PRODUCED FALSE ANSWERS.

  1. COMPARE AGAINST THE PUBLISH COPY, NOT THE NEWEST DLL. This used to take the newest
     Paracore.Addin.dll under bin/, which is the **Debug** build. There are two deploy paths:
         build-addin.ps1    -> bin\\Release\\...\\publish -> the Inno installer  (the real deploy)
         install-engine.cmd -> bin\\Debug                (quick copy, for a test loop)
     The user builds with the .ps1 in every repo, so the artefact that matters is the RELEASE
     PUBLISH copy. Comparing against Debug reported "newer than installed — reinstall" on
     every correct install.

  2. COMPARE BY HASH, NOT BY MTIME. Even against the right baseline, a 1-second copy skew
     (publish written 09:37:29, installed 09:37:28) made a byte-identical install look stale.
     Hash equality is the actual question: is this the same build? mtime is a proxy that
     cries wolf, and a gate that cries wolf gets ignored.

  ⇒ Comparing BOTH halves also detects the state install-engine.cmd's own comments warn
     about: a Release engine live under a Debug add-in (or the reverse), left by running the
     two build loops out of order.

    python scripts\\check-installed-addin.py
    python scripts\\check-installed-addin.py --built path\\to\\Paracore.Addin.dll

Exit 0 = the installed add-in AND engine match a current build and carry every expected
symbol. Exit 1 = they do not, or nothing was found at all.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import os
import sys

# (symbol, what it proves is in the build). Method and field names land in the #Strings heap
# as UTF-8; string literals land in #US as UTF-16 — so both encodings are probed.
ADDIN_EXPECTED = [
    ("_agentPolicyPatterns", "REPL file/network policy table"),
    ("FindAgentPolicyViolation", "REPL policy scan"),
    ("IsAgentSource", "SessionGate agent predicate"),
    ("_galleryFilePolicy", "gallery file policy table"),
    ("FindGalleryFileViolation", "gallery policy scan"),
    ("ScriptBodies", "gallery payload reader"),
    # round 4 — cap-exempt wire
    ("CapExempt", "structured-output DTO carries the cap-exempt flag to the proto type"),
]

# The engine is a SEPARATE dll in the same folder and it carries half of every fix. Checking
# only the add-in let a stale engine sit under a current add-in and still report green.
#
# ⚠⚠ RETARGETED 2026-10-27 (round 3). The previous list was round-2 symbols, so it called an
#    engine built at 10:24 "current" while the source had been edited at 10:48–10:55 — the
#    third rotted anchor of the day (the exe sentinels and one server.py sentinel were the
#    others). A symbol list only proves the build contains the fixes IT names; when a round
#    adds fixes, this list must grow or the gate silently keeps certifying the old build.
ENGINE_EXPECTED = [
    ("_declaresParameter", "GetStr: an empty parameter is not a misspelling"),
    ("SetTimeoutBudget", "REPL timeout budget"),
    # round 3 — the two silent wrong writes
    ("_resolveUnitOrThrow", "an unknown unit THROWS instead of meaning 'already in feet'"),
    ("SetElementIdFromName", "a reference written by name is category-checked and unambiguous"),
    ("_referenceCategoriesFor", "which categories a reference parameter can hold"),
    # round 3 — display
    ("_displayUnit", "FormatUnit renders m²/ft³, not m2/ft3"),
    # round 4 — cap-exempt schema tables
    ("SchemaRows", "schema/discovery tables are marked and never capped at 50 rows"),
    ("capExempt", "the cap-exempt flag travels through Table/AddStructuredOutput"),
]

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def count(path: str, needle: str) -> int:
    with open(path, "rb") as fh:
        data = fh.read()
    return data.count(needle.encode("utf-8")) + data.count(needle.encode("utf-16-le"))


def sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def install_roots() -> list[str]:
    """Every Revit Addins folder Revit itself searches — machine-wide FIRST."""
    roots: list[str] = []
    for base in (
        os.environ.get("PROGRAMDATA"),
        os.environ.get("APPDATA"),
    ):
        if not base:
            continue
        roots.extend(sorted(glob.glob(os.path.join(base, "Autodesk", "Revit", "Addins", "*"))))
    return roots


def find_installed() -> list[str]:
    found: list[str] = []
    for root in install_roots():
        candidate = os.path.join(root, "Paracore", "Paracore.Addin.dll")
        if os.path.isfile(candidate):
            found.append(candidate)
    return found


def _newest(pattern: str) -> str | None:
    hits = glob.glob(pattern, recursive=True)
    return max(hits, key=os.path.getmtime) if hits else None


def publish_dll() -> str | None:
    """The DLL the Inno installer ships — the real deploy path."""
    return _newest(os.path.join(REPO, "Paracore.Addin", "bin", "Release", "**", "publish",
                                "Paracore.Addin.dll"))


def debug_dll() -> str | None:
    """The DLL install-engine.cmd copies — the quick test path."""
    return _newest(os.path.join(REPO, "Paracore.Addin", "bin", "Debug", "**",
                                "Paracore.Addin.dll"))


def candidates() -> list[tuple[str, str]]:
    """(label, folder) for every build that could legitimately be installed."""
    out: list[tuple[str, str]] = []
    pub = publish_dll()
    if pub:
        out.append(("Release publish (installer path)", os.path.dirname(pub)))
    dbg = debug_dll()
    if dbg:
        out.append(("Debug build (install-engine.cmd path)", os.path.dirname(dbg)))
    return out


def describe(path: str) -> str:
    st = os.stat(path)
    import datetime

    return f"{st.st_size:,} bytes  {datetime.datetime.fromtimestamp(st.st_mtime):%Y-%m-%d %H:%M:%S}"


def check_symbols(path: str, expected: list[tuple[str, str]], label: str) -> bool:
    """True when every symbol is present. An absent FILE is a failure, never a pass."""
    if not os.path.isfile(path):
        print(f"           ⚠ {label}: NOT FOUND at {path}")
        return False
    missing = [f"{sym}  ({why})" for sym, why in expected if count(path, sym) == 0]
    if missing:
        print(f"           ⚠ {label}: missing {len(missing)}/{len(expected)} symbol(s):")
        for m in missing:
            print(f"             - {m}")
        return False
    print(f"           {label}: all {len(expected)} symbol(s) present")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--built", help="a specific Paracore.Addin.dll to compare against")
    args = ap.parse_args()

    installed = find_installed()

    print("searched for an installed add-in in:")
    for root in install_roots():
        print(f"  {root}")
    print()

    if not installed:
        # ⚠ LOUD. "No installed copy found" is the answer that misled me once already; it must
        #   never read as a pass. Print exactly what was searched so the next person can see
        #   whether the search itself was wrong.
        print("FAIL: no installed Paracore.Addin.dll found in any of the folders above.")
        print("      If Revit loads it from somewhere else, pass --built and check by hand —")
        print("      do NOT read this as 'nothing is installed' without looking yourself.")
        return 1

    cands = candidates()
    if args.built:
        cands.insert(0, ("--built", os.path.dirname(os.path.abspath(args.built))))
    if not cands:
        print("⚠ no build found under Paracore.Addin/bin — build it first")
        return 1

    print("candidate builds:")
    for label, folder in cands:
        print(f"  {label}")
        print(f"    {folder}")
    print()

    ok = True
    for path in installed:
        folder = os.path.dirname(path)
        inst_addin = path
        inst_engine = os.path.join(folder, "CoreScript.Engine.dll")

        print(f"INSTALLED  {folder}")
        print(f"           add-in {describe(inst_addin)}")
        if os.path.isfile(inst_engine):
            print(f"           engine {describe(inst_engine)}")
        ok &= check_symbols(inst_addin, ADDIN_EXPECTED, "add-in")
        ok &= check_symbols(inst_engine, ENGINE_EXPECTED, "engine")

        if not (os.path.isfile(inst_addin) and os.path.isfile(inst_engine)):
            print("           ⚠ cannot compare — one of the two DLLs is missing")
            print()
            ok = False
            continue

        h_addin = sha(inst_addin)
        h_engine = sha(inst_engine)

        addin_from = None
        engine_from = None
        for label, cdir in cands:
            c_addin = os.path.join(cdir, "Paracore.Addin.dll")
            c_engine = os.path.join(cdir, "CoreScript.Engine.dll")
            if addin_from is None and os.path.isfile(c_addin) and sha(c_addin) == h_addin:
                addin_from = label
            if engine_from is None and os.path.isfile(c_engine) and sha(c_engine) == h_engine:
                engine_from = label

        if addin_from and engine_from:
            if addin_from == engine_from:
                print(f"           ✔ both halves match: {addin_from}")
            else:
                print(f"           ⚠ MIXED BUILD — add-in from {addin_from},")
                print(f"             engine from {engine_from}. The two build loops were run")
                print("             out of order. Functionally identical here (the engine has")
                print("             no #if DEBUG), but say which is live before reasoning.")
        else:
            ok = False
            print(f"           ⚠ installed does NOT match any current build "
                  f"(add-in: {addin_from or 'no match'}, engine: {engine_from or 'no match'})")
        print()

    print("RESULT:", "the installed add-in and engine carry the current code"
          if ok else "THE INSTALLED ADD-IN/ENGINE IS NOT THE CURRENT BUILD")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
