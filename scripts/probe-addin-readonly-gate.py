"""Prove the ADD-IN's read-only gate refuses a raw transaction.

WHY THIS EXISTS
    `mcp_core.tool_helpers.check_read_only_violation` refuses these snippets before they
    leave the MCP, so going through an MCP proves nothing about the add-in: the request
    never reaches Revit. This calls gRPC DIRECTLY with execution_mode="read_only" and no
    MCP in the path — exactly the caller that `ReplHandler._writePatterns` exists to stop.

    ⚠ Against the OLD DLL this reports REACHED REVIT for every canary. That is the
      finding (measured 2026-10-27 by a pre-release review: `new Transaction` +
      `Parameter.Set` ran inside explore_revit_data), not a bug in the probe.

SAFETY
    No canary executes a write: each one builds a delegate that is never invoked. If the
    gate leaks, the snippet compiles and runs and still touches nothing. Testing a
    substring scan does not require performing the substring.

USAGE
    python scripts/probe-addin-readonly-gate.py
    (Revit running, a model open, the new add-in installed)
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mcp"))

from grpc_client import execute_repl, probe_connection  # noqa: E402

CANARIES = {
    "new Transaction(...)": 'Func<Transaction> make = () => new Transaction(Doc, "probe");',
    "Parameter.Set(...)": ('var p = GetElements("Walls").First().LookupParameter("Comments");\n'
                           "Action w = () => p.Set(p.AsString());"),
    "Doc.Delete(...)": "Func<ElementId, ICollection<ElementId>> del = id => Doc.Delete(id);",
}

# ⚠ The file policy, tested the same way: each canary CONTAINS the pattern inside a
#   delegate that is never invoked, so a leak compiles and runs and still writes nothing.
FILE_CANARIES = {
    "File.WriteAllText": ('Action w = () => File.WriteAllText(p, text);', True),
    "File.Delete": ('Action w = () => File.Delete(p);', True),
    "RestSharp": ('Action w = () => { var c = new RestSharp.RestClient(u); };', True),
    "FileMode.CreateNew": ('Action w = () => { using (var f = new FileStream(p, '
                           'FileMode.CreateNew)) { } };', False),
}


def main() -> int:
    probe = probe_connection()
    print(f"connected: {probe['paracore_connected']}  reachable: {probe['server_reachable']}")
    if not probe["paracore_connected"]:
        print("Revit is not reachable — start it and open a model first.")
        return 2

    fails = []
    print("\nread-only gate (explore_revit_data):")
    for label, code in CANARIES.items():
        r = execute_repl(code, "addin-gate-probe", execution_mode="read_only",
                         source="paracore_agent", timeout=30)
        refused = bool(r.get("read_only_violation"))
        print(f"  {label:22s} -> {'REFUSED' if refused else 'REACHED REVIT'}")
        if not refused:
            fails.append(label)

    print("\nagent file policy (write path):")
    for label, (code, want_refused) in FILE_CANARIES.items():
        r = execute_repl(code, "addin-policy-probe", execution_mode="read_write",
                         source="paracore_agent", timeout=30)
        refused = "agent file policy" in (r.get("error_message") or "")
        ok = refused == want_refused
        print(f"  {label:22s} -> {'REFUSED' if refused else 'allowed'}"
              f"  {'OK' if ok else 'WRONG'}")
        if not ok:
            fails.append(label)

    print("\nRESULT:", "add-in gate holds" if not fails else f"GATE LEAKS: {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
