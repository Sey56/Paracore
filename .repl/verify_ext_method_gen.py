#!/usr/bin/env python3
"""TRUST CHECK — is the generated API index actually derived from the code, and is it complete?

WHY A SEPARATE INSTRUMENT
    `gen-ext-methods.py` writes the index; `gen-engine-docs.py --check` compares the shipped
    file to `build()`. That comparison is a TAUTOLOGY with respect to the extractor: both sides
    come from the same expression, so an extractor bug (a missed declaration, a mis-grouped
    row) is invisible to it. rule 3 — a gate must not have a failure mode of its own.

    So this probe re-establishes the claim from INDEPENDENT evidence:

      1. CROSS-COUNT   a second, independently-written parser (`_ext_method_audit.py`) must
                       agree on the NAME SET. Two implementations agreeing is not proof, but a
                       divergence is proof of a bug in one of them.
      2. LAYOUT        the index must group by SOURCE FILE — one heading per file, no more.
                       (This guards a real bug: reading the line number where the file path
                       was meant emits one bogus heading per row, and the counts still match.)
      3. XML SIDECAR   the COMPILER's own output (`CoreScript.Engine.xml`) must not name a
                       script-facing member that the index is missing. Independent artefact,
                       independent technology. ⚠ THIS IS THE CHECK THAT FOUND `GetZSpan`: a
                       tuple return type put a `(` before the method name, and BOTH parsers
                       silently dropped it.
                       ⚠ Limit: the XML lists only members carrying a `///` comment, so it
                       proves a documented member EXISTS, never that the index is complete for
                       undocumented ones. Members it names that are `internal` (e.g.
                       `ResolveParam`) or not extension methods are reported, not failed.
      4. DLL           the built assembly must not PREDATE the newest engine source (a stale
                       DLL makes this whole file meaningless — rule 15), and every name in the
                       index must occur in its string heap.
                       ⚠ .NET applies SUFFIX COMPRESSION (`Doc` is stored as a suffix of
                       `UIDoc`), so the search is `name\\0`, not `\\0name\\0` — and it still
                       proves PRESENCE only, never absence.
      3+4 BOTH read the INSTALLED artefact first — it is what the running Revit loads, so its
                       mtime is the one that decides whether our observations are current
                       (rule 15), and preferring it catches "built but not installed". They
                       fall back to the newest `bin/<config>/net8.0-windows/win-x64/` output so
                       the probe still works where the add-in is not installed. ⚠⚠ They used to
                       hardcode `bin/Debug/...`, but `build-addin.ps1` publishes **Release**, so
                       after a real rebuild the freshness check compared the source to a Debug
                       DLL nobody ships and could NEVER pass. A gate whose own path is wrong is
                       not a gate (rule 3). ⚠ Both report WHICH artefact they read.
      5. MUTATION      rewrite the source in a TEMP tree — rename a method, add one, delete one
                       — and assert the extracted index follows. This is the only check that
                       proves the extractor READS THE SOURCE rather than replaying a constant.
      6. MARKERS       `inject()` must REFUSE a document with no marker region, and a stale
                       region must make the CLI exit non-zero. An empty scan must FAIL.

Usage:  python verify_ext_method_gen.py       (exit 0 = every claim holds)
"""

import importlib.util
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PARACORE_ROOT = REPO.parent

GEN_PY = REPO / "scripts" / "gen-ext-methods.py"
AUDIT_PY = REPO / ".repl" / "_ext_method_audit.py"
# ⚠ The doc authority is the ENGINE repo (`paracore`) — it moved off `paracore-gen` on
# 2026-10-13. It is the copy a hand edit lands in, so it is the one this probe must read.
DOC = REPO / "EXTENSION_METHODS.md"
# ⚠⚠ THE BUILD OUTPUT IS RESOLVED, NOT HARDCODED — a gate whose own path is wrong is not a gate
# (rule 3). This used to point at `bin/Debug/...`, but `build-addin.ps1` publishes **Release**
# (`-c Release` → `bin\Release\net8.0-windows\win-x64`). After a real rebuild the freshness check
# therefore compared the source to a Debug DLL nobody ships, and could NEVER go green.
#
# Resolve it in the product's own terms:
#   * PREFER the INSTALLED assembly — it is what the running Revit actually loads, so its mtime is
#     the one that decides whether our observations are current (rule 15); this also catches
#     "built but not installed".  Globbed, so the Revit YEAR is not pinned.
#   * FALL BACK to the newest `bin/<config>/net8.0-windows/win-x64/` output, so the check still
#     works on a machine where the add-in is not installed.
# ⚠ `net10.0-windows` and the legacy `bin/x64/Release/` tree are deliberately NOT matched: the
# product targets `net8.0-windows`, and nothing ships from those.
INSTALLED_ROOT = Path(r"C:\ProgramData\Autodesk\Revit\Addins")
ENGINE_DIR = REPO / "CoreScript.Engine"


def resolve_build_artifact(ext: str) -> tuple[Path | None, list[Path]]:
    """The shipped `CoreScript.Engine.<ext>` to inspect, plus every candidate (newest first)."""
    installed = sorted(INSTALLED_ROOT.glob(f"*/Paracore/CoreScript.Engine.{ext}"))
    built = sorted(ENGINE_DIR.glob(f"bin/*/net8.0-windows/win-x64/CoreScript.Engine.{ext}"))
    cands = [p for p in installed + built if p.exists()]
    cands.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if not cands:
        return None, []
    return max(installed or built, key=lambda p: p.stat().st_mtime), cands


def announce(label: str, chosen: Path, cands: list[Path]) -> None:
    """Say WHICH artefact is inspected — a gate must not hide what it read."""
    where = "INSTALLED" if "Addins" in chosen.parts else "build output"
    print(f"       {label}: {where} — {chosen}")
    for c in cands:
        if c != chosen:
            print(f"            (not used) {c.stat().st_mtime:.0f}  {c}")


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gen = load(GEN_PY, "gen_ext_methods")
aud = load(AUDIT_PY, "ext_method_audit")

fails: list[str] = []
checks = 0


def check(ok, label, detail=""):
    global checks
    checks += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{('  — ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


# --------------------------------------------------------------------------------------------
records = gen.engine_records()                      # (name, ret, sig, file, line)
globs = gen.extract_globals(gen.ENGINE)             # (name, sig, kind, file, line)
names = {r[0] for r in records}
gfile_names = {r[3] for r in records}
body = gen.render_index(records, provenance="`CoreScript.Engine/`", with_globals=True)

print("1. CROSS-COUNT  (a second, independently-written parser must agree on the NAME SET)")
aud_names = {r[0] for r in aud.extract()} - gen.EXCLUDE_NAMES
check(aud_names == names,
      f"name sets agree ({len(names)} names)",
      f"only-in-gen={sorted(names - aud_names)} only-in-audit={sorted(aud_names - names)}"
      if aud_names != names else "")

print("\n2. LAYOUT  (the index must group by SOURCE FILE, not by line)")
a1 = body.split("### A.2")[0]
headings = re.findall(r"^#### `([^`]+)`$", a1, re.M)
check(headings == sorted(gfile_names),
      f"A.1 has exactly one heading per source file ({len(headings)})",
      f"headings={len(headings)} files={len(gfile_names)}" if headings != sorted(gfile_names) else "")
check(len(headings) == len(set(headings)), "no duplicate file headings")
rows = len(re.findall(r"^\| `", a1, re.M))
check(rows == len(records), f"one table row per declaration ({rows})", f"rows={rows} records={len(records)}")

print("\n3. XML SIDECAR  (the compiler's own output must not name a member the index is missing)")
# A naive, INDEPENDENT reader used only to CLASSIFY an XML name: the generator's parser must not
# be asked whether the generator missed something.
ENGINE_SRC = [
    (p.relative_to(gen.ENGINE).as_posix(), p.read_text(encoding="utf-8", errors="replace"))
    for p in sorted(gen.ENGINE.rglob("*.cs"))
    if not any(part in ("bin", "obj") for part in p.parts)
]


def _params_of(text: str, op: int) -> str:
    depth, i = 0, op
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return " ".join(text[op + 1:i].split())


def classify(member: str):
    """(accessibility, is_extension) for the DECLARATION of `member`.

    ⚠ A plain search finds a CALL SITE first (`e.ResolveParam(name)` sits ~120 lines above the
    declaration), and a call site has no accessibility modifier — classifying off one reports
    `?` and hides a real miss. So: only a match whose preceding window carries a modifier
    counts, and a `this`-parameter wins over a non-`this` one.
    """
    pat = re.compile(r"\b" + re.escape(member) + r"\s*(?:<[^>]*>)?\s*\(")
    fallback = None
    for _rel, text in ENGINE_SRC:
        for m in pat.finditer(text):
            window = text[max(0, m.start() - 400):m.start()]
            mods = re.findall(r"\b(public|internal|private|protected)\b", window)
            if not mods:
                continue                       # a call site, not a declaration
            is_ext = _params_of(text, m.end() - 1).startswith("this")
            if is_ext:
                return mods[-1], True
            if fallback is None:
                fallback = (mods[-1], False)
    return fallback or (None, False)


XML, xml_cands = resolve_build_artifact("xml")
if XML is None:
    check(False, "CoreScript.Engine.xml present", "build the engine first")
else:
    announce("XML", XML, xml_cands)
    xml = XML.read_text(encoding="utf-8", errors="replace")
    members = re.findall(r'<member name="([A-Z]):([^"]+)"', xml)
    indexed_classes = set()
    for f in gfile_names:
        stem = Path(f).stem
        indexed_classes.add(stem)
        indexed_classes.add(stem.split(".")[0])
    all_names = names | {g[0] for g in globs}
    missing, non_public, not_ext, considered = [], [], [], 0
    for kind, full in members:
        if kind not in ("M", "P"):
            continue
        sig = full.split("(")[0]
        if "." not in sig:
            continue
        owner, member = sig.rsplit(".", 1)
        member = re.sub(r"`+\d*$", "", member)         # generic arity marker: ToNotebook``1
        if owner.rsplit(".", 1)[-1] not in indexed_classes:
            continue
        considered += 1
        if member in all_names:
            continue
        mod, is_ext = classify(member)
        if not is_ext:
            not_ext.append(f"{member} ({mod})")
        elif mod != "public":
            non_public.append(f"{member} ({mod})")
        else:
            missing.append(f"{kind}:{sig}")
    check(not missing,
          f"every PUBLIC script-facing engine member is in the index ({considered} considered)",
          f"{len(missing)} missing, e.g. {missing[:6]}" if missing else "")
    if non_public or not_ext:
        print(f"       reported, not failed (correctly absent from a script-facing index):")
        print(f"         internal/protected: {sorted(non_public)}")
        print(f"         not extension methods: {sorted(not_ext)}")

print("\n4. DLL  (freshness, then name presence in the shipped assembly)")
DLL, dll_cands = resolve_build_artifact("dll")
if DLL is None:
    check(False, "CoreScript.Engine.dll present", "build the engine first")
else:
    announce("DLL", DLL, dll_cands)
    newest_src = max(p.stat().st_mtime for p in gen.ENGINE.rglob("*.cs")
                     if not any(x in ("bin", "obj") for x in p.parts))
    # ⚠ THE LABEL IS PRINTED ONLY ON FAILURE, so it must describe the FAILING state. It used to
    #   read "the built DLL is not older than the newest engine source" — the PASS condition —
    #   while being shown when the DLL WAS older. Measured 2026-10-28: the report said the DLL was
    #   "not older" next to `dll=…908 src=…109`, i.e. 37 minutes older. A gate whose message says
    #   the opposite of what it means sends the reader to the wrong file.
    # ⚠⚠ AND THE REMEDY DEPENDS ON WHICH COPY IT MEASURED. resolve_build_artifact prefers the
    #   INSTALLED DLL, so after a correct rebuild this check still fails — and the old text said
    #   "rebuild the engine", which would change nothing. Measured 2026-10-28: rebuilt at 06:20,
    #   gate still red, because the installed copy was from 21:18 the night before. Name the copy
    #   and the action that actually closes it.
    _in_repo = str(DLL).lower().startswith(str(gen.ENGINE).lower())
    _remedy = ("rebuild the engine" if _in_repo
               else "run installers\\Paracore_Addin_v4.8.1.exe with Revit CLOSED")
    check(DLL.stat().st_mtime >= newest_src,
          f"the {'built' if _in_repo else 'INSTALLED'} DLL is OLDER than the newest engine source — {_remedy}",
          f"dll={DLL.stat().st_mtime:.0f} src={newest_src:.0f} (dll is older by "
          f"{(newest_src - DLL.stat().st_mtime) / 60:.0f} min)" if DLL.stat().st_mtime < newest_src else "")
    blob = DLL.read_bytes()
    all_names = names | {g[0] for g in globs}
    # ⚠ `name\0`, not `\0name\0`: suffix compression stores `Doc` inside `UIDoc`.
    absent = sorted(n for n in all_names if (n + "\x00").encode() not in blob)
    check(not absent,
          f"all {len(all_names)} indexed names occur in the DLL string heap",
          f"absent={absent[:8]}" if absent else "")
    print("       NOTE: suffix-tolerant, and PRESENCE only — it can never prove a name absent.")

print("\n5. MUTATION  (rewrite the source; the index must follow — this is the anti-no-op proof)")
src = gen.ENGINE / "Globals" / "ElementParamExtensions.cs"
original = src.read_text(encoding="utf-8", errors="replace")


def extract_from(text: str):
    """Run the real extractor over a temp tree holding ONE mutated file."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / "CoreScript.Engine" / "Globals"
        root.mkdir(parents=True)
        (root / "ElementParamExtensions.cs").write_text(text, encoding="utf-8")
        return gen.extract_extensions(Path(td) / "CoreScript.Engine")


base = extract_from(original)
check(bool(base), f"baseline extracts from the temp tree ({len(base)} declarations)")
check("GetStr" in {r[0] for r in base}, "baseline contains GetStr")

renamed = extract_from(original.replace("public static string GetStr(this",
                                        "public static string GetStrRenamed(this"))
check("GetStrRenamed" in {r[0] for r in renamed} and "GetStr" not in {r[0] for r in renamed},
      "RENAME is picked up (GetStr -> GetStrRenamed)")

SYN_A = "\nnamespace T { public static class Z { public static int SyntheticAlpha(this Element e) => 1; } }\n"
SYN_B = "\nnamespace T { public static class Z { public static int SyntheticBeta(this Element e) => 2; } }\n"
two = extract_from(original + SYN_A + SYN_B)
check({"SyntheticAlpha", "SyntheticBeta"} <= {r[0] for r in two} and len(two) == len(base) + 2,
      f"ADD is picked up (+2 -> {len(two)})")

one = extract_from(original + SYN_B)
check("SyntheticAlpha" not in {r[0] for r in one} and "SyntheticBeta" in {r[0] for r in one}
      and len(one) == len(base) + 1,
      f"DELETE is picked up ({len(two)} -> {len(one)})")

# ⚠ the tuple-return case that BOTH original parsers missed — it must stay fixed
tuple_src = ("\nnamespace T { public static class Z { "
             "public static (double Bot, double Top) SyntheticSpan(this Element e) => (0, 1); } }\n")
tup = extract_from(original + tuple_src)
check("SyntheticSpan" in {r[0] for r in tup}, "TUPLE return type is picked up (regression guard)")

print("\n6. MARKERS  (an empty scan must FAIL, and a stale region must be non-zero)")
try:
    gen.inject("# no markers here\n", body)
    check(False, "inject() refuses a document with no marker region")
except ValueError:
    check(True, "inject() refuses a document with no marker region")

with tempfile.TemporaryDirectory() as td:
    stale = Path(td) / "EXTENSION_METHODS.md"
    stale.write_text(DOC.read_text(encoding="utf-8").replace(
        "### A.1 Extension methods", "### A.1 Extension methods  <!-- tampered -->", 1),
        encoding="utf-8")
    r = subprocess.run([sys.executable, str(GEN_PY), "--check", "--doc", str(stale)],
                       capture_output=True, text=True)
    check(r.returncode != 0, "CLI --check exits non-zero on a stale index region",
          f"rc={r.returncode}")

    fresh = Path(td) / "FRESH.md"
    fresh.write_text(DOC.read_text(encoding="utf-8"), encoding="utf-8")
    r2 = subprocess.run([sys.executable, str(GEN_PY), "--check", "--doc", str(fresh)],
                        capture_output=True, text=True)
    check(r2.returncode == 0, "CLI --check exits zero on the shipped document",
          f"rc={r2.returncode} {r2.stdout.strip()[:80]}")

print(f"\n{len(fails)} failed, {checks - len(fails)} passed")
if fails:
    for f in fails:
        print(f"   FAILED: {f}")
sys.exit(1 if fails else 0)
