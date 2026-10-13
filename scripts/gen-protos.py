#!/usr/bin/env python3
r"""Generate every copy of the Revit wire contract from the ONE authority.

WHY THIS EXISTS
    `paracore/protos/corescript.proto` is the single authority for the Revit wire contract.
    The consumers, and how each one gets it:

      * `Paracore.Addin` / `Paracore.Server` (C#) — MSBuild compiles the authority DIRECTLY
        (`<Protobuf Include="$(ProtoRoot)\corescript.proto">`). No copy exists, so these cannot
        drift, and this tool deliberately does not touch them.
      * `corescript-vscode/proto/corescript.proto` — a runtime COPY. It ships inside the `.vsix`
        and is loaded by `@grpc/proto-loader`, so it cannot simply point at `../protos` on a
        user's machine. A copy CAN drift, and it did: found on 2026-10-09 at three fields and
        three months behind the authority.
      * the five MCP repos (`paracore-gen` / `paracore-forge` / `paracore-takeoff` /
        `paracore-model` / `paracore-family`) — each USED to check in a GENERATED
        `corescript_pb2*.py`. None had a generator script, so regenerating was an undocumented
        manual step, and the only script that did regenerate stubs wrote them into
        `rap-server/server/`, a directory with no consumer at all.
        ⚠ Since 2026-10-13 the stubs live ONCE, in the shared MCP core at `paracore/mcp/`, and
        every MCP (plus the desktop sidecar) imports them from there — so there is ONE target.

    So: ONE authority, and every other artifact is GENERATED from it by this tool.

⚠⚠ TWO KINDS OF COMPARISON, DELIBERATELY DIFFERENT
    The VS Code copy is a VERBATIM COPY, so it is compared BYTE for BYTE.
    The Python stubs are GENERATED CODE, so they are compared by CONTRACT — read from their own
    protobuf `FileDescriptor` — never by bytes. Regenerating with a different `grpcio-tools` or
    `protobuf` build changes only a version header (`# Protobuf Python Version: 6.31.1` vs
    `6.31.0`, `GRPC_GENERATED_VERSION = '1.76.0'` vs `'1.75.1'`) while the contract is identical.
    Rewriting nine files across three repos for that would be pure churn, and it would bury a
    real contract change in noise. `--force` exists for when you genuinely want a toolchain bump.

⚠ A stale proto fails SILENTLY. Protobuf tolerates unknown and missing fields, so nothing
  throws: the caller reads a default and behaves as if the answer were "no". That is why this
  is a gate and not a report.

⚠ Requires a python with BOTH `grpcio-tools` (to regenerate) and `protobuf` (to read a
  descriptor). The `rap-server` venv qualifies; the managed python does not.

USAGE
    python gen-protos.py --check          # contract gate; exit 1 on any drift
    python gen-protos.py --write          # fix drift: copy the proto, regenerate drifted stubs
    python gen-protos.py --write --force  # regenerate every stub regardless (toolchain bump)
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

PARACORE = Path(r"C:\Users\seyou\Paracore\paracore")
SIB = PARACORE.parent

PROTO_DIR = PARACORE / "protos"
AUTHORITY = PROTO_DIR / "corescript.proto"
VSCODE_COPY = PARACORE / "corescript-vscode" / "proto" / "corescript.proto"
VSCODE_LABEL = "corescript-vscode/proto/corescript.proto"

# ⚠⚠ ONE place checks in a stub now: the SHARED MCP CORE at `paracore/mcp/`.
#   Until 2026-10-13 all five MCP repos checked in their own copy, which is why the note
#   below used to read "add every new engine-driving MCP repo the day it is created" — five
#   copies of a generated wire contract is five chances to be stale, and three of them WERE.
#   The core is imported, not copied, so a stub that drifts is now impossible.
# ⚠ A repo that checks in a stub but is ABSENT here is neither written nor checked — an
#   ungated drift surface. Keep this list to the single shared core.
STUB_REPOS = [
    ("paracore/mcp (the shared MCP core)", SIB / "paracore" / "mcp"),
]

STUB_FILES = ("corescript_pb2.py", "corescript_pb2_grpc.py", "corescript_pb2.pyi")

FIELD_RE = re.compile(r"^\s*(optional\s+|repeated\s+)?([A-Za-z_][\w.]*)\s+([A-Za-z_]\w*)\s*=\s*(\d+)\s*;")
MSG_RE = re.compile(r"^\s*message\s+([A-Za-z_]\w*)\s*\{")
RPC_RE = re.compile(r"^\s*rpc\s+([A-Za-z_]\w*)\s*\(")

# Runs inside a subprocess: import one repo's own stub and dump its descriptor as JSON.
# A subprocess per repo, so the module name `corescript_pb2` cannot collide between repos.
_PROBE = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
import corescript_pb2 as pb2
fd = pb2.DESCRIPTOR
msgs = {}
for m in fd.message_types_by_name.values():
    msgs[m.name] = {str(f.number): ["", "", f.name] for f in m.fields}
rpcs = sorted(m.name for s in fd.services_by_name.values() for m in s.methods)
print(json.dumps({"messages": msgs, "rpcs": rpcs}))
"""


def parse_proto(text: str):
    """(messages, rpcs) — messages: {name: {field_number: (prefix, type, name)}}, rpcs: {name}."""
    messages: dict[str, dict[int, tuple[str, str, str]]] = {}
    rpcs: set[str] = set()
    stack: list[str | None] = []      # None = inside a service/enum, not a message
    for raw in text.splitlines():
        line = raw.split("//")[0]
        m = MSG_RE.match(line)
        if m:
            stack.append(m.group(1))
            messages.setdefault(m.group(1), {})
            continue
        r = RPC_RE.match(line)
        if r:
            rpcs.add(r.group(1))
        f = FIELD_RE.match(line)
        if f and stack and stack[-1] is not None:
            prefix, ftype, fname, fnum = f.groups()
            messages[stack[-1]][int(fnum)] = ((prefix or "").strip(), ftype, fname)
        if "{" in line and not m:
            stack.append(None)
        if "}" in line and stack:
            stack.pop()
    return messages, rpcs


def read_descriptor(repo: Path):
    """One repo's view of the contract, read from its generated FileDescriptor."""
    out = subprocess.run(
        [sys.executable, "-c", _PROBE, str(repo)],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        tail = out.stderr.strip().splitlines()
        raise RuntimeError(tail[-1] if tail else "probe failed")
    data = json.loads(out.stdout)
    msgs = {name: {int(n): tuple(v) for n, v in fields.items()}
            for name, fields in data["messages"].items()}
    return msgs, set(data["rpcs"])


def compare(want, got) -> list[str]:
    """Human-readable contract differences between two (messages, rpcs) pairs."""
    wmsg, wrpc = want
    gmsg, grpc_ = got
    out: list[str] = []

    for name in sorted(set(wmsg) - set(gmsg)):
        out.append(f"MESSAGE MISSING ENTIRELY: {name}")
    for name in sorted(set(gmsg) - set(wmsg)):
        out.append(f"EXTRA message not in the authority: {name}")

    for name in sorted(set(wmsg) & set(gmsg)):
        wf, gf = wmsg[name], gmsg[name]
        for num in sorted(set(wf) - set(gf)):
            out.append(f"{name} MISSING field {num} ({wf[num][2]})")
        for num in sorted(set(gf) - set(wf)):
            out.append(f"{name} EXTRA field {num} ({gf[num][2]})")
        for num in sorted(set(wf) & set(gf)):
            if wf[num][2] != gf[num][2]:
                out.append(f"{name} field {num} NAME differs ({wf[num][2]!r} vs {gf[num][2]!r})")

    for name in sorted(wrpc - grpc_):
        out.append(f"RPC MISSING: {name}")
    for name in sorted(grpc_ - wrpc):
        out.append(f"EXTRA RPC: {name}")
    return out


def scan(want) -> list[dict]:
    """Every target that disagrees with the authority. Read-only."""
    findings: list[dict] = []

    if not VSCODE_COPY.is_file():
        findings.append({"label": VSCODE_LABEL, "kind": "copy",
                         "diffs": ["file missing"], "target": VSCODE_COPY})
    elif AUTHORITY.read_bytes() != VSCODE_COPY.read_bytes():
        diffs = compare(want, parse_proto(VSCODE_COPY.read_text(encoding="utf-8")))
        findings.append({"label": VSCODE_LABEL, "kind": "copy",
                         "diffs": diffs or ["bytes differ (no contract change)"],
                         "target": VSCODE_COPY})

    for label, repo in STUB_REPOS:
        if not (repo / "corescript_pb2.py").is_file():
            findings.append({"label": label, "kind": "stub",
                             "diffs": ["stub missing"], "target": repo})
            continue
        try:
            got = read_descriptor(repo)
        except Exception as exc:  # noqa: BLE001
            findings.append({"label": label, "kind": "stub",
                             "diffs": [f"descriptor unreadable: {exc}"], "target": repo})
            continue
        diffs = compare(want, got)
        if diffs:
            findings.append({"label": label, "kind": "stub", "diffs": diffs, "target": repo})
    return findings


def regen_stub(repo: Path) -> None:
    """Regenerate one repo's `corescript_pb2*.py` in place from the authority."""
    cmd = [
        sys.executable, "-m", "grpc_tools.protoc",
        f"-I{PROTO_DIR}",
        f"--python_out={repo}",
        f"--grpc_python_out={repo}",
        f"--pyi_out={repo}",
        str(AUTHORITY),
    ]
    subprocess.run(cmd, check=True, cwd=str(PARACORE))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    ap.add_argument("--write", action="store_true", help="fix drift")
    ap.add_argument("--force", action="store_true",
                    help="with --write: regenerate every stub, not only the drifted ones")
    args = ap.parse_args()
    if not (args.check or args.write):
        ap.error("pass --check or --write")

    if not AUTHORITY.is_file():
        print(f"FAIL: authority missing: {AUTHORITY}")
        return 2

    want = parse_proto(AUTHORITY.read_text(encoding="utf-8"))
    n_fld = sum(len(f) for f in want[0].values())
    print(f"authority: {AUTHORITY.name} — {len(want[0])} messages, {n_fld} fields, "
          f"{len(want[1])} RPCs\n")

    findings = scan(want)
    for f in findings:
        print(f"  STALE   {f['label']}")
        for d in f["diffs"]:
            print(f"            {d}")

    if not args.write:
        for label, _ in STUB_REPOS:
            if not any(f["label"] == label for f in findings):
                print(f"  ok      {label}")
        if not any(f["label"] == VSCODE_LABEL for f in findings):
            print(f"  ok      {VSCODE_LABEL}")
        print()
        if findings:
            print(f"DRIFT: {len(findings)} target(s) behind the authority — run --write")
            return 1
        print("every copy agrees with the authority")
        return 0

    # --write
    if not findings and not args.force:
        print("nothing to do — every copy already agrees with the authority")
        return 0

    for f in findings:
        if f["kind"] == "copy":
            VSCODE_COPY.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(AUTHORITY, VSCODE_COPY)
            print(f"  WROTE   {f['label']}")
        else:
            regen_stub(f["target"])
            print(f"  WROTE   {f['label']} ({', '.join(STUB_FILES)})")

    if args.force:
        for label, repo in STUB_REPOS:
            if not any(f["label"] == label and f["kind"] == "stub" for f in findings):
                regen_stub(repo)
                print(f"  WROTE   {label} (forced)")

    print()
    left = scan(want)
    if left:
        print(f"STILL DRIFTED after --write: {len(left)} target(s)")
        for f in left:
            print(f"  {f['label']}")
            for d in f["diffs"]:
                print(f"    {d}")
        return 1
    print("wrote; every copy now agrees with the authority")
    return 0


if __name__ == "__main__":
    sys.exit(main())
