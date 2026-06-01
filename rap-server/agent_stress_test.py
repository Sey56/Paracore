"""
Agent Stress Test Suite — covers summarizer, schema cache, prompt integrity,
MCP resources, and edge cases. Run with: python agent_stress_test.py
"""
import json
import sys
import os

# Ensure rap-server/server is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "server"))

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name}  -- {detail}")


# ─────────────────────────────────────────────────────────────
# 1. SUMMARIZER TESTS
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("1. SUMMARIZER (agent/summarizer.py)")
print("=" * 60)

from agent.summarizer import summarize, shield_tool_return


# 1a: Small table (≤5 rows) — all rows shown
print("\n  1a: Small table")
data = [{"Id": 1, "Name": "Room A", "Area_m2": 25.0} for _ in range(3)]
result = summarize({"structuredOutput": [
    {"type": "table", "data": json.dumps(data), "title": "Rooms"}
]})
check("Contains title", "Rooms" in result)
check("Contains header", "| Id" in result and "| Name" in result)
check("Contains all 3 rows", result.count("|") >= 3 * 3)
check("No 'more rows' message", "more rows" not in result.lower())
check("No UI reference", "in the UI" not in result and "analytics tab" not in result.lower())

# 1b: Large table (10,000 rows) — 5 shown + total
print("\n  1b: Large table (10K rows)")
data = [{"Id": i, "Name": f"Wall_{i}", "Length_m": 2.5 + i * 0.1} for i in range(10000)]
result = summarize({"structuredOutput": [
    {"type": "table", "data": json.dumps(data), "title": "All Walls"}
]})
check("Shows 5 rows", result.count("| Wall_") == 5)
check("Total count visible", "10000 rows" in result)
check("More rows message", "more rows" in result.lower())
check("Under 500 chars", len(result) < 500, f"got {len(result)}")
check("No UI reference", "in the UI" not in result and "analytics tab" not in result.lower())

# 1c: Empty table
print("\n  1c: Empty table")
result = summarize({"structuredOutput": [
    {"type": "table", "data": json.dumps([]), "title": "Empty"}
]})
check("Reports empty", "empty" in result.lower())

# 1d: Text output (few lines)
print("\n  1d: Short text output")
result = summarize({"structuredOutput": [], "output": "Line 1\nLine 2\nLine 3"})
check("Full text shown", "Line 1" in result and "Line 3" in result)
check("No truncation", "more lines" not in result.lower())

# 1e: Text output (many lines)
print("\n  1e: Long text output (50 lines)")
text = "\n".join([f"Element {i}: Wall - Generic 200mm" for i in range(50)])
result = summarize({"structuredOutput": [], "output": text})
check("First 10 shown", "Element 0" in result and "Element 9" in result)
check("Element 11 NOT shown", "Element 11" not in result, f"unexpected: {result[:100]}")
check("Truncation message", "more lines" in result.lower())

# 1f: Chart output
print("\n  1f: Chart output")
result = summarize({"structuredOutput": [
    {"type": "bargraph", "data": json.dumps([{"x": "A"}, {"x": "B"}, {"x": "C"}]), "title": "Door Count"}
]})
check("Chart type mentioned", "bargraph" in result.lower())
check("Data point count", "3 data points" in result)
check("No UI reference", "UI" not in result)

# 1g: Pie chart
print("\n  1g: Pie chart")
result = summarize({"structuredOutput": [
    {"type": "piegraph", "data": json.dumps([{"Label": "A", "Value": 10}]), "title": "Distribution"}
]})
check("Chart type mentioned", "piegraph" in result.lower())

# 1h: Mix of table + chart + text
print("\n  1h: Mixed output (table + chart + text)")
result = summarize({
    "structuredOutput": [
        {"type": "table", "data": json.dumps([{"A": 1}, {"A": 2}]), "title": "Data"},
        {"type": "linegraph", "data": json.dumps([{"x": 0, "y": 1}]), "title": "Trend"},
    ],
    "output": "Processed 2 items.\nDone."
})
check("Table present", "Data" in result)
check("Chart present", "linegraph" in result.lower())
check("Text output present", "Processed" in result)

# 1i: Completely empty result
print("\n  1i: Empty result")
result = summarize({})
check("Fallback message", "no structured output" in result.lower() or "EXECUTION SUCCESSFUL" in result)

# 1j: CamelCase key (structuredOutput vs structured_output)
print("\n  1j: snake_case keys")
result = summarize({"structured_output": [
    {"type": "table", "data": json.dumps([{"X": 1}]), "title": "Test"}
]})
check("snake_case accepted", "Test" in result)

# 1k: shield_tool_return (history reconstruction)
print("\n  1k: shield_tool_return")
short = shield_tool_return("small result", "execute_dynamic_query")
check("Short text passthrough", short == "small result")
# Generate text > 1000 chars (only triggers shield above 1000)
big_table = {"data": list(range(500)), "type": "table"}
large_text = json.dumps(big_table)
check("Text is >1000 chars", len(large_text) > 1000, f"got {len(large_text)}")
shielded = shield_tool_return(large_text, "execute_dynamic_query")
check("Large text shielded", len(shielded) < len(large_text), f"got {len(shielded)} vs {len(large_text)}")
check("Shielded mentions rows", "rows" in shielded.lower(), f"got: {shielded[:100]}")
check("No UI reference in shield", "UI" not in shielded)

# ─────────────────────────────────────────────────────────────
# 2. PROMPT INTEGRITY TESTS
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("2. PROMPT INTEGRITY (agent/prompt.py)")
print("=" * 60)

from agent.prompt import SYSTEM_PROMPT

required_sections = [
    ("Identity", "You are Paracore"),
    ("execute_dynamic_query", "execute_dynamic_query"),
    ("explore_revit_data", "explore_revit_data"),
    ("search_schema mentioned", "search_schema"),
    ("STEP 1 Discovery", "STEP 1"),
    ("STEP 2 Execution", "STEP 2"),
    ("STEP 3 Final Answer", "STEP 3"),
    ("Self-correction header", "SELF-CORRECTION"),
    ("Retry limit 3", "up to 3 times"),
    ("Error: unit missing", "GetNum"),
    ("Error: null reference", "First()?.GetStr"),
    ("Error: wrong method", "LookupParameter"),
    ("Error: raw API", "FilteredElementCollector"),
    ("Globals:", "Doc"),  # check for Doc (backtick-wrapped in prompt)
    ("Implicit output", "Implicit output"),
    ("No foreach", "foreach"),
    ("Table rules", "Select()"),  # prompt says ALWAYS Select() first
    ("Graph methods", "BarGraph"),
    ("Key accessors", "GetStr"),
    ("Unit conversion", "InputUnit"),
    ("Transactions", "Transact"),
    ("paracore://extension-methods", "paracore://extension-methods"),
]

for label, keyword in required_sections:
    check(f"Prompt has: {label}", keyword in SYSTEM_PROMPT, f"missing '{keyword}'")

check("Prompt under 8000 chars", len(SYSTEM_PROMPT) < 8000, f"got {len(SYSTEM_PROMPT)}")
check("No emoji headers", "🏗️" not in SYSTEM_PROMPT and "🔧" not in SYSTEM_PROMPT)

# 2b: Verify STEP 1 promotes search_schema over combined params
print("\n  2b: STEP 1 prioritizes search_schema")
check("search_schema is primary discovery",
      "search_schema" in SYSTEM_PROMPT.split("STEP 1")[1].split("STEP 2")[0],
      "STEP 1 should mention search_schema as primary")

# ─────────────────────────────────────────────────────────────
# 3. SCHEMA CACHE TESTS
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("3. SCHEMA CACHE (services/schema_cache.py)")
print("=" * 60)

import services.schema_cache as sc

# 3a: Cache starts empty
print("\n  3a: Initial state")
check("Starts empty", len(sc._cache) == 0)
check("No populated categories", sc._populated_categories is not None)

# 3b: Populate a known category (mock test — will fail gracefully if no Revit)
print("\n  3b: search_schema with no Revit (graceful fallback)")
result = sc.search_schema("NonExistentCategory12345")
check("Returns fallback message", "No parameters found" in result or "Schema search failed" in result)

# 3c: clear_cache
print("\n  3c: clear_cache")
sc._cache["test"] = [{"name": "Test", "storage_type": "String", "is_type": False}]
sc.clear_cache()
check("Cache cleared", len(sc._cache) == 0)

# ─────────────────────────────────────────────────────────────
# 4. MCP RESOURCE CACHE
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("4. MCP RESOURCE CACHE (mcp/mcp_server.py)")
print("=" * 60)

try:
    import mcp.mcp_server as mcp_srv
    mcp_available = True
except ImportError as e:
    print(f"  [SKIP] MCP package not available: {e}")
    mcp_available = False

if mcp_available:
    # 4a: Cache variables exist
    print("\n  4a: Cache globals exist")
    check("_CACHED_SYSTEM_PROMPT exists", hasattr(mcp_srv, "_CACHED_SYSTEM_PROMPT"))
    check("_CACHED_REPL_GUIDE exists", hasattr(mcp_srv, "_CACHED_REPL_GUIDE"))
    check("_CACHED_EXTENSION_METHODS exists", hasattr(mcp_srv, "_CACHED_EXTENSION_METHODS"))

    # 4b: Resources load (system prompt from agent.prompt)
    print("\n  4b: System prompt resource")
    result = mcp_srv.read_system_prompt()
    check("Returns string", isinstance(result, str) and len(result) > 100)
    check("Contains Paracore", "Paracore" in result)
    check("Cached after first call", mcp_srv._CACHED_SYSTEM_PROMPT is not None)

    # 4c: REPL guide resource (will fail gracefully if path wrong in test)
    print("\n  4c: REPL guide resource")
    result = mcp_srv.read_repl_guide()
    check("Returns string", isinstance(result, str))
    check("Non-empty", len(result) > 100, f"got {len(result)} chars")

    # 4d: Extension methods resource
    print("\n  4d: Extension methods resource")
    result = mcp_srv.read_extension_methods()
    check("Returns string", isinstance(result, str))
    check("Non-empty", len(result) > 100, f"got {len(result)} chars")

# ─────────────────────────────────────────────────────────────
# 5. AGENT TOOL DEFINITIONS
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("5. AGENT TOOLS (agent/v4_repl_agent.py)")
print("=" * 60)

try:
    from agent.v4_repl_agent import v4_repl_agent
    agent_tools_available = True
except ImportError as e:
    print(f"  [SKIP] pydantic_ai not available: {e}")
    agent_tools_available = False

if agent_tools_available:
    tool_names = [t.name for t in v4_repl_agent._tools]
    print(f"  Tools available: {tool_names}")
    check("Has execute_dynamic_query", "execute_dynamic_query" in tool_names)
    check("Has explore_revit_data", "explore_revit_data" in tool_names)
    check("Has search_schema", "search_schema" in tool_names)
    check("Exactly 3 tools", len(tool_names) == 3, f"got {len(tool_names)}")

    # 5b: Verify search_schema tool args
    print("\n  5b: search_schema tool schema")
    schema_tool = next((t for t in v4_repl_agent._tools if t.name == "search_schema"), None)
    check("search_schema exists", schema_tool is not None)
    if schema_tool:
        desc = schema_tool.description or ""
        check("Description mentions cache", "cache" in desc.lower())

# ─────────────────────────────────────────────────────────────
# 6. END-TO-END DATA FLOW SIMULATION
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("6. SIMULATED DATA FLOW (no Revit)")
print("=" * 60)

# Simulate: GetElements<Room>().Select(...).Table() → summarizer → final text
rooms = [
    {"Id": 743405, "Name": "Circulation 39", "Area_m2": 35.87, "Level": "Level 0"},
    {"Id": 743412, "Name": "Reception 40", "Area_m2": 44.26, "Level": "Level 0"},
    {"Id": 743436, "Name": "Cafe 41", "Area_m2": 98.11, "Level": "Level 0"},
    {"Id": 743939, "Name": "Toilets 42", "Area_m2": 34.95, "Level": "Level 0"},
    {"Id": 744299, "Name": "Kitchen 43", "Area_m2": 36.84, "Level": "Level 0"},
    {"Id": 744300, "Name": "Office 44", "Area_m2": 22.10, "Level": "Level 0"},
]
# Simulate what the frontend sends as raw_output_for_summary
payload = {
    "structuredOutput": [{"type": "table", "data": json.dumps(rooms), "title": "All Rooms"}],
    "output": "Found 6 rooms."
}
summary = summarize(payload)
print(f"  Summary ({len(summary)} chars):")
for line in summary.split("\n")[:6]:
    print(f"    {line}")

check("First room visible", "Circulation 39" in summary)
check("Last room NOT visible", "Office 44" not in summary, f"unexpected: {summary[:50]}")
check("Total count", "6 rows" in summary)
check("5 shown", "first 5" in summary)
check("More rows message", "1 more rows" in summary)

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed}")
print("=" * 60)

if failed > 0:
    sys.exit(1)
else:
    print("All tests passed!")
