"""
Which MCP exes are stale relative to the sources on disk?

⚠⚠ WHY THIS EXISTS. The MCP servers are FROZEN PyInstaller exes, so a `.py` or `.md` edit does
NOTHING until the exe is rebuilt AND the rebuilt exe is actually installed. On 2026-10-27 two
separate builds sat in `dist/` while the installed copies were two days old — `paracore-gen.exe`
(26,660,137 B in dist, 26,614,685 B installed) and `Paracore.Addin.dll`. A raw byte grep cannot
see into the compressed PKG at all (it returns 0 for text that IS present — verified 2026-10-02).

⚠⚠ TWO ARCHIVES, TWO METHODS — this is the part that is easy to get wrong.
    * DATA files (`*.md` via --add-data) are individual entries in the outer CArchive: they can
      be extracted and BYTE-COMPARED against the source.
    * PYTHON modules are NOT in the outer archive. They are compiled to bytecode inside a nested
      `PYZ.pyz`, so a filename lookup for `mcp_core/tool_helpers.py` finds NOTHING — and a
      checker that stops there reports "clean" for a file it never opened. (The first version of
      this script did exactly that.) For a module, open the PYZ, extract the module's code
      object, and probe it for a SENTINEL string that only the current source contains.

    the rule — an exe is STALE if it carries a version of a file that has since changed.
    a file that is NOT in the exe is not a dependency, and is reported as "not bundled".

⚠ An empty scan FAILS: no exes, an unreadable archive, or a TOC too small to trust means the
reader did not work — not that everything is current.

    python scripts\\check-mcp-exes.py
    python scripts\\check-mcp-exes.py --exe path\\to\\some.exe

Exit 0 = every installed exe matches its sources. Exit 1 = at least one is stale.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import tempfile

ECOSYSTEM = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CORE = os.path.join(ECOSYSTEM, "paracore", "mcp", "mcp_core")
FORGE = os.path.join(ECOSYSTEM, "paracore-forge")

# (suffix in the bundle, source on disk, module name or None for a data file, sentinel)
TRACKED = [
    # ── data files: byte-compared ──────────────────────────────────────────────
    # ⚠ RETARGETED 2026-10-27: this was `mcp_core/prompts/script-rules.md`. That file was
    #   DELETED with the rest of the dead prompt set — nothing read it, and tracking it here
    #   only proved the installer still shipped dead weight. `globals.md` is the data file
    #   that IS read (`get_globals` → `paracore://globals`), so it is what this watches now.
    ("mcp_core/prompts/globals.md", os.path.join(CORE, "prompts", "globals.md"), None, None),
    ("forge_core/prompts/script-rules.md", os.path.join(FORGE, "forge_core", "prompts", "script-rules.md"), None, None),
    # ── python modules: sentinel-probed in the PYZ ─────────────────────────────
    # ⚠ Each sentinel is a string that ONLY the current source contains. It proves "this build
    #   includes the edit", not "every line matches" — a rebuild that carried the string but not
    #   the behaviour is not caught by this. That is what the unit tests and live probes are for.
    (
        "mcp_core/tool_helpers.py",
        os.path.join(CORE, "tool_helpers.py"),
        "mcp_core.tool_helpers",
        # ⚠ RETARGETED 2026-10-27 (round 3) — the round-2 sentinel was in the exes built at
        #   10:27, so this gate called them "current" while the sources were 22 minutes newer
        #   (edited 10:48–10:50). Third time these anchors have rotted: a sentinel only proves
        #   the build has the edit it was written for. Retarget, never delete.
        #   This string is the `_head_sections` trailer — round 3's truncation fix.
        # ⚠ RETARGETED AGAIN 2026-10-27 (round 5): round 5 rewrote the error messages that
        #   pointed at `paracore://system-prompt` — a RESOURCE Claude Desktop never reads —
        #   to name the `_read_extension_methods` TOOL, and corrected the four messages that
        #   called it `read_extension_methods`, a tool that does not exist. The round-3
        #   `_head_sections` trailer is untouched by that edit and would still pass, so it
        #   cannot prove a round-5 build. This literal is round-5 only.
        "TOOL for the complete method catalog",
    ),
    (
        "mcp_core/tools.py",
        os.path.join(CORE, "tools.py"),
        "mcp_core.tools",
        # ⚠ RETARGETED 2026-10-27 (round 4): the ping cheat-sheet gained a TRUNCATION
        #   section explaining which tables are never cut vs capped at 50. The round-3
        #   sentinel `Id = e.Id.Value` is still in the source, so it cannot distinguish a
        #   round-4 build from a round-3 one. This string is round-4 only.
        # ⚠ RETARGETED AGAIN 2026-10-27 (round 5): the schema usage example stopped being a
        #   fixed template and is now DERIVED from the parameter rows above it — the template
        #   named `Level`, which Walls do not have, and `GetStr` returns "" for a missing name
        #   so the advice silently produced a blank column. `TRUNCATION` is untouched by that
        #   edit and would still pass, so it cannot prove a round-5 build. This docstring is
        #   round-5 only.
        "built from the parameters this category actually has",
    ),
    (
        "mcp_core/summarizer.py",
        os.path.join(CORE, "summarizer.py"),
        "mcp_core.summarizer",
        # ⚠ RETARGETED 2026-10-27 (round 4): the summarizer now exempts cap-exempt tables
        #   (schema/discovery) from the 50-row cap. The header for an exempt table says
        #   "shown in full" — a string the pre-round-4 summarizer never produced. The
        #   round-2 sentinel about "FIRST and LAST lines" is still present, so it could
        #   not distinguish a round-4 build.
        # ⚠ RETARGETED AGAIN 2026-10-27 (round 5): floats now render at 12 significant digits,
        #   so `3.0000000000000004` reads `3`, and the TOTALS line uses the same formatter
        #   instead of `%.2f`. `shown in full` is untouched by that edit and would still pass,
        #   so it cannot prove a round-5 build. This docstring is round-5 only.
        "BINARY-FLOAT NOISE removed",
    ),
    (
        "mcp_core/server.py",
        os.path.join(CORE, "server.py"),
        "mcp_core.server",
        # ⚠ RETARGETED 2026-10-27 (round 4): `create_server` gained `omit_common` so the
        #   gen domain can drop `pick_object` from its tool surface. The round-3 sentinel
        #   "with a trailer saying where it stopped" is still in the source, so it could
        #   not distinguish a round-4 build. `omit=omit_common` is round-4 only.
        "omit=omit_common",
    ),
    (
        "forge_server.py",
        os.path.join(FORGE, "forge_server.py"),
        "forge_server",
        "Creating over an existing tool is REFUSED, with no override.",
    ),
    (
        "forge_core/scaffold.py",
        os.path.join(FORGE, "forge_core", "scaffold.py"),
        "forge_core.scaffold",
        "NOTHING was replaced",
    ),
]


def installed_exes() -> list[str]:
    """The copies the MCP client actually launches — see ~/.workbuddy-ai/mcp.json."""
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    return sorted(
        p
        for p in glob.glob(os.path.join(appdata, "paracore-data", "mcp-servers", "*.exe"))
        if "unins" not in os.path.basename(p).lower()
    )


def dist_for(exe: str) -> str | None:
    name = os.path.basename(exe)
    candidate = os.path.join(ECOSYSTEM, name[: -len(".exe")], "dist", name)
    return candidate if os.path.isfile(candidate) else None


def describe(path: str) -> str:
    import datetime

    st = os.stat(path)
    return f"{st.st_size:,} B  {datetime.datetime.fromtimestamp(st.st_mtime):%Y-%m-%d %H:%M:%S}"


def consts_contain(code, needle: str) -> bool:
    """
    Does this code object (or any nested one) carry `needle` as a constant?

    ⚠⚠ RECURSE INTO CONTAINERS, NOT JUST CODE OBJECTS. `_AGENT_FILE_POLICY` is a list of
    tuples, and CPython folds that into ONE tuple constant — so a scan that only looked at
    `str` constants and nested code objects missed every message in it and reported the
    current build as STALE. Measured 2026-10-27: `paracore-gen/dist` (built 3 min after the
    edit) was called stale for `tool_helpers.py` while its `tools.py` — whose sentinel is a
    plain docstring — passed. The difference was the container, not the build.
    """
    seen: set[int] = set()

    def scan(value) -> bool:
        if isinstance(value, str):
            return needle in value
        if isinstance(value, (tuple, list, frozenset, set)):
            # A constant container can be self-referential only via a code object, which the
            # id guard below covers; this is cheap insurance against a pathological literal.
            if id(value) in seen:
                return False
            seen.add(id(value))
            return any(scan(item) for item in value)
        if isinstance(value, dict):
            if id(value) in seen:
                return False
            seen.add(id(value))
            return any(scan(k) or scan(v) for k, v in value.items())
        if hasattr(value, "co_consts"):
            if id(value) in seen:
                return False
            seen.add(id(value))
            return any(scan(const) for const in value.co_consts)
        return False

    return scan(code)


def open_pyz(reader, names: list[str]):
    """Extract the nested PYZ to a temp file and open it. Returns (reader, temp_path) or (None, None)."""
    from PyInstaller.archive.readers import ZlibArchiveReader

    entry = next((n for n in names if n.lower().endswith(".pyz")), None)
    if entry is None:
        return None, None
    data = reader.extract(entry)
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pyz")
    try:
        handle.write(data)
        handle.close()
        return ZlibArchiveReader(handle.name), handle.name
    except Exception:  # noqa: BLE001 - caller reports it; the temp file is cleaned up here
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise


def check(exe: str) -> tuple[bool, list[str]]:
    from PyInstaller.archive.readers import CArchiveReader

    name = os.path.basename(exe)
    problems: list[str] = []
    print(f"{name}")
    print(f"  installed : {describe(exe)}")

    dist = dist_for(exe)
    if dist:
        print(f"  dist/     : {describe(dist)}")
        # ⚠ Not a bare mtime comparison: a copy sets the destination's mtime a second or two
        #   later, which made the first version warn "built but never installed" on exes that
        #   were byte-identical. A SIZE difference is decisive and clock-independent.
        size_differs = os.path.getsize(dist) != os.path.getsize(exe)
        newer_by = os.path.getmtime(dist) - os.path.getmtime(exe)
        if size_differs or newer_by > 120:
            print("              ⚠ the dist build differs from the installed copy — built but never installed")

    try:
        reader = CArchiveReader(exe)
    except Exception as exc:  # noqa: BLE001
        print(f"  ⚠ could not open the archive: {exc}")
        return False, [f"{name}: archive unreadable"]

    toc = getattr(reader, "toc", None) or getattr(reader, "_toc")
    names = [str(n) for n in toc]
    if len(names) < 50:
        print(f"  ⚠ only {len(names)} TOC entries — the reader did not work, so this proves nothing")
        return False, [f"{name}: TOC too small"]

    pyz, pyz_path = None, None
    try:
        pyz, pyz_path = open_pyz(reader, names)
        pyz_toc = (getattr(pyz, "toc", None) or pyz._toc) if pyz else {}

        stale = 0
        examined = 0
        for suffix, source, module, sentinel in TRACKED:
            if not os.path.isfile(source):
                continue

            if module is None:
                entry = next((n for n in names if n.replace("\\", "/").endswith(suffix)), None)
                if entry is None:
                    continue  # not a dependency of this server
                examined += 1
                data = reader.extract(entry)
                with open(source, "rb") as fh:
                    on_disk = fh.read()
                if data == on_disk:
                    print(f"  {suffix:38} ok      {len(data):,} B (byte-identical)")
                else:
                    stale += 1
                    problems.append(f"{name}: {suffix} is STALE")
                    print(f"  {suffix:38} ⚠ STALE exe={len(data):,} B  disk={len(on_disk):,} B")
            else:
                if not pyz or module not in pyz_toc:
                    continue  # module not bundled — not a dependency
                examined += 1
                if consts_contain(pyz.extract(module), sentinel):
                    print(f"  {suffix:38} ok      sentinel present")
                else:
                    stale += 1
                    problems.append(f"{name}: {suffix} is STALE (sentinel absent)")
                    print(f"  {suffix:38} ⚠ STALE sentinel absent")

        if examined == 0:
            # ⚠ Say it. "Nothing to compare" must never be mistaken for "all good".
            print("  (bundles none of the tracked files — nothing to compare)")
        # ⚠ "stale" is a fact about this file; "rebuild" is not always the fix. `dist/` may
        #   already hold a current build, in which case only an install is needed — so the
        #   verdict states the finding and leaves the action to the reader.
        print(f"  => {'STALE — this copy must be replaced' if stale else 'current'}\n")
        return stale == 0, problems
    finally:
        if pyz_path:
            try:
                os.unlink(pyz_path)
            except OSError:
                pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", action="append", help="check this exe instead of the installed set")
    args = ap.parse_args()

    exes = args.exe or installed_exes()
    if not exes:
        print("FAIL: no MCP exes found to check.")
        print("      Looked in %APPDATA%\\paracore-data\\mcp-servers\\*.exe")
        print("      An empty set is a broken scan, not a clean one — pass --exe to check one directly.")
        return 1

    problems: list[str] = []
    for exe in exes:
        _ok, found = check(exe)
        problems.extend(found)

    if problems:
        print(f"{len(problems)} stale item(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("all installed MCP exes match the sources on disk")
    return 0


if __name__ == "__main__":
    sys.exit(main())
