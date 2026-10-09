"""Run the Paracore MCP compliance gate locally, so a probe can be fixed before it is sent.

The MCP server refuses code that trips its anti-pattern checks. Running the same
checks here turns a rejected round-trip into a one-line diagnostic.

usage: python .repl/check_compliance.py <file.cs> [<file2.cs> ...]
"""
import os
import re
import sys

sys.path.insert(0, r"C:\Users\seyou\Paracore\paracore-gen")

from mcp_core.tool_helpers import (  # noqa: E402
    _ANTI_PATTERNS,
    check_dangerous_patterns,
    check_paracore_compliance,
    check_suspicious_param_names,
    sanitize_csharp_code,
)

for path in sys.argv[1:]:
    code = open(path, encoding="utf-8").read()
    print("=" * 90)
    print(path)

    clean = sanitize_csharp_code(code)
    if clean != code:
        print("  sanitize_csharp_code CHANGED the code")

    for label, res in (
        ("paracore_compliance", check_paracore_compliance(clean)),
        ("dangerous_patterns", check_dangerous_patterns(clean)),
        ("suspicious_names", check_suspicious_param_names(clean)),
    ):
        print(f"  {label:20s}: {'OK' if not res else 'VIOLATION'}")
        if res:
            print("     " + str(res).strip().replace("\n", "\n     ")[:1500])

    # Which individual anti-pattern regexes match?
    hits = [(p, msg) for p, msg in _ANTI_PATTERNS if re.search(p, clean, re.IGNORECASE | re.DOTALL)]
    if hits:
        print("  matching anti-pattern regexes:")
        for p, msg in hits:
            print(f"     /{p}/")
            print(f"        -> {msg[:180]}")
