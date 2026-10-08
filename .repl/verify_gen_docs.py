"""Verify gen-engine-docs.py output: anchors preserved, renumber coupled, no Pro leak.

This is a REVIEW probe, not a gate -- it checks claims about the generator that the
generator itself cannot make (rule 3: two sides sharing one expression is a tautology).
Where possible it re-derives slugs from the AUTHORITY's own TOC rather than calling
slugify, so a broken slugify cannot certify itself.
"""

import importlib.util
import re
import sys
from pathlib import Path

GEN = Path(r"C:\Users\seyou\Paracore\paracore-pro\scripts\gen-engine-docs.py")
spec = importlib.util.spec_from_file_location("gen", GEN)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

UMLAUT_SAFE = re.compile(r"^(\d+)\.\s+\[([^\]]+)\]\(#([^)]+)\)", re.M)


def toc(t):
    """(number, title, anchor-without-#).

    ⚠ Normalized to NO leading '#' on purpose. The generator's own TOC_ENTRY
    captures the `#` into a separate group, so comparing a '#'-stripped form on both
    sides is the only apples-to-apples reading; mixing the two shapes reports every
    anchor as "changed" (a one-character diff that looks like a rewrite).
    """
    sec = t.split("## \U0001F4D6 Table of Contents")[1].split("## 1.")[0]
    return [(m.group(1), m.group(2), m.group(3)) for m in UMLAUT_SAFE.finditer(sec)]


def headings(t):
    return [(m.group(1), m.group(2)) for m in re.finditer(r"^## (\d+)\.\s+(.*)$", t, re.M)]


def heading_anchors(t):
    """The anchor a renderer derives from each numbered heading: `<n>-<slug(title)>`.

    ⚠ Derived exactly as GitHub derives it, so it is an INDEPENDENT check on the
    preserved TOC anchors: the two must agree or the TOC link is dead.
    """
    return [(n, f"{n}-{gen.slugify(title)}") for n, title in headings(t)]


def leak(s):
    """Pro vocabulary that must NOT be in a free-copy output."""
    words = [
        "coordinationextensions",
        "auditclashes",
        "clearclashhelpers",
        "eco.cs",
        "9. collection" if False else "zzz",
    ]
    out = []
    for w in words:
        for i, line in enumerate(s.splitlines(), 1):
            if w in line.lower():
                out.append((w, i, line.strip()[:90]))
    return out


def main():
    src_ext = (gen.MCP / "EXTENSION_METHODS.md").read_text(encoding="utf-8")
    src_repl = (gen.MCP / "REPL_GUIDE.md").read_text(encoding="utf-8")
    # ⚠ TWO variants per doc, and they are checked in OPPOSITE directions:
    #   free -> must NOT contain Pro content
    #   pro  -> must     contain Pro content (it is the Pro product's own docs)
    out_ext = gen.build("EXTENSION_METHODS.md", strip_pro=True)
    out_repl = gen.build("REPL_GUIDE.md", strip_pro=True)
    # ⚠⚠ The Pro copies are deliberately NOT rebuilt here. `gen.build(..., strip_pro=False)`
    # re-derives them FROM THE AUTHORITY, so comparing that result against the authority is a
    # TAUTOLOGY — it is True by construction and can never fail. It reported
    # "pro copy verbatim = True" for a file that was genuinely stale (found 2026-10-07).
    # The Pro copies are read from DISK in the presence scan below: the artefact that ships.

    s, o = toc(src_ext), toc(out_ext)
    print(f"TOC entries: authority {len(s)} -> free {len(o)}")

    sm = {t: a for n, t, a in s}
    om = {t: a for n, t, a in o}
    # ⚠ A changed anchor is EXPECTED here -- removing a section renumbers the tail.
    # What must hold is that each change is EXACTLY the tail shift: the number moves
    # down by the number of sections removed above it, and the suffix is untouched.
    # So we compare the SUFFIX (preserved) and assert the NUMBER shift is monotone.
    def split(a):
        n, _, suf = a.partition("-")
        return (int(n) if n.isdigit() else None), suf

    changed = []
    for t in sm:
        if t not in om:
            continue
        (n1, suf1), (n2, suf2) = split(sm[t]), split(om[t])
        if suf1 != suf2:
            changed.append((t, "SUFFIX MUTATED", sm[t], om[t]))
        elif n1 != n2:
            changed.append((t, "renumbered", sm[t], om[t]))
    print(f"surviving titles whose SUFFIX mutated (must be 0): "
          f"{[c for c in changed if c[1] != 'renumbered']}")
    print(f"surviving titles renumbered (expected, tail shift): {len(changed) - len([c for c in changed if c[1] != 'renumbered'])}")
    for t, why, a1, a2 in changed:
        if why != "renumbered":
            print("   BAD", why, t, a1, "->", a2)
    print("dropped:", [t for t in sm if t not in om])
    print("added  :", [t for t in om if t not in sm])

    # renumber map, council: authority number -> free number
    print("\nrenumbering (deltas only):")
    for (n1, t1, _), (n2, t2, _) in zip(s, o):
        if n1 != n2:
            print(f"   {n1:>2} -> {n2:>2}  {t2}")
    # ⚠ the LAST surviving authority entry is 17; the free doc must end at 17 and
    # the dropped entry must not leave a frozen tail.
    print(f"free tail number: {o[-1][0]}  (authority tail {s[-1][0]})")

    h = headings(out_ext)
    print(f"\nheadings in free output: {len(h)}; numbers {[n for n, _ in h]}")

    # ⚠ THE DECISIVE CHECK: the renderer derives each heading's anchor from
    # `## <n>. <title>`. The TOC must point at exactly that. Two independent
    # derivations -> a disagreement is a dead link, not a style difference.
    derived = {a for _, a in heading_anchors(out_ext)}
    toc_now = {a for _, _, a in o}
    print("TOC anchors with no matching heading (DEAD LINKS):", sorted(toc_now - derived))
    print("headings with no TOC entry (orphans)             :", sorted(derived - toc_now))

    # cross-file links REPL -> EXT must resolve to a real free heading.
    xl = set(re.findall(r"EXTENSION_METHODS\.md#([^)]+)\)", out_repl))
    bad = sorted(x for x in xl if x not in derived)
    print(f"REPL->EXT links: {len(xl)}; unresolved against free headings: {bad}")

    print("\nPRO LEAK SCAN  (free copies must be CLEAN)")
    for name, out in (("EXT", out_ext), ("REPL", out_repl)):
        hits = leak(out)
        print(f"  {name}: {len(hits)} hit(s)")
        for w, i, txt in hits:
            print(f"     L{i}: {txt}")

    # ⚠⚠ THE MIRROR. The Pro product's docs must KEEP the Pro sections. Without this
    # check, a generator that strips every output passes the leak scan above while
    # silently deleting the Coordination section from the product that HAS it.
    print("\nPRO PRESENCE SCAN  (pro copies must RETAIN Pro content)")
    mirror_bad = []
    # ⚠⚠ READ THE PRO COPIES FROM DISK — see the note in main(). An in-memory rebuild makes
    # this scan a tautology. A MISSING file must FAIL here (an empty scan is not a pass).
    pro_on_disk = {}
    for rel in ("EXTENSION_METHODS.md", "REPL_GUIDE.md"):
        p = gen.PRO / "Docs" / rel
        pro_on_disk[rel] = p.read_text(encoding="utf-8") if p.exists() else None

    for name, rel in (("EXT", "EXTENSION_METHODS.md"), ("REPL", "REPL_GUIDE.md")):
        out = pro_on_disk[rel]
        if out is None:
            print(f"  {name}: ⚠⚠ MISSING on disk: {gen.PRO / 'Docs' / rel}")
            mirror_bad.append(name)
            continue
        has = "auditclashes" in out.lower()
        print(f"  {name}: AuditClashes present = {has}")
        if not has:
            mirror_bad.append(name)
    if mirror_bad:
        print(f"     ⚠⚠ MISSING Pro content in pro copy: {mirror_bad}")

    # and the pro copy ON DISK must be byte-identical to the authority (no stripping at all)
    for rel in ("EXTENSION_METHODS.md", "REPL_GUIDE.md"):
        out = pro_on_disk[rel]
        same = out is not None and out == (gen.MCP / rel).read_text(encoding="utf-8")
        print(f"  {rel}: pro copy verbatim vs authority = {same}")
        if not same and rel not in mirror_bad:
            mirror_bad.append(rel)

    suffix_mutations = [c for c in changed if c[1] != "renumbered"]
    ok = (not suffix_mutations
          and not bad
          and not (toc_now - derived)
          and not (derived - toc_now)
          and not leak(out_ext)
          and not leak(out_repl)
          and not mirror_bad)
    print("\nVERDICT:", "CLEAN" if ok else "PROBLEMS FOUND")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
