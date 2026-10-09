"""Verify gen-engine-docs.py output: the SHIPPED copies match the authority, and every TOC
link in the authority resolves to a real heading.

This is a REVIEW probe, not a gate -- it checks claims the generator cannot make about itself
(rule 3: two sides sharing one expression is a tautology). Two independent checks:

  1. DRIFT  -- read each TARGET off DISK and compare it to the authority. ⚠ This is the
     meaningful half: `gen.build()` just re-reads the authority, so comparing ITS output to
     the authority would be True by construction and could never fail. The artefact that
     ships is the file on disk, so that is what we read.
  2. ANCHORS -- re-derive each heading's anchor the way a renderer would, with a LOCAL
     slugify, and assert the authority's own TOC agrees. A disagreement is a dead link.
     ⚠ The local slugify is deliberate: reusing the generator's rule would let a bug in that
     rule certify itself.

⚠ 2026-10-09 -- the free/Pro split is gone, so the old "PRO LEAK" / "PRO PRESENCE" mirror
scans (which read `gen.PRO/Docs/`, a deleted repo) are removed. There is ONE variant now:
engine-only, byte-identical to the authority.
"""

import importlib.util
import re
import sys
from pathlib import Path

GEN = Path(r"C:\Users\seyou\Paracore\paracore\scripts\gen-engine-docs.py")
spec = importlib.util.spec_from_file_location("gen", GEN)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

UMLAUT_SAFE = re.compile(r"^(\d+)\.\s+\[([^\]]+)\]\(#([^)]+)\)", re.M)


def slugify(title: str) -> str:
    """Anchor slug for a heading title, WITHOUT the leading section number.

    ⚠ A LOCAL copy, not the generator's -- a verifier must not reuse the thing it verifies.
    Derived from the file's own TOC (not assumed from GitHub's rules):
      'Element: Parameter & Property Accessors (Read)' -> element-parameter--property-accessors-read
    i.e. `A & B` -> `a--b`; `:` `(` `)` `/` `.` are dropped; spaces -> a single hyphen.
    """
    s = title.strip().lower()
    s = s.replace(" & ", "--")              # the one non-obvious rule: ampersand -> TWO hyphens
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s


def toc(t):
    """(number, title, anchor-without-#) for each TOC entry; [] if the doc has no TOC.

    ⚠ Only EXTENSION_METHODS.md carries a `## 📖 Table of Contents` and numbered headings;
    REPL_GUIDE.md is a prose guide with emoji headings and no TOC. Splitting on a header
    that is not there used to raise IndexError, so guard it and let the caller skip.
    """
    marker = "## \U0001F4D6 Table of Contents"
    if marker not in t:
        return []
    sec = t.split(marker)[1].split("## 1.")[0]
    return [(m.group(1), m.group(2), m.group(3)) for m in UMLAUT_SAFE.finditer(sec)]


def headings(t):
    return [(m.group(1), m.group(2)) for m in re.finditer(r"^## (\d+)\.\s+(.*)$", t, re.M)]


def heading_anchors(t):
    """The anchor a renderer derives from each numbered heading: `<n>-<slug(title)>`."""
    return [(n, f"{n}-{slugify(title)}") for n, title in headings(t)]


def norm(s: str) -> str:
    return s.replace("\r\n", "\n")


def main() -> int:
    ok = True

    print("DRIFT SCAN  (each shipped copy must equal its authority)")
    for rel, dest in gen.TARGETS:
        src = (gen.MCP / rel).read_text(encoding="utf-8")
        have = dest.read_text(encoding="utf-8") if dest.exists() else None
        same = have is not None and norm(src) == norm(have)
        where = dest.relative_to(dest.parents[1]) if dest.exists() else dest
        print(f"  {rel} -> {where}: on-disk == authority = {same}")
        if not same:
            ok = False

    print("\nANCHOR SCAN  (authority's TOC must resolve to its headings)")
    ext = (gen.MCP / "EXTENSION_METHODS.md").read_text(encoding="utf-8")
    repl = (gen.MCP / "REPL_GUIDE.md").read_text(encoding="utf-8")

    for name, text in (("EXT", ext), ("REPL", repl)):
        toc_now = {a for _, _, a in toc(text)}
        if not toc_now:
            print(f"  {name}: no TOC — skipping anchor check (prose guide)")
            continue
        derived = {a for _, a in heading_anchors(text)}
        dead = sorted(toc_now - derived)
        orphan = sorted(derived - toc_now)
        print(f"  {name}: {len(toc_now)} TOC entries, {len(derived)} headings")
        print(f"     TOC anchors with no heading (DEAD LINKS): {dead}")
        print(f"     headings with no TOC entry (orphans)     : {orphan}")
        if dead or orphan:
            ok = False

    # cross-file links REPL -> EXT must resolve to a real heading
    derived_ext = {a for _, a in heading_anchors(ext)}
    xl = set(re.findall(r"EXTENSION_METHODS\.md#([^)]+)\)", repl))
    bad = sorted(x for x in xl if x not in derived_ext)
    print(f"  REPL->EXT links: {len(xl)}; unresolved: {bad}")
    if bad:
        ok = False

    print("\nVERDICT:", "CLEAN" if ok else "PROBLEMS FOUND")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
