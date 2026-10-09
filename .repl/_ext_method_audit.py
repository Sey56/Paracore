#!/usr/bin/env python3
"""AUDIT — every extension method the ENGINE actually declares, vs the ones
EXTENSION_METHODS.md documents.

WHY a real parser instead of grep: a C# signature routinely spans several lines
(`public static IEnumerable<T>\n    WhereParam<T>(this IEnumerable<T> elements,\n
string name, string value)`), and the generic parameter list sits BETWEEN the
name and the `(`. A line-oriented grep therefore both MISSES methods and
mis-attributes names. This walks the character stream instead.

Instrument limits, stated up front (rule 3: assert the CHOICE, not a total):
  * SOURCE  — proves a DECLARATION exists, with its file + line. Reliable.
  * the DOC — proves a NAME is *mentioned*. It cannot prove the mention is a
              signature rather than prose, so a hit is `mentioned`, not `documented`.
              A ZERO is the only hard claim: 0 occurrences = not in the doc at all.

Usage:  python _ext_method_audit.py [--verbose]
Exit 0 always (this is a report, not a gate) unless --strict is given.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENG = ROOT / "CoreScript.Engine"
DOC = Path(r"C:\Users\seyou\Paracore\paracore-mcp\EXTENSION_METHODS.md")

VERBOSE = "--verbose" in sys.argv
STRICT = "--strict" in sys.argv

# Deliberately NOT documented: host plumbing a script cannot call. Asserting these
# must be EXCLUDED, not "documented", keeps the doc's claim ("every script-facing
# extension method") true instead of padding it with unreachable members.
EXCLUDE = {"AddCoreScriptEngineServices"}


def sources():
    for p in sorted(ENG.rglob("*.cs")):
        if any(part in ("bin", "obj") for part in p.parts):
            continue
        yield p.relative_to(ENG).as_posix(), p.read_text(encoding="utf-8", errors="replace")


def match_paren(text: str, open_idx: int) -> int:
    """Index of the `)` matching the `(` at open_idx. Ignores parens in strings/chars/comments."""
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        c = text[i]
        if c == '"':                       # skip a string literal (naive: no verbatim/escapes edge)
            i += 1
            while i < n and text[i] != '"':
                i += 2 if text[i] == "\\" else 1
        elif c == "'":
            i += 1
            while i < n and text[i] != "'":
                i += 2 if text[i] == "\\" else 1
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


HEAD = re.compile(r"\bpublic\s+static\s+(?:readonly\s+)?")


def extract():
    """[(name, return_type, params, file, line, raw_head)] for every extension method."""
    out = []
    for rel, text in sources():
        for m in HEAD.finditer(text):
            start = m.end()
            # the name is the LAST identifier before the `(` that opens the parameter list
            op = text.find("(", start)
            if op < 0:
                continue
            # guard: a statement like `public static int X { get; }` has no parens before `{`
            brace = text.find("{", start)
            if 0 <= brace < op:
                continue
            head = text[start:op].strip()
            cp = match_paren(text, op)
            if cp < 0:
                continue
            params = " ".join(text[op + 1:cp].split())
            # an extension method's FIRST parameter carries the `this` modifier
            if not re.match(r"^this\s", params):
                continue
            nm = re.search(r"([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*$", head)
            if not nm:
                continue
            name = nm.group(1)
            ret = head[:nm.start()].strip().rstrip("<")
            line = text.count("\n", 0, m.start()) + 1
            out.append((name, ret or "?", params, rel, line, head))
    return out


def main():
    ext = extract()
    by_name = {}
    for name, ret, params, rel, line, head in ext:
        by_name.setdefault(name, []).append((ret, params, rel, line))

    doc = DOC.read_text(encoding="utf-8") if DOC.exists() else ""
    print(f"engine extension methods declared : {len(ext)}  ({len(by_name)} distinct names)")
    print(f"documented in EXTENSION_METHODS.md : {len(doc.splitlines())} lines, {len(doc)} chars\n")

    # ⚠ boundary is `[A-Za-z0-9_]` only — a preceding `.` is a CALL SITE
    # (`elements.SetParam(...)`) and must count as a hit. An earlier version of this
    # probe excluded `.` and therefore reported 50 "missing" methods, most of which
    # were documented as method calls. 0 hits is the only hard claim.
    def doc_hits(name: str) -> int:
        return len(re.findall(r"(?<![A-Za-z0-9_])" + re.escape(name) + r"(?![A-Za-z0-9_])", doc))

    missing = []
    excluded = 0
    for name in sorted(by_name):
        if name in EXCLUDE:
            excluded += 1
            continue
        if doc_hits(name) == 0:
            missing.append(name)

    print(f"excluded (host plumbing, not script-facing): {excluded}  {sorted(EXCLUDE & set(by_name))}")
    print(f"MISSING from the doc (0 occurrences): {len(missing)}")
    for name in missing:
        for ret, params, rel, line in by_name[name]:
            sig = f"{name}({params})"
            print(f"   {rel}:{line}\n       {ret} {sig}")

    if VERBOSE:
        print("\n--- ALL declared extension methods ---")
        for name in sorted(by_name):
            print(f"  {name:<26} decls={len(by_name[name])}  doc-hits={doc_hits(name)}")

    return 1 if (STRICT and missing) else 0


if __name__ == "__main__":
    sys.exit(main())
