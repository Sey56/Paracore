"""Generate the free-repo copies of the shared engine docs from the Pro authority.

WHY THIS EXISTS
    EXTENSION_METHODS.md and REPL_GUIDE.md each existed in SIX places, hand-maintained.
    They had already drifted 76 lines apart, and the drift was not cosmetic: the free copy
    was missing 13 improvements that existed only in the Pro copy. A rename
    (.BarChart() -> .BarGraph()) therefore had to be made by hand in every copy.

    So: ONE authority (the Pro superset, in paracore-mcp/) and the free variants are
    GENERATED from it. Generated output cannot drift.

THE MODEL
    The authority is the full Pro document. A region wrapped in

        <!-- #PRO-ONLY-BEGIN  reason -->
        ...Pro-only content...
        <!-- #PRO-ONLY-END -->

    is stripped for the free variant. Everything else is identical by construction.

⚠ THE RENUMBERING IS THE SUBTLE PART
    Removing a section renumbers every later section. The docs carry three coupled
    numberings that must move together:
      1. the TOC list entries     (`16. [Coordination ...](#16-coordination--)`)
      2. the section headings     (`## 16. Coordination & Clash Detection`)
      3. the anchors inside links (`#16-coordination--clash-detection`)
    Rewriting only the headings leaves the TOC pointing at dead anchors, which renders as
    a broken link rather than an error. So we renumber all three as a set, and we renumber
    rather than delete — the free doc must read as a coherent 17-section document, not as a
    Pro doc with a hole in it.

USAGE
    python gen-engine-docs.py --check    # report drift only; exit 1 if anything is stale
    python gen-engine-docs.py --write    # regenerate the free copies
"""

import argparse
import re
import sys
from pathlib import Path

PRO = Path(r"C:\Users\seyou\Paracore\paracore-pro")
FREE = Path(r"C:\Users\seyou\Paracore\paracore")
MCP = Path(r"C:\Users\seyou\Paracore\paracore-mcp")

BEGIN = re.compile(r"<!--\s*#PRO-ONLY-BEGIN.*?-->")
END = re.compile(r"<!--\s*#PRO-ONLY-END\s*-->")
# ⚠ Markers come in BOTH shapes and both must work:
#   whole-line   `<!-- #PRO-ONLY-BEGIN ... -->` on its own line, region to END
#   inline       `a.cs<!-- #PRO-ONLY-BEGIN -->b.cs<!-- #PRO-ONLY-END -->, c.cs`
# An inline marker sitting on a line that is otherwise kept cannot be handled by a
# line filter, so the stripper works per-line with a region test, then removes any
# inline marked spans within the kept lines.
BEGIN_MARK = re.compile(r"<!--\s*#PRO-ONLY-BEGIN\b.*?-->|<!--\s*#PRO-ONLY-BEGIN\b[^\n]*?$")
END_MARK = re.compile(r"<!--\s*#PRO-ONLY-END\b.*?-->|<!--\s*#PRO-ONLY-END\b[^\n]*?$")


def _line_kind(body: str) -> str:
    """'begin', 'end', 'both', or '' for a line's whole-line marker role."""
    b = bool(BEGIN_MARK.match(body)) if body.lstrip().startswith("<!--") else False
    e = bool(END_MARK.match(body)) if body.lstrip().startswith("<!--") else False
    if b and e:
        return "both"
    if b:
        return "begin"
    if e:
        return "end"
    return ""

# The generator's own outputs. (authority filename, destination, strip_pro).
#
# ⚠⚠ strip_pro is NOT uniform, and getting it wrong deletes real documentation:
#   True  -> the FREE variant: remove #PRO-ONLY regions, renumber the sections.
#   False -> the PRO variant: the authority VERBATIM.
#
# paracore-pro IS the Pro product. Its `Docs/` must document the Pro features
# (Coordination/clash). Stripping there would remove the very section a Pro user
# needs — which is what the first version of this script did. The authority already
# holds the full Pro text, so the Pro output is a byte-identical copy and cannot drift.
TARGETS = [
    ("EXTENSION_METHODS.md", FREE / "EXTENSION_METHODS.md", True),
    ("REPL_GUIDE.md", FREE / "REPL_GUIDE.md", True),
    ("EXTENSION_METHODS.md", PRO / "Docs" / "EXTENSION_METHODS.md", False),
    ("REPL_GUIDE.md", PRO / "Docs" / "REPL_GUIDE.md", False),
]


def strip_pro_blocks(text: str) -> tuple[str, int]:
    """Remove #PRO-ONLY content, both whole-line regions and inline spans.

    Returns (text, blocks_removed). Uses a depth counter so nested/adjacent markers
    are handled, and strips inline marker comments from whatever it keeps (so no
    `<!-- #PRO-ONLY -->` residue is ever emitted into a generated file).
    """
    out, removed, depth = [], 0, 0
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        nl = line[len(body):]
        kind = _line_kind(body)

        if kind == "both":
            continue
        if kind == "end":
            depth = max(0, depth - 1)
            continue
        if kind == "begin":
            if depth == 0:
                removed += 1
            depth += 1
            continue

        if depth == 0:
            # inline spans on a kept line: drop begin..end content in place
            def _repl(m):
                return ""
            body2 = re.sub(r"<!--\s*#PRO-ONLY-BEGIN\b.*?-->.*?<!--\s*#PRO-ONLY-END\b.*?-->",
                           "", body)
            # strip any stray marker comments left on the line
            body2 = re.sub(r"<!--\s*#PRO-ONLY-(?:BEGIN|END)\b.*?-->", "", body2)
            body2 = re.sub(r"[ \t]{2,}(?=[,.])", "", body2)
            out.append(body2 + nl)

    if depth != 0:
        raise ValueError(f"unbalanced #PRO-ONLY markers (depth={depth} at EOF)")
    return "".join(out), removed


SECTION_HEAD = re.compile(r"^(##\s+)(\d+)(\.\s+)(.*)$")
TOC_ENTRY = re.compile(r"^(\d+)(\.\s+\[)([^\]]+)(\]\(#)([^)]+)(\)\s*)$")
# anchors look like #16-coordination--clash-detection
ANCHOR_NUM = re.compile(r"^#(\d+)(-.*)$")


def slugify(title: str) -> str:
    """Anchor slug for a heading title, WITHOUT the leading section number.

    Derived from the file's own TOC (not assumed from GitHub's rules):
      'Element: Parameter & Property Accessors (Read)' -> element-parameter--property-accessors-read

    i.e. `A & B` becomes `a--b`; `:` `(` `)` `/` `.` are dropped; spaces and the
    remaining hyphens stay single. ⚠ An ampersand becomes TWO hyphens, not one and
    not none — guessing this produces anchors that look plausible and 404.

    ⚠ The number is NOT part of this function's job. In THIS file a heading reads
    `## 1. Element: ...`, so the real anchor is `#1-element-...` — the prefix comes
    from the heading's own number, and `renumber()` re-attaches it. ⚠⚠ Re-deriving
    the suffix is for NEW titles only; existing anchors are PRESERVED verbatim,
    because a wrong slug rule would silently rewrite every link in the document
    (and a re-derived suffix cannot detect its own error).
    """
    s = title.strip().lower()
    s = s.replace(" & ", "--")              # the one non-obvious rule
    s = re.sub(r"[^\w\s-]", "", s)          # drop : ( ) / . and friends
    s = re.sub(r"\s+", "-", s)              # spaces -> hyphen
    return s


# ⚠ Takes the anchor text WITHOUT its leading '#': `1-element-parameter--...`
#   (TOC_ENTRY captures the `#` into its own group, so the `#` is already gone).
#   -> ('1', 'element-parameter--property-accessors-read')
ANCHOR_SPLIT = re.compile(r"^(\d+)-(.+)$")


def split_anchor(anchor: str) -> tuple[str, str]:
    """(number, suffix) for a numbered anchor; ('', whole) if unnumbered."""
    m = ANCHOR_SPLIT.match(anchor.lstrip("#"))
    if m:
        return m.group(1), m.group(2)
    return "", anchor.lstrip("#")


def renumber(text: str) -> str:
    """Renumber TOC entries, headings and in-doc anchors as ONE coupled set.

    ⚠ The TOC is renumbered POSITIONALLY (it is a 1..N list), while headings and
    anchors are renumbered by their old number. Mixing the two strategies is the
    bug this function exists to avoid: after a Pro block is stripped, the TOC's
    old "16" is a *different* section than the body's old "16", so a lookup by
    number leaves the TOC pointing at the removed section and the tail numbers
    frozen. We rebuild the TOC list from its own position instead.
    """
    lines = text.splitlines(keepends=True)

    # Pass 1: old -> new for headings, by document order.
    old_to_new: dict[int, int] = {}
    nxt = 0
    for line in lines:
        m = SECTION_HEAD.match(line.rstrip("\r\n"))
        if m:
            nxt += 1
            old_to_new[int(m.group(2))] = nxt

    # Pass 2: rewrite. The TOC is renumbered positionally in document order.
    out = []
    toc_pos = 0
    for line in lines:
        body = line.rstrip("\r\n")
        nl = line[len(body):]

        m = SECTION_HEAD.match(body)
        if m:
            new = old_to_new.get(int(m.group(2)), int(m.group(2)))
            out.append(f"{m.group(1)}{new}{m.group(3)}{m.group(4)}{nl}")
            continue

        m = TOC_ENTRY.match(body)
        if m:
            toc_pos += 1
            new = toc_pos
            # ⚠ The anchor's NUMBER must move with the entry; its SUFFIX must be
            # preserved byte-for-byte. Re-deriving the suffix here would let a slug
            # bug rewrite all 17 links while still "succeeding" — and the authority
            # already has the correct spelling, so preserving it is strictly better
            # than regenerating it. Only fall back to slugify() for an anchor that
            # is missing entirely (there are none today; this keeps the tool honest
            # if a future TOC entry is added without a link).
            raw_anchor = m.group(5)
            _, suffix = split_anchor(raw_anchor)
            if not suffix:
                suffix = slugify(m.group(3))
            # ⚠ NO leading '#' here: TOC_ENTRY's group 4 is `](#`, which already
            # emitted the hash. Producing `#{new}-...` would emit `](##1-...` —
            # a double hash that renders as a dead link and that no test caught
            # until the anchors were re-derived independently.
            anchor = f"{new}-{suffix}"
            out.append(f"{new}{m.group(2)}{m.group(3)}{m.group(4)}{anchor}{m.group(6)}{nl}")
            continue

        # a bare cross-reference link elsewhere in the prose
        def fix_link(mm):
            a_new = old_to_new.get(int(mm.group(1)), int(mm.group(1)))
            return f"](#{a_new}{mm.group(2)}"
        body2 = re.sub(r"\]\(#(\d+)(-[\w-]*)\)", fix_link, body)
        out.append(body2 + nl if body2 != body else line)

    return "".join(out)


def build(relname: str, strip_pro: bool = True) -> str:
    """Render one output from the authority.

    strip_pro=True  -> the FREE variant (regions removed, sections renumbered).
    strip_pro=False -> the PRO variant: the authority VERBATIM, so the Pro product's
                       docs keep the Pro sections. The `<!-- #PRO-ONLY-* -->` comments
                       remain in the text, which is deliberate: they are invisible when
                       rendered, they record which parts are Pro-only, and they make the
                       "byte-identical" claim trivially checkable.
    """
    src = MCP / relname
    if not src.exists():
        raise FileNotFoundError(f"authority missing: {src}")
    text = src.read_text(encoding="utf-8")
    if not strip_pro:
        return text
    stripped, removed = strip_pro_blocks(text)
    # collapse a doubled blank line left behind where a block was removed
    stripped = re.sub(r"\n{4,}", "\n\n\n", stripped)
    if removed:
        stripped = renumber(stripped)
    return stripped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    ap.add_argument("--write", action="store_true", help="regenerate outputs")
    args = ap.parse_args()
    if not (args.check or args.write):
        ap.error("pass --check or --write")

    stale, written, missing = [], [], []
    for relname, dest, strip_pro in TARGETS:
        try:
            want = build(relname, strip_pro)
        except (FileNotFoundError, ValueError) as e:
            print(f"  ERROR  {relname}: {e}")
            return 2
        have = dest.read_text(encoding="utf-8") if dest.exists() else None
        # compare modulo line endings: git normalizes to LF in both repos
        same = have is not None and have.replace("\r\n", "\n") == want.replace("\r\n", "\n")
        if same:
            print(f"  ok     {dest.relative_to(dest.parents[1])}")
            continue
        if have is None:
            missing.append(dest)
            print(f"  MISSING {dest}")
        else:
            stale.append(dest)
            print(f"  STALE   {dest}")
        if args.write:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(want, encoding="utf-8", newline="\n")
            written.append(dest)

    print()
    if args.write:
        print(f"wrote {len(written)} file(s); {len(stale) + len(missing)} were out of date")
        return 0
    if stale or missing:
        print(f"DRIFT: {len(stale)} stale, {len(missing)} missing — run --write")
        return 1
    print("generated docs are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
