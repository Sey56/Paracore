# Agent & MCP End-to-End Test Checklist

## Pre-requisites
- [ ] Revit running with Paracore Addin loaded
- [ ] rap-server running (`python run_server.py` or via Tauri)
- [ ] rap-web Tauri app open (for UI agent tests)
- [ ] Claude Desktop configured with Paracore MCP server (for MCP tests)
- [ ] A Revit model with at least: 10+ rooms, 20+ walls, 5+ doors, 3+ levels

---

## A. PARACORE UI AGENT TESTS (rap-web)

### A1: Basic Query — List Elements
- [ ] In Agent tab, type: `List all rooms`
- [ ] Agent generates `GetElements<Room>()` code
- [ ] Click "Approve & Run"
- [ ] Chat shows preview: first 10 rooms with total count
- [ ] Agent's final response includes sample rows + count
- [ ] Analytics tab shows `[table]` flash badge

---

### A2: Table Query — Formatted Data
- [ ] Type: `Show all rooms with Id, Name, Area (m²), and Level in a table`
- [ ] Agent generates `.Select(...).Table()` code
- [ ] Approve & Run
- [ ] Chat shows **properly formatted table** with cell spacing, headers, row dividers
- [ ] Preview shows first 10 rows + total count
- [ ] Agent's message: "Here are the first 10 of N rooms..."
- [ ] Full table visible in **Analytics tab**

---

### A3: Schema Discovery — search_schema Tool
- [ ] Start a new chat (Clear Session)
- [ ] Type: `What parameters do Structural Columns have? Show me the column types.`
- [ ] Agent should call `search_schema("Structural Columns")` — **NOT** `explore_revit_data`
- [ ] Agent receives parameter list (names + storage types)
- [ ] Agent uses this info in its explanation

---

### A4: Schema Discovery Fallback
- [ ] Type: `Show me parameter Type/Instance classification of Walls`
- [ ] Agent calls `search_schema("Walls")` first
- [ ] Agent generates appropriate query using the discovered params

---

### A5: Error Self-Correction
- [ ] Type: `WALLS with COMPLEX filter asking for non-existent param`
  - Or type: `Set walls color to red` (which should fail)
- [ ] Agent generates code → Approve → Code fails
- [ ] Chat shows **rose-colored error block** with error details + retry count: `(retry 1/3)`
- [ ] Agent **automatically retries** with corrected code (new tool call)
- [ ] Either succeeds or retries up to 3 times then explains failure

---

### A6: Error — 3-Retry Limit
- [ ] Force a scenario where 3 attempts fail (e.g., intentionally bad query)
- [ ] After 3rd failure, agent says "I've tried 3 times..." and explains issue
- [ ] No infinite loop

---

### A7: Large Dataset (10+ elements → summarizer)
- [ ] Type: `List ALL elements in the model`
- [ ] Agent generates code → returns thousands of items
- [ ] Chat preview: **10 rows max** + total count
- [ ] No raw JSON dumps in chat
- [ ] Agent response uses summarized data, not raw output

---

### A8: Graph Query
- [ ] Type: `Show a bar chart of door counts per level`
- [ ] Agent generates `.GroupByParam("Level").Select(...).BarGraph()` code
- [ ] Chart renders in Analytics tab
- [ ] Agent response mentions chart was rendered

---

### A9: Write Operation
- [ ] Type: `Mark all rooms on Level 1 with comments "Level 1 Review"`
- [ ] Agent generates code with `.WhereParam().SetParam()`
- [ ] Approve & Run
- [ ] Verify rooms in Revit actually have the comment set
- [ ] Agent confirms success

---

### A10: Home/About Overlay
- [ ] Open Agent tab
- [ ] Click the 🏠 Home icon in TopBar
- [ ] WelcomeGate overlay appears showing brand + capabilities
- [ ] "Back to Workspace" button dismisses it (no sign-in buttons visible)
- [ ] Works when signed in with Google AND "Continue Offline"

---

### A11: Save As in REPL Playground
- [ ] In REPL Playground, type some C# code: `GetElements<Wall>().Count()`
- [ ] Click Save (💾) → saves as `MyReplSnippet.cs`
- [ ] Click Save As (📤) → prompts for new filename → saves as new file
- [ ] Both buttons disabled when REPL is empty

---

### A12: Agent View Persistence
- [ ] While on Agent tab, restart the app (close/reopen Tauri)
- [ ] App should restore to Agent tab (not default to Automation)
- [ ] WelcomeGate NOT shown (already authenticated)
- [ ] Chat messages preserved in localStorage

---

## B. MCP CLIENT TESTS (Claude Desktop / VS Code Cline)

### B1: Tool Discovery
- [ ] Verify these tools are available:
  - [ ] `ping`
  - [ ] `explore_revit_data`
  - [ ] `execute_dynamic_query`
  - [ ] `search_schema`

### B2: ping
- [ ] Ask Claude: `ping the Paracore MCP server`
- [ ] Returns `"pong"`

---

### B3: explore_revit_data — Basic
- [ ] Ask Claude: `How many walls are in the Revit model?`
- [ ] Claude calls `explore_revit_data` with `GetElements<Wall>().Count()`
- [ ] Returns numeric count (not raw JSON dump)
- [ ] Output is summarized

---

### B4: explore_revit_data — Large Result
- [ ] Ask: `List ALL elements in the model`
- [ ] Claude calls MCP tool
- [ ] Returns **summarized output** (first 10 rows + total count if table, first 10 lines if text)
- [ ] No raw JSON arrays in response
- [ ] Claude presents data as numbered list with totals

---

### B5: execute_dynamic_query — Table
- [ ] Ask: `Show all rooms with Id, Name, Area (m2), and Level in a table`
- [ ] Claude generates `.Select(...).Table()` code
- [ ] Returns summarized table (first 10 rows + total)
- [ ] Claude notes total count and says "full data requires Paracore native app"

---

### B6: search_schema
- [ ] Ask: `What parameters are available on Walls?`
- [ ] Claude calls `search_schema("Walls")` — **fast, no REPL execution**
- [ ] Returns parameter list with names, storage types, Type/Instance classification
- [ ] First call may take 1-2s (gRPC), subsequent calls for same category are instant (cached)

---

### B7: search_schema — Cache Hit
- [ ] After B6, ask: `What about Walls again? List the wall parameters.`
- [ ] Claude calls `search_schema("Walls")` again
- [ ] Response is instant (no gRPC call needed)
- [ ] Same data returned

---

### B8: Resource Loading
- [ ] Ask Claude to read `paracore://repl-guide`
- [ ] Returns full REPL guide content
- [ ] Second read is instant (cached in memory)

---

### B9: Resource Loading — extension-methods
- [ ] Ask Claude to read `paracore://extension-methods`
- [ ] Returns full extension methods reference
- [ ] Second read is instant

---

### B10: No UI References in MCP Output
- [ ] Ask Claude to run any query that returns a table
- [ ] Response should NOT say "go to the UI" or "view in the Paracore app"
- [ ] Response should center on what Claude can present (sample rows + totals)
- [ ] Tool description mentions full data requires Paracore native app

---

### B11: Graph Query via MCP
- [ ] Ask: `Create a pie chart of doors per level`
- [ ] Claude generates `.GroupByParam().PieGraph()` code
- [ ] Tool returns summary: "A piegraph with 3 data points was rendered."
- [ ] Claude acknowledges chart was rendered but cannot display it

---

## C. STRESS / EDGE CASE TESTS

### C1: Rapid Consecutive Queries
- [ ] Send 5 queries in quick succession (e.g., rooms, walls, doors, floors, ceilings)
- [ ] All complete without errors
- [ ] Schema cache warms up — later queries faster

---

### C2: Empty Result
- [ ] Query: `Find all doors on Level 99` (assuming no Level 99 exists)
- [ ] Agent returns appropriate "no elements found" message
- [ ] No error thrown

---

### C3: Concurrent Agent + MCP
- [ ] Run a query in rap-web Agent tab
- [ ] Simultaneously run a query in Claude Desktop via MCP
- [ ] Both complete without interference
- [ ] Schema cache shared between both paths

---

### C4: Document Switch
- [ ] Close current Revit model, open a different one
- [ ] Run `search_schema("Rooms")` in MCP or agent
- [ ] Schema cache should re-fetch for new document (or return fallback)

---

### C5: Non-existent Category
- [ ] Query: `search_schema("KlingonBirds")` (non-existent category)
- [ ] Returns graceful "No parameters found" message
- [ ] No crash or unhandled exception

---

### C6: Very Long REPL Code
- [ ] Have agent generate a very complex query with many chained operations
- [ ] Code displays properly in chat (scrollable, syntax highlighted)
- [ ] Copy button works

---

## Results Summary

| Section | Total | Passed | Failed |
|---|---|---|---|
| A: Paracore UI Agent | 12 | __ | __ |
| B: MCP Client | 11 | __ | __ |
| C: Stress / Edge | 6 | __ | __ |
| **Total** | **29** | __ | __ |
