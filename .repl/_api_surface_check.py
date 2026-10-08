#!/usr/bin/env python3
"""Verify the 2026-10-02 chart-API change landed: *Graph survives, *Chart retired.

Each claim is checked with an instrument that can actually PROVE it. Getting this
wrong is easy, so the limits of each instrument are stated:

  * XML doc sidecar  - lists only members that carry a /// comment. A member with
                       no doc comment is absent from the XML *by design*, so the
                       XML CANNOT prove an undocumented member exists.
  * DLL #Strings     - .NET applies SUFFIX COMPRESSION: `BarChart` is a suffix of
                       `TypeBarChart`, and `Table` a suffix of `TypeTable`, so a
                       NUL-delimited search reports 0 for names that DO exist.
                       It can prove a NAME exists, never how many members use it.
  * source text      - proves a DECLARATION exists. This is the reliable instrument
                       for the internal (undocumented) members.
  * the build itself - a call to a missing method is CS1061; 0 errors means every
                       internal call site resolved.

⚠ UPDATED 2026-10-02 for the P-2 split: the visualization stack now lives in FOUR
files, not one. §2 asserts the declaration in the file that OWNS it, so this check
fails loudly if a layer is moved and the mapping is not updated with it.

Usage:  python _api_surface_check.py     (exit 0 = all claims hold)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENG = ROOT / "CoreScript.Engine"
XML = ENG / "bin/Debug/net8.0-windows/win-x64/CoreScript.Engine.xml"

fails = []
n_checks = 0


def check(ok, label, detail=""):
    global n_checks
    n_checks += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{('  ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


def engine_source():
    out = []
    for p in ENG.rglob("*.cs"):
        if any(part in ("bin", "obj") for part in p.parts):
            continue
        out.append((p.relative_to(ENG).as_posix(),
                    p.read_text(encoding="utf-8", errors="replace")))
    return out


SRC = engine_source()

print("1. SOURCE — retired *Chart declarations must be GONE")
for name in ("BarChart", "PieChart", "LineChart"):
    pat = re.compile(r'\b(?:public|internal|private|protected)\s+(?:static\s+)?'
                     r'(?:void|IEnumerable<T>)\s+' + name + r'\b')
    hits = [(f, i + 1) for f, t in SRC
            for i, ln in enumerate(t.splitlines()) if pat.search(ln)]
    check(not hits, f"no declaration of {name}", str(hits) if hits else "")

# The four layers, each in the file that now owns it (post P-2 split).
LAYERS = ("ScriptApi.cs", "ExecutionGlobals.cs", "Output.cs", "VisualizationExtensions.cs")

print("\n2. SOURCE — surviving *Graph declarations must EXIST at all four layers")
for name in ("BarGraph", "PieGraph", "LineGraph"):
    pat = re.compile(r'\b(?:public|internal|private|protected)\s+(?:static\s+)?'
                     r'(?:void|IEnumerable<T>)\s+' + name + r'\b')
    for where in LAYERS:
        hit = any(pat.search(ln) for f, t in SRC if f.endswith(where) for ln in t.splitlines())
        check(hit, f"{name} declared in {where}")

print("\n3. XML SIDECAR — the DOCUMENTED (script-facing) surface")
x = XML.read_text(encoding="utf-8", errors="replace") if XML.exists() else ""
check(bool(x), f"{XML.name} present")
for m in ("ScriptApi.BarChart", "ScriptApi.PieChart", "ScriptApi.LineChart"):
    check(m not in x, f"{m} absent from docs")
for m in ("ScriptApi.BarGraph", "ScriptApi.PieGraph", "ScriptApi.LineGraph"):
    check(m in x, f"{m} documented")
check("ScriptApi.Table" in x and "ScriptApi.Show" in x,
      "ScriptApi.Table / .Show untouched")

print("\n4. DLL — the chart routing-key NAMES survive (name-level only)")
dll = ENG / "bin/Debug/net8.0-windows/win-x64/CoreScript.Engine.dll"
d = dll.read_bytes() if dll.exists() else b""
for n in ("BarGraph", "PieGraph", "LineGraph", "TypeTable", "ChartPrefix"):
    check(d.count(b"\x00" + n.encode() + b"\x00") > 0, f"DLL contains name {n}")
print("  NOTE: DLL cannot count members (suffix compression). Member-level proof for")
print("        the undocumented Output.*/VisualizationExtensions.* members is the")
print("        BUILD ITSELF — 0 errors means every call site resolved.")

print(f"\n{len(fails)} failed, {n_checks - len(fails)} passed")
sys.exit(1 if fails else 0)
