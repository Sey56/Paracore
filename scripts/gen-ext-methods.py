"""Generate the engine's SCRIPT-FACING API INDEX from the C# source.

WHY THIS EXISTS
    `EXTENSION_METHODS.md` is two different things wearing one filename:

      * PROSE  — traps, warnings, worked recipes, "why the tolerance band matters".
                 Hand-authored. It CANNOT be generated and should not be.
      * INDEX  — which members exist, with what signature, in which file.
                 Purely mechanical. It WAS hand-maintained too, so it drifted: adding an
                 engine method meant remembering to add a row, and nothing failed if you
                 forgot. (The doc even said so: "The document is maintained by hand, so it
                 drifts".)

    So the two halves are now split by OWNER, not by tier:

        prose -> hand-authored, the authority `paracore/EXTENSION_METHODS.md`
        index -> GENERATED from the C# source, injected between the markers below

    The index is the COMPLETENESS claim of the reference: if a member is not in it, it is
    not in the engine; if it is in it, it exists. The prose explains HOW to use them.

    TWO SURFACES, because a script sees two:
      A.1  EXTENSION methods — `this`-receivers: `GetElements("Walls").WhereParam(...)`
      A.2  GLOBAL `ScriptApi` members — no prefix: `Doc`, `GetElements<Wall>()`, `Transact(...)`

THE PACK RULE
    The generic engine declares the methods EVERY client gets. A specialist repo may add
    its OWN extension methods through a `pack/` — `paracore-takeoff` is the only one today.
    A pack repo's index is generated the same way, from ITS source, by `--pack <repo>`.
    See MASTER_SYSTEM_SPEC.md ("The PACK rule").

⚠ TRUST — a generator cannot certify itself (rule 3: two sides sharing one expression is a
    tautology). `.repl/verify_ext_method_gen.py` is the independent instrument:
      * the compiler's XML doc sidecar — proves the DOCUMENTED members exist in the BUILD;
      * the built DLL's string table   — proves each name actually SHIPPED;
      * a MUTATION test                — proves the extractor is not a silent no-op;
      * a cross-count against `_ext_method_audit.py`, which has its OWN copy of the parser
        (deliberately duplicated — a verifier must not reuse the thing it verifies).

⚠ The extractor is a character-stream parser, not a grep. A C# signature routinely spans
    several lines and the generic parameter list sits BETWEEN the name and the `(`, so a
    line-oriented grep both MISSES methods and mis-attributes names.

USAGE
    python gen-ext-methods.py --print                  # dump the engine index
    python gen-ext-methods.py --check                  # is the doc's index region current?
    python gen-ext-methods.py --write                  # refresh the doc's index region
    python gen-ext-methods.py --pack <repo> --print    # a specialist repo's pack index
    python gen-ext-methods.py --pack <repo> --doc <f> --check|--write
                                                       # ... into that repo's own index doc
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ⚠ Every path is derived from this file's location, never hard-coded to a user profile:
# the repo is a SIBLING of the others under the Paracore root, and the root is not a repo.
HERE = Path(__file__).resolve()
REPO = HERE.parent.parent                      # .../paracore
PARACORE_ROOT = REPO.parent                    # .../Paracore  (holds every sibling repo)

ENGINE = REPO / "CoreScript.Engine"            # the GENERIC engine — the source of truth
ENGINE_DOC = REPO / "EXTENSION_METHODS.md"     # the authority doc (the engine repo, `paracore`)

# ⚠ Host plumbing a script cannot call. Documenting it would pad the reference with
# unreachable members, so it is EXCLUDED from the inventory — and the exclusion is asserted
# (the audit prints it) rather than left implicit.
EXCLUDE_NAMES = {"AddCoreScriptEngineServices"}

# The global (no-prefix) surface lives in the `ScriptApi` partials only. Scoping it by FILE
# keeps the claim exact: "every `public static` member of ScriptApi*".
GLOBALS_GLOB = "ScriptApi*.cs"

BEGIN = "<!-- GENERATED:EXT-INDEX:BEGIN -->"
END = "<!-- GENERATED:EXT-INDEX:END -->"


# --------------------------------------------------------------------------------------------
# the extractors
# --------------------------------------------------------------------------------------------
# ⚠ DELIBERATELY DUPLICATED in `.repl/_ext_method_audit.py`. The audit is the independent
# instrument; if it imported this module it would verify its own expression. The two counts
# are cross-checked by `verify_ext_method_gen.py`, so a divergence between the copies is
# caught rather than hidden.

HEAD = re.compile(r"\bpublic\s+static\s+(?:readonly\s+)?")
GLOBAL_HEAD = re.compile(r"\bpublic\s+static\s+")

# ⚠ The NAME is the first identifier followed by `(` (or `<…>(`) — NOT "the text before the
# first `(`". A TUPLE return type puts a `(` BEFORE the name:
#     public static (double Bot, double Top) GetZSpan(this Room room)
# Taking the first `(` yields params `(double Bot, double Top)`, which carries no `this`, so
# the method is SILENTLY DROPPED. That was a real defect: `GetZSpan` was missing from this
# reference entirely, and BOTH parsers missed it — the XML sidecar caught it
# (`.repl/verify_ext_method_gen.py`, check 3).
NAME_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)(<[^>]*>)?\s*\(")

# A `public static` member that is a TYPE, not a value — never script-facing.
_NOT_A_MEMBER = re.compile(r"\b(class|struct|interface|enum|event|delegate)\b")


def match_paren(text: str, open_idx: int) -> int:
    """Index of the `)` matching the `(` at open_idx. Skips strings, chars and comments."""
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        c = text[i]
        if c == '"':                       # string literal (naive: no verbatim/escape edge)
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


def sources(root: Path, glob: str = "*.cs"):
    """Every matching file under `root`, excluding build output, as (rel posix, text)."""
    for p in sorted(root.rglob(glob)):
        if any(part in ("bin", "obj") for part in p.parts):
            continue
        yield p.relative_to(root).as_posix(), p.read_text(encoding="utf-8", errors="replace")


def _split_name(head: str):
    """`IEnumerable<object> GroupByParam<T>` -> (`IEnumerable<object>`, `GroupByParam`, `<T>`).

    ⚠ The generic parameter list sits BETWEEN the name and the `(`. Dropping it turns
    `GetElements<Wall>()` into `GetElements()` — the index would then mis-state the API, and
    the reader could not tell `GetElements<Wall>()` from `GetElements("Walls")`.
    """
    nm = re.search(r"([A-Za-z_][A-Za-z0-9_]*)(<[^>]*>)?\s*$", head)
    if not nm:
        return None
    ret = head[:nm.start()].strip().rstrip("<") or "?"
    return ret, nm.group(1), nm.group(2) or ""


def _constraint(text: str, after: int) -> str:
    """The `where …` clause following a parameter list, or ''. Stops at the body."""
    end = min([x for x in (text.find("{", after), text.find("=>", after), text.find(";", after))
               if x >= 0] or [len(text)])
    tail = text[after:end].strip()
    return " ".join(tail.split()) if tail.startswith("where") else ""


def extract_extensions(root: Path, exclude_names: set[str] | None = None):
    """[(name, return_type, params, file, line)] for every EXTENSION method under `root`.

    An extension method is `public static … Name<T>(this …)` — the `this` on the FIRST
    parameter is the whole test, and it is also what keeps a plain static helper out.
    """
    exclude_names = exclude_names or set()
    out = []
    for rel, text in sources(root):
        for m in HEAD.finditer(text):
            start = m.end()
            nm = NAME_RE.search(text, start)
            if not nm:
                continue
            op = nm.end() - 1                      # the `(` that opens the parameter list
            # guard: a statement like `public static int X { get; }` has no parens before `{`
            brace = text.find("{", start)
            if 0 <= brace < op:
                continue
            head = text[start:nm.start()].strip()   # the RETURN TYPE
            # guard: a spurious match (a property/field sitting between two methods) drags the
            # property's `;`/`=>` into the head. A real return type never contains them.
            # ⚠ `>` is NOT in this set: `IEnumerable<T>`, `Dictionary<string, object>` are
            # return types. Including it silently dropped every generic-returning method.
            if any(ch in head for ch in ";}="):
                continue
            cp = match_paren(text, op)
            if cp < 0:
                continue
            params = " ".join(text[op + 1:cp].split())
            if not re.match(r"^this\s", params):
                continue
            name = nm.group(1)
            if name in exclude_names:
                continue
            ret = head.rstrip("<") or "?"
            generic = nm.group(2) or ""
            line = text.count("\n", 0, m.start()) + 1
            # ⚠ The RETURN TYPE is part of the signature and the prose leans on it: a `void`
            # setter ENDS a fluent chain while `IEnumerable<T>` continues it. Dropping it
            # would hide the one thing a reader checks before chaining.
            out.append((name, ret, f"{ret} {name}{generic}({params})", rel, line))
    return out


def extract_globals(root: Path):
    """[(name, signature, kind, file, line)] for every `public static` member of `ScriptApi*`.

    Two shapes, and the ONE that comes first after the modifier decides which it is:
      method    `public static void Println(string message)`
      property  `public static Document Doc => Globals.Doc;`
    ⚠ A property is NOT an extension method and would be skipped by the `this` test, which is
    exactly why the doc's hand-written §16 drifted independently of §1–§15.

    ⚠ LIMIT, stated rather than hidden: the method branch requires the NAME's `(` to be the
    first delimiter after the modifiers, so a TUPLE-return global would be missed. No such
    member exists in `ScriptApi*` today; if one is added, the XML sidecar check in
    `.repl/verify_ext_method_gen.py` fails and points at it.
    """
    out = []
    for rel, text in sources(root, GLOBALS_GLOB):
        for m in GLOBAL_HEAD.finditer(text):
            start = m.end()
            op = text.find("(", start)
            arrow = text.find("=>", start)
            brace = text.find("{", start)
            semi = text.find(";", start)
            # `{ get; set; }` bodies put the `{` before the `=>`; treat either as a property
            cand = [x for x in (op, arrow, brace, semi) if x >= 0]
            if not cand:
                continue
            first = min(cand)
            head = text[start:first].strip()
            if _NOT_A_MEMBER.search(head):
                continue
            parts = _split_name(head)
            if not parts:
                continue
            ret, name, generic = parts
            line = text.count("\n", 0, m.start()) + 1
            if first == op:
                cp = match_paren(text, op)
                if cp < 0:
                    continue
                params = " ".join(text[op + 1:cp].split())
                if re.match(r"^this\s", params):        # an extension method, not a global
                    continue
                sig = f"{ret} {name}{generic}({params})"
                where = _constraint(text, cp + 1)
                if where:
                    sig += f" {where}"
                out.append((name, sig, "method", rel, line))
            else:
                if not ret:
                    continue
                out.append((name, f"{ret} {name}", "property", rel, line))
    return out


def engine_records():
    return extract_extensions(ENGINE, EXCLUDE_NAMES)


def pack_records(repo: Path):
    """A specialist repo's OWN extension methods, from its `pack/` tree."""
    pack = repo / "pack"
    if not pack.is_dir():
        raise FileNotFoundError(f"no pack/ under {repo}")
    return extract_extensions(pack)


# --------------------------------------------------------------------------------------------
# the renderer
# --------------------------------------------------------------------------------------------

def _table(records, header: str) -> list[str]:
    """Rows grouped by source file. ⚠ The row tuple is `(name, signature, file, line)` —
    index 2 is the FILE; index 3 is the line. Mixing the two silently groups by line number
    (one bogus heading per row), which is why the layout is asserted in the verifier."""
    files = sorted({r[2] for r in records})
    lines: list[str] = []
    for rel in files:
        lines.append(f"#### `{rel}`")
        lines.append("")
        lines.append(f"| {header} | Signature |")
        lines.append("| --- | --- |")
        for name, sig, rel_of, _line in records:
            if rel_of != rel:
                continue
            lines.append(f"| `{name}` | `{sig}` |")
        lines.append("")
    return lines


def render_index(records, *, provenance: str, with_globals: bool = False) -> str:
    """The generated BODY (no markers, no heading) for one source tree."""
    files = sorted({r[3] for r in records})
    names = {r[0] for r in records}
    lines = [
        f"⚠ **GENERATED — do not edit this region.** Extracted from {provenance} by "
        "`paracore/scripts/gen-ext-methods.py`.",
        "",
        "The extraction is mechanical: it lists what the source declares, so it cannot forget a "
        "member. `python scripts/gen-ext-methods.py --write` refreshes it; `--check` fails when "
        "it is stale.",
        "",
        ("### A.1 Extension methods — `this`-receivers" if with_globals
         else "## Extension methods — `this`-receivers"),
        "",
        f"**{len(records)} declarations · {len(names)} distinct names · {len(files)} source files.**",
        "",
        "Called on an element or a collection: `GetElements(\"Walls\").WhereParam(...)`. "
        "The `this` on the first parameter is the test.",
        "",
    ]
    lines += _table(
        [(n, s, f, ln) for n, _r, s, f, ln in records],
        "Method",
    )

    if with_globals:
        gl = extract_globals(ENGINE)
        gfiles = sorted({g[3] for g in gl})
        gnames = {g[0] for g in gl}
        lines += [
            "### A.2 Global `ScriptApi` surface — no prefix",
            "",
            f"**{len(gl)} members · {len(gnames)} distinct names · {len(gfiles)} source files.**",
            "",
            "Called bare, without a receiver: `Doc`, `GetElements<Wall>()`, `Transact(...)`. "
            "⚠ These are NOT extension methods — the `this` test does not see them, which is why "
            "this half of the reference used to drift on its own.",
            "",
        ]
        lines += _table([(n, s, f, ln) for n, s, _k, f, ln in gl], "Member")

    return "\n".join(lines).rstrip() + "\n"


def inject(text: str, body: str, begin: str = BEGIN, end: str = END) -> str:
    """Replace the region between `begin` and `end` with `body`.

    ⚠ ONE implementation, parameterised by the marker pair — `gen-engine-docs.py` reuses it for
    the `SKILLS.md` region with a different pair. A second copy of this function would be a
    second place for the "which region" rule to be wrong.

    ⚠ ONE mechanism for every document: the TITLE and INTRO are hand-authored prose and the
    region between the markers is generated. An earlier `--full` mode generated the whole file —
    but then `--check` had to be handed the same `--title`/`--intro` again to reproduce it, and a
    gate you can run wrong is not a gate.
    ⚠ Raises when the markers are ABSENT rather than appending: a missing marker means the
    document is not the one we think it is, and silently creating a second region would hide that.
    """
    if begin not in text or end not in text:
        raise ValueError(
            f"markers not found — expected {begin} … {end}. "
            "Add the region to the document once; this tool only ever replaces it."
        )
    head, rest = text.split(begin, 1)
    _old, tail = rest.split(end, 1)
    return f"{head}{begin}\n{body}{end}{tail}"


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    ap.add_argument("--write", action="store_true", help="regenerate the index region")
    ap.add_argument("--print", dest="do_print", action="store_true", help="dump the index")
    ap.add_argument("--pack", metavar="REPO", help="generate a specialist repo's pack index")
    ap.add_argument("--doc", metavar="PATH", help="the document holding the index region")
    args = ap.parse_args()
    if not (args.check or args.write or args.do_print):
        ap.error("pass --print, --check or --write")

    if args.pack:
        repo = Path(args.pack).resolve()
        records = pack_records(repo)
        provenance = f"`{repo.name}/pack/`"
        with_globals = False
        doc = Path(args.doc) if args.doc else None
    else:
        records = engine_records()
        provenance = "`CoreScript.Engine/`"
        with_globals = True
        doc = Path(args.doc) if args.doc else ENGINE_DOC

    body = render_index(records, provenance=provenance, with_globals=with_globals)

    if args.do_print:
        sys.stdout.write(body)
        return 0

    if doc is None:
        ap.error("--check/--write need a document (--doc), or use --print")
    if not doc.exists():
        print(f"  MISSING {doc}")
        return 1
    have = doc.read_text(encoding="utf-8")
    want = inject(have, body)
    if have.replace("\r\n", "\n") == want.replace("\r\n", "\n"):
        print(f"  ok      {doc.name}: index region is current "
              f"({len(records)} declarations, {len({r[0] for r in records})} names)")
        return 0
    if args.write:
        doc.write_text(want, encoding="utf-8", newline="\n")
        print(f"  WROTE   {doc}")
        print(f"          {len(records)} declarations, {len({r[0] for r in records})} distinct names")
        return 0
    print(f"  STALE   {doc}: index region is out of date — run --write")
    return 1


if __name__ == "__main__":
    sys.exit(main())
