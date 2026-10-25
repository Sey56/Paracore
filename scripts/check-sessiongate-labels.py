#!/usr/bin/env python3
"""
GATE: the SessionGate consent dialog must stay INVISIBLE to the dialog watcher.

⚠⚠ WHY (measured 2026-10-19)
   The watcher answers any modal dialog whose buttons intersect KEEP_LABELS or
   DISCARD_LABELS. SessionGate used `TaskDialogCommonButtons.Ok | Cancel` — "OK" is
   in KEEP_LABELS — so decide() rule 1 pressed OK and the gate approved ITSELF. The
   prompt was decoration: it never asked the operator anything.

   The first fix is to give the dialog captions the watcher does not know. Then
   dialog_watcher.scan_dialogs() drops it at the label test, BEFORE decide() is
   reached, and only a human can answer it.

⚠⚠ THE SECOND LAYER (added 2026-10-25, measured again at 17:59)
   The caption trick only protects the add-in build that carries it. A stale installed
   add-in still offers OK/Cancel, and the watcher pressed it — approving the session
   with no human in the loop. So the watcher now also refuses by TITLE:
   `HUMAN_ONLY_MARKERS` in dialog_watcher.py. This gate asserts BOTH layers agree:
   every caption is unrecognised AND the dialog's title matches a marker.

⚠ THIS GATE ASSERTS THE CHOICE, NOT A TOTAL. It checks every effective caption, every
  common button and the resolved title, so renaming ONE caption to "OK" — or renaming
  the dialog — fails here instead of silently re-arming auto-approval in the field,
  where nothing would error.

⚠ AN EMPTY SCAN FAILS. A gate that finds no captions and reports success is not a
  gate — it is a green light that survives the code being deleted.

Usage:
    python scripts/check-sessiongate-labels.py
    python scripts/check-sessiongate-labels.py --cs <path> --watcher <path>
"""
import argparse
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The ONLY TaskDialogCommonButtons member that emits no button. Every other member
# is a label the watcher recognises (Ok/Yes -> KEEP, Cancel/No/Close -> KEEP/DISCARD).
NO_BUTTON = "None"

LINK_RE = re.compile(
    r"AddCommandLink\(\s*TaskDialogCommandLinkId\.CommandLink\d+\s*,\s*"
    r'(?:(?P<ident>[A-Za-z_]\w*)|(?P<lit>"(?:[^"\\]|\\.)*"))\s*\)'
)
CONST_RE = re.compile(
    r'\bconst\s+string\s+(?P<name>[A-Za-z_]\w*)\s*=\s*(?P<lit>"(?:[^"\\]|\\.)*")\s*;'
)
COMMON_RE = re.compile(r"TaskDialogCommonButtons\.(\w+)")

# `new TaskDialog(title)` / `new TaskDialog("...")`
TITLE_RE = re.compile(
    r'new\s+TaskDialog\(\s*(?:(?P<ident>[A-Za-z_]\w*)|(?P<lit>"(?:[^"\\]|\\.)*"))\s*\)'
)
# `const string X = "..."` and `string X = "..."` — superset of CONST_RE.
STRING_VAR_RE = re.compile(
    r'\bstring\s+(?P<name>[A-Za-z_]\w*)\s*=\s*(?P<lit>"(?:[^"\\]|\\.)*")\s*;'
)


def fail(msg):
    print("FAIL  " + msg)
    return False


def load_watcher_constants(path):
    """Read the label lists and the human-only markers out WITHOUT importing it."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    wanted = ("KEEP_LABELS", "DISCARD_LABELS", "HUMAN_ONLY_MARKERS")
    found = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in wanted:
                found[target.id] = [str(s).strip().lower()
                                    for s in ast.literal_eval(node.value)]
    return found


def csharp_unescape(lit):
    """Strip the surrounding quotes and the C# escapes we actually use."""
    body = lit[1:-1]
    return body.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")


def effective_captions(source):
    """Every caption a command link will actually display, consts resolved."""
    consts = {m.group("name"): csharp_unescape(m.group("lit"))
              for m in CONST_RE.finditer(source)}
    out, unresolved = [], []
    for m in LINK_RE.finditer(source):
        if m.group("lit"):
            out.append(csharp_unescape(m.group("lit")))
            continue
        name = m.group("ident")
        if name in consts:
            out.append(consts[name])
        else:
            unresolved.append(name)
    return out, unresolved


def effective_title(source):
    """The TaskDialog title as it will be shown, local/const strings resolved."""
    strings = {m.group("name"): csharp_unescape(m.group("lit"))
               for m in STRING_VAR_RE.finditer(source)}
    m = TITLE_RE.search(source)
    if not m:
        return None
    if m.group("lit"):
        return csharp_unescape(m.group("lit"))
    return strings.get(m.group("ident"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cs", default=str(ROOT / "Paracore.Addin" / "Services" / "SessionGate.cs"))
    ap.add_argument("--watcher", default=str(ROOT / "mcp" / "mcp_core" / "dialog_watcher.py"))
    args = ap.parse_args()

    cs_path, watcher_path = Path(args.cs), Path(args.watcher)
    ok = True

    for p in (cs_path, watcher_path):
        if not p.is_file():
            return 0 if fail("missing input: %s" % p) else 1

    constants = load_watcher_constants(watcher_path)
    keep = set(constants.get("KEEP_LABELS") or [])
    discard = set(constants.get("DISCARD_LABELS") or [])
    markers = constants.get("HUMAN_ONLY_MARKERS") or []
    if not keep or not discard:
        return 0 if fail("could not read KEEP_LABELS/DISCARD_LABELS from %s" % watcher_path) else 1
    recognised = keep | discard

    source = cs_path.read_text(encoding="utf-8")

    # 1 — no common button at all. Any of them is a label the watcher knows.
    commons = COMMON_RE.findall(source)
    if not commons:
        ok = fail("no TaskDialogCommonButtons set — expected `= TaskDialogCommonButtons.%s`"
                  % NO_BUTTON) and ok
    for member in commons:
        if member != NO_BUTTON:
            ok = fail("CommonButtons uses `%s` — that emits a button the watcher presses"
                      % member) and ok
    if commons and all(m == NO_BUTTON for m in commons):
        print("PASS  CommonButtons = %s (emits no watcher-recognised label)" % NO_BUTTON)

    # 2 — every command link resolves, and there are at least two (allow + block).
    captions, unresolved = effective_captions(source)
    for name in unresolved:
        ok = fail("command-link caption `%s` is not a string const — cannot verify it" % name) and ok
    if len(captions) < 2:
        ok = fail("found %d command link(s) — expected at least 2 (allow + block)"
                  % len(captions)) and ok

    # 3 — the choice: every caption must be outside both label sets.
    for cap in captions:
        norm = cap.strip().lower()
        if norm in recognised:
            which = "KEEP_LABELS" if norm in keep else "DISCARD_LABELS"
            ok = fail('caption "%s" is in %s — the watcher WILL answer this dialog'
                      % (cap, which)) and ok
        else:
            print('PASS  caption "%s" is outside KEEP_LABELS and DISCARD_LABELS' % cap)

    # 4 — the second layer: the dialog's TITLE must still match a human-only marker.
    if not markers:
        ok = fail("HUMAN_ONLY_MARKERS is empty or missing in %s — the watcher would "
                  "answer the consent gate again" % watcher_path) and ok
    else:
        print("PASS  watcher declares %d human-only marker(s): %s"
              % (len(markers), ", ".join('"%s"' % m for m in markers)))

    title = effective_title(source)
    if title is None:
        ok = fail("could not resolve the TaskDialog title in %s" % cs_path) and ok
    elif markers:
        norm_title = title.strip().lower()
        hit = next((m for m in markers if m in norm_title), None)
        if hit:
            print('PASS  dialog title "%s" matches marker "%s"' % (title, hit))
        else:
            ok = fail('dialog title "%s" matches NO human-only marker — the watcher '
                      'would answer the consent gate again' % title) and ok

    # 5 — DefaultButton must be assigned AFTER the command links exist.
    #   ⚠⚠ MEASURED 2026-10-25 18:33: with `DefaultButton = TaskDialogResult.CommandLink2`
    #   in the object initializer, Revit threw at Show() time —
    #     ArgumentException: "Corresponding button not found. Parameter name: defaultButton"
    #   because it validates the value against the buttons ALREADY ADDED, and
    #   AddCommandLink had not run yet. The gate never appeared AND every agent call
    #   failed closed. Nothing about the captions or the title looks wrong.
    initializer = re.search(r"new\s+TaskDialog\(.*?\}\s*;", source, re.S)
    default_at = source.find("DefaultButton")
    last_link_at = source.rfind("AddCommandLink")
    if default_at == -1:
        ok = fail("no DefaultButton at all — deny-by-default is lost") and ok
    else:
        if initializer and "DefaultButton" in initializer.group(0):
            ok = fail("DefaultButton is set INSIDE the TaskDialog initializer — Revit "
                      "validates it against the buttons already added and throws "
                      "'Corresponding button not found'") and ok
        elif last_link_at == -1 or default_at < last_link_at:
            ok = fail("DefaultButton is assigned BEFORE the command links exist — the "
                      "dialog will throw instead of showing") and ok
        else:
            print("PASS  DefaultButton is assigned after the command links")

    if ok:
        print("\nSessionGate is invisible to the dialog watcher: %d caption(s) and the "
              "title verified." % len(captions))
        return 0
    print("\nThe consent dialog would be answered by the watcher instead of the operator.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
