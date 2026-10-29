"""Is every built assembly actually a PE file?

WHY THIS EXISTS (2026-10-29)
    `build-addin.ps1` stopped building with FORTY errors, thirty-nine of which said:

        error CS0246: The type or namespace name 'CoreScript' could not be found

    ...in `Paracore.PackSdk`, which had not changed. The real error was the first one:

        CSC : error CS0009: Metadata file '...\\obj\\Release\\...\\ref\\CoreScript.Engine.dll'
              could not be opened -- The parameter is incorrect.

    One unreadable reference assembly makes a whole namespace vanish for every dependent
    project, so the compiler reports the SYMPTOM in five files and the CAUSE in one line —
    and the one line is easy to scroll past.

    What was actually wrong: four assemblies on disk were ZERO-FILLED at the same instant
    (06:52:39) — `bin/Release/.../CoreScript.Engine.dll` (367,616 B), `obj/Release/.../
    CoreScript.Engine.dll`, and both `ref/` and `refint/` copies (99,328 B). Every byte was
    0x00, so the file had the right LENGTH and the wrong CONTENT. `ls` looked fine.

    ⚠ A zero-filled file of exactly the right size is the signature of a write that never
      landed — a killed build, a crash, or a sync client materialising a placeholder. It is
      NOT a compile error, so no amount of reading the C# would find it.

    So: check the first two bytes. A .NET assembly, a native DLL and an EXE all begin with
    `MZ` (0x4D 0x5A). Anything else under bin/ or obj/ is a broken artifact.

⚠ AN EMPTY SCAN FAILS. If no assemblies are found at all, the tree was never built and this
  gate has lost its subject — that must not read as "all good".

USAGE
    python scripts/check-build-artifacts.py
"""

import os
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

PROJECTS = [
    "CoreScript.Engine",
    "Paracore.Addin",
    "Paracore.PackSdk",
    "Paracore.Server",
    "Paracore.Shim",
]

MZ = b"MZ"


def main() -> int:
    checked = 0
    bad = []

    for proj in PROJECTS:
        root = os.path.join(REPO, proj)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            # only build output — never the source tree
            if f"{os.sep}obj" not in dirpath and f"{os.sep}bin" not in dirpath:
                continue
            for name in filenames:
                if not name.lower().endswith(".dll"):
                    continue
                path = os.path.join(dirpath, name)
                checked += 1
                try:
                    with open(path, "rb") as fh:
                        head = fh.read(2)
                except OSError as exc:
                    bad.append((path, "unreadable", str(exc)))
                    continue
                if head != MZ:
                    size = os.path.getsize(path)
                    when = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%H:%M:%S")
                    bad.append((path, f"first bytes {head.hex() or '<empty>'}",
                                f"{size:,} B  {when}"))

    if checked == 0:
        print("GATE FAILED: no .dll found under any project's bin/ or obj/.")
        print("            Nothing has been built, so this gate proves nothing.")
        return 1

    print(f"  assemblies checked : {checked}")
    if bad:
        print(f"  NOT PE FILES       : {len(bad)}")
        for path, why, detail in bad:
            print(f"    ✗ {os.path.relpath(path, REPO)}")
            print(f"        {why}   {detail}")
        print()
        print("  ⇒ A zero-filled assembly is a write that never landed. Delete these files and")
        print("    rebuild; do NOT read the C#. Expect the real error to be the FIRST CS0009,")
        print("    not the many CS0246 lines that follow it.")
        return 1

    print("  every built assembly starts with MZ  OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
