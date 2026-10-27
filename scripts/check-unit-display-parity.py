#!/usr/bin/env python
"""GATE -- every unit the engine CONVERTS must also have a canonical DISPLAY suffix.

WHY THIS EXISTS
    `UnitExtensions.GetUnitTypeId` decides whether a unit string is understood (it gates
    `InputUnit` / `OutputUnit` / `SetNum` / `GetNum`). `_displayUnit` decides what a human
    sees after `FormatUnit`. Those are two hand-maintained switches over the same vocabulary,
    and they had no mechanical link.

    A unit added to the first and not the second does not error. It CONVERTS the number and
    then echoes the raw user string, so `5.065.FormatUnit("square meters")` prints
    "5.065 square meters" while `FormatUnit("m2")` prints "5.065 m²" -- same value, two
    different labels, and nothing tells you the map is incomplete.

    Measured before this gate: `FormatUnit` rendered `m2` for square metres. A quantity
    surveyor writes m². That is the bug this catches the NEXT instance of.

WHAT IT CHECKS (source-level, no Revit, no build)
    1. Every spelling accepted by GetUnitTypeId is a case label in _displayUnit.
    2. _displayUnit invents no unit that GetUnitTypeId would reject.
    3. Area/volume suffixes use a real superscript (m², ft³), never a digit.
    4. An EMPTY scan FAILS -- if the parse finds no units at all, the two methods were
       renamed and this gate stopped looking, which must not read as a pass.

EXIT
    0 = current, 1 = drift, 2 = the gate could not see what it is supposed to check.

    `--source PATH` points the gate at another copy of UnitExtensions.cs. That exists so the
    teeth can be proven: mutate a temp copy (drop one case label, or return "m2"), run the
    gate against it, and require exit 1. A gate that has never been seen to fail is a guess.
"""
import argparse
import re
import sys
from pathlib import Path

DEFAULT_SRC = (
    Path(__file__).resolve().parent.parent / "CoreScript.Engine" / "Globals" / "UnitExtensions.cs"
)

# The vocabulary the gate expects to find. Not the full list -- a floor. If the file is
# refactored and these disappear, the gate is blind, not green.
REQUIRED_SPELLINGS = {"mm", "m", "ft", "in", "m2", "ft2", "m3", "ft3"}
REQUIRED_SUPERSCRIPTS = {"m2": "m\u00b2", "m3": "m\u00b3", "ft2": "ft\u00b2", "ft3": "ft\u00b3"}


def method_body(text: str, name: str) -> str | None:
    """Brace-balanced body of the named method, or None if absent."""
    m = re.search(rf"\b(?:public|private|internal)\s+static\s+[\w?<>]+\s+{name}\s*\(", text)
    if not m:
        return None
    i = text.index("{", m.end() - 1)
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i : j + 1]
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", default=str(DEFAULT_SRC), help="another UnitExtensions.cs to check")
    src = Path(ap.parse_args().source)

    if not src.is_file():
        print(f"BLIND  source not found: {src}")
        return 2

    text = src.read_text(encoding="utf-8")
    resolve_body = method_body(text, "GetUnitTypeId")
    display_body = method_body(text, "_displayUnit")

    if resolve_body is None or display_body is None:
        print("BLIND  could not locate GetUnitTypeId and/or _displayUnit in UnitExtensions.cs")
        print("       the gate parses those two methods by name -- if one was renamed,")
        print("       retarget this gate rather than deleting it.")
        return 2

    # GetUnitTypeId contains no literals other than unit spellings, so every quoted string
    # in it is a case value. _displayUnit additionally has the `(unit ?? "")` coalesce.
    resolve_literals = set(re.findall(r'"([^"]*)"', resolve_body))
    display_literals = set(re.findall(r'"([^"]*)"', display_body))

    if not REQUIRED_SPELLINGS <= resolve_literals:
        print(f"BLIND  GetUnitTypeId no longer mentions {sorted(REQUIRED_SPELLINGS - resolve_literals)}")
        print("       the parse succeeded but the vocabulary looks wrong -- refusing to pass.")
        return 2

    failures: list[str] = []

    # 1 -- accepted but unmapped => converted number printed with an unconverted label
    missing = sorted(resolve_literals - display_literals)
    if missing:
        failures.append(
            "accepted by GetUnitTypeId but not mapped in _displayUnit "
            f"(FormatUnit would echo the raw string): {missing}"
        )

    # 2 -- invented units. "" is the internal-units state and is display-side only.
    extra = sorted(display_literals - resolve_literals - {""})
    if extra:
        failures.append(f"_displayUnit maps units GetUnitTypeId rejects: {extra}")

    # 3 -- superscripts. Parse `case "a": case "b": return "X";` groups.
    canonical: dict[str, str] = {}
    for labels, out in re.findall(
        r"((?:\s*case\s*\"[^\"]*\"\s*:)+)\s*return\s*\"([^\"]*)\"\s*;", display_body
    ):
        for lit in re.findall(r'case\s*"([^"]*)"', labels):
            canonical[lit] = out

    for lit, want in REQUIRED_SUPERSCRIPTS.items():
        got = canonical.get(lit)
        if got != want:
            failures.append(f'_displayUnit("{lit}") -> {got!r}, expected {want!r}')

    for lit, out in canonical.items():
        if re.fullmatch(r"[A-Za-z]+\d", out):
            failures.append(f'_displayUnit("{lit}") returns {out!r} -- digit, not superscript')

    if failures:
        for f in failures:
            print(f"  DRIFT  {f}")
        print(f"\n{len(failures)} drift item(s) -- FormatUnit output would mislabel a value.")
        return 1

    print(
        f"  ok      unit display map is complete: {len(resolve_literals)} spellings accepted, "
        f"{len(canonical)} mapped to canonical suffixes (areas/volumes superscript)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
