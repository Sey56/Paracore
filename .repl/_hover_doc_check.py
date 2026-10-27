#!/usr/bin/env python3
"""GATE — the REPL hover docs in `ScriptApi.cs` must PARSE and must render as intended.

WHY THIS EXISTS
    The REPL hover body is the engine's XML `<summary>`, run through this pipeline:

        ReplCompletionProvider.GetHoverAsync
          -> ExtractSummary(symbol)      XElement.Parse(xml).Element("summary").Value
          -> CollapseWhitespace(text)    every whitespace run -> ONE space
          -> ReplHover.Documentation  ->  gRPC  ->  replIntellisense.ts
          -> Monaco hover `contents`     rendered as MARKDOWN

    Three failure modes are SILENT — there is no error, no warning, and no red squiggle:

      1. A BARE `<` or `&` in a summary makes XElement.Parse THROW. ExtractSummary catches
         it and returns "" — so the tooltip shows the SIGNATURE WITH NO BODY, and it looks
         exactly like "this symbol is simply undocumented". Nothing anywhere reports it.
      2. `CollapseWhitespace` squashes the whole summary to ONE LINE, and `.Value` DROPS
         every tag while DECODING entities. So `<b>`/`<c>`/`<para>` render as NOTHING —
         emphasis written with XML tags is INVISIBLE in the tooltip, while markdown
         (`**bold**`, backticks) does render. This check prints the exact string the user
         will see, so a doc that reads as a run-on wall is visible HERE rather than in the
         editor.
      3. A SELF-CLOSING `<see cref="X"/>` / `<paramref name="p"/>` contributes NO text, so
         the sentence loses a word — "a safe wrapper around ." Visual Studio renders the
         link, but the HOVER reads ONLY `<summary>`, so inside a summary the tag must carry
         explicit text: `<see cref="X">X</see>`. Found live on `Regen` and `GetMagicNames`.

WHAT IT ASSERTS
    * every `<summary>` preceding a `public static` member PARSES as XML  (catches mode 1)
    * the `<summary>` element exists
    * no summary contains an EMPTY `<see>`/`<paramref>`/`<typeparamref>`  (catches mode 3)
    * it reports the flattened hover text + its length, per member   (makes mode 2 visible)

Usage:  python .repl/_hover_doc_check.py [--max N]
        exit 0 = every summary parses and no word is missing;
        exit 1 = at least one would render BLANK or a word short.
        `--max N` also fails any hover longer than N chars (default: off).
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "CoreScript.Engine" / "Globals" / "ScriptApi.cs"


def collapse(s: str) -> str:
    """The engine's CollapseWhitespace: every run of whitespace becomes one space."""
    return " ".join(s.split())


def blocks(path: Path):
    """Yield (line_number, signature, summary_xml_body) for every documented member."""
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        if not lines[i].strip().startswith("///"):
            i += 1
            continue
        start = i
        while i < len(lines) and lines[i].strip().startswith("///"):
            i += 1
        doc = lines[start:i]
        sig = lines[i].strip() if i < len(lines) else ""
        # `///` -> "" (the space after the slashes is optional in C#)
        body = "\n".join(re.sub(r"^\s*///\s?", "", d) for d in doc)
        yield start + 1, sig, body


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=0,
                    help="also fail a hover longer than N chars (0 = no limit)")
    args = ap.parse_args()

    if not SRC.exists():
        print(f"ERROR: {SRC} not found")
        return 2

    fails = 0
    total = 0
    for lineno, sig, body in blocks(SRC):
        total += 1
        try:
            root = ET.fromstring(f"<member>\n{body}\n</member>")
        except ET.ParseError as e:
            # The hover body would be EMPTY and the editor would say nothing about it.
            print(f"  [FAIL] {SRC.name}:{lineno}  XML PARSE ERROR -> hover body is BLANK")
            print(f"         {e}")
            print(f"         {sig[:90]}")
            print("         fix: escape a bare '<' as &lt; and a bare '&' as &amp;\n")
            fails += 1
            continue

        summary = root.find("summary")
        if summary is None:
            print(f"  [FAIL] {SRC.name}:{lineno}  no <summary> element -> blank hover")
            print(f"         {sig[:90]}\n")
            fails += 1
            continue

        hover = collapse("".join(summary.itertext()))
        name = re.sub(r"\s+", " ", sig)[:78]
        flag = ""

        # A SELF-CLOSING <see cref="X"/> contributes NO text — XElement.Value is "" for it — so
        # the sentence silently loses a word: "a safe wrapper around ." In <param>/<returns>
        # Visual Studio renders it as a link, but the HOVER reads ONLY <summary>, so inside a
        # summary the tag must carry explicit text: <see cref="X">X</see>.
        bare = [el.tag for el in summary.iter()
                if el.tag in ("see", "paramref", "typeparamref")
                and not (el.text or "").strip() and len(el) == 0]
        if bare:
            flag = f"  [FAIL {len(bare)} empty <{bare[0]}/> -> a WORD IS MISSING]"
            fails += 1

        if args.max and len(hover) > args.max:
            flag += f"  [FAIL > {args.max}]"
            fails += 1
        print(f"  [{'ok' if not flag else 'FAIL'}] {SRC.name}:{lineno}{flag}")
        print(f"       {name}")
        print(f"       hover {len(hover)} chars, {hover.count(chr(10))} newline(s)")
        print(f"       {hover[:200]}{'…' if len(hover) > 200 else ''}\n")

    print(f"{total} documented member(s); "
          f"{'ALL PARSE' if fails == 0 else str(fails) + ' WOULD RENDER BLANK'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
