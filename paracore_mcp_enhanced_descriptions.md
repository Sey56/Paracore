# Paracore MCP — Enhanced Tool Descriptions
> Drop-in replacements for the existing tool `description` fields in the MCP server config.
> All descriptions were validated against a live Revit 2025 model (RevitAPI 25.2.0.0).

---

## 1. `_ping` — Enhanced Description

```
Verify the Paracore MCP server is alive and connected to Revit.
ALWAYS call this first at the start of every session.

OUTPUT: Returns the connection status AND a mandatory quick-start
cheat sheet. Read the cheat sheet before writing any code.

CHEAT SHEET (returned alongside "pong"):

  GLOBALS — use exactly these names, no alternatives:
    Doc          → Autodesk.Revit.DB.Document  (NOT doc, NOT ActiveDocument)
    ActiveView   → Current View (e.g. ViewPlan)
    Selection    → List<Element> of currently selected elements

  QUERY — use Paracore methods, NOT raw Revit API:
    GetElements("Walls")         → PipelineEnumerable<Element> by category string
    GetElements<Wall>()          → typed retrieval (same result, strongly typed)

  OUTPUT — always use these, never foreach+Println loops for data:
    .Table()                     → renders a markdown table (first 5 rows + total)
    .GroupByParam("param")       → group & count, chain .Table() directly
    .Select(e => new { ... })    → project columns, always put Id first, then .Table()
    Println("text")              → single line text output

  ELEMENT METHODS:
    e.GetStr("Parameter Name")   → string value
    e.GetNum("Parameter Name", "mm") → numeric value in given unit
    e.CombinedParams()           → all parameters on element

  WRITE (execute_dynamic_query only — auto-transacted):
    e.SetVal("Comments", "Done")
    e.SetNum("Offset", -150, "mm")
    GetElements("Walls").SetParam("Comments", "Done")
    Transact("name", () => { /* foreach with writes */ })

  ❌ NEVER USE (raw Revit API — always rejected):
    new FilteredElementCollector(...)
    doc  /  ActiveDocument  /  activeDocument
    doc.ProjectInformation  →  use  Doc.ProjectInformation
    .WhereElementIsNotElementType()
    .OfCategory(BuiltInCategory.OST_...)

FAILURE: If the server is not running, this tool will not be available
at all (the MCP client will report a connection error).
```

---

## 2. `_explore_revit_data` — Enhanced Description

```
Execute a READ-ONLY C# snippet in Revit to explore model data.
Use this to DISCOVER parameter names, check element counts, verify
values, or inspect schema — anything that DOES NOT modify the model.

Do NOT use this for modifications — use execute_dynamic_query for writes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED: CALL _ping FIRST on every new session to load the cheat sheet.
PREFERRED: CALL _search_schema("Category") before querying a category
           to know exact parameter names.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GLOBALS (must use exactly):
  Doc            → active Document  (NOT doc, NOT ActiveDocument)
  ActiveView     → current View
  Selection      → List<Element> of selected elements

QUERY PATTERNS (copy-paste safe):
  // Count elements
  GetElements("Walls").Count()

  // Filter by parameter value
  GetElements("Walls").WhereParam("Base Constraint", "Level 1")

  // Table output — always include Id as first column
  GetElements("Doors")
      .Select(e => new {
          Id     = e.Id.IntegerValue,
          Level  = e.GetStr("Level"),
          Width  = e.GetNum("Width", "mm")
      })
      .Table()

  // Group and count
  GetElements("Walls").GroupByParam("Base Constraint").Table()

  // Project info
  Doc.ProjectInformation.Name
  Doc.ProjectInformation.Number
  Doc.Title
  Doc.PathName
  Doc.IsWorkshared

❌ FORBIDDEN — will always be rejected with an error:
  new FilteredElementCollector(Doc)...
  doc  (lowercase) — use Doc
  ActiveDocument   — use Doc
  .WhereElementIsNotElementType()
  .OfCategory(BuiltInCategory.OST_...)
  SetVal / SetNum / Delete / Transact   (write ops — use execute_dynamic_query)

OUTPUT: Summarized results — tables show first 5 rows + total count,
text output shows first 10 lines. Empty results return "No results found".

FAILURE: Returns a structured error with type, line number, and suggested
fix. Common failures:
  • Wrong parameter name → run _search_schema("Category") first
  • Using raw FilteredElementCollector → use GetElements() instead
  • lowercase doc → use Doc
  • Write operation in read-only mode → move to execute_dynamic_query
```

---

## 3. `_execute_dynamic_query` — Enhanced Description

```
Execute C# in Revit — supports both reads AND writes.
Use this ONLY after discovery is complete (run _explore_revit_data
and _search_schema first to confirm element counts and parameter names).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW:
  1. _ping           → confirm connection + read cheat sheet
  2. _search_schema  → get exact parameter names
  3. _explore_revit_data → verify targets exist + preview data
  4. _execute_dynamic_query → apply the change
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GLOBALS (must use exactly):
  Doc            → active Document  (NOT doc, NOT ActiveDocument)
  ActiveView     → current View
  Selection      → List<Element> of selected elements

WRITE OPERATIONS (auto-transacted — do NOT wrap in Transact()):
  // Single element
  element.SetVal("Comments", "Reviewed")
  element.SetNum("Offset", -150, "mm")
  element.Delete()
  element.Hide()
  element.Unhide()
  element.Isolate()

  // Collection bulk (one transaction, most efficient)
  GetElements("Walls").SetParam("Comments", "Done")
  GetElements("Walls").Delete()

  // Manual foreach with writes — MUST wrap in Transact():
  Transact("Set Comments", () => {
      foreach (var e in GetElements("Walls").WhereParam("Base Constraint","Level 1")) {
          e.SetVal("Comments", "Ground Floor");
      }
  });

READ OPERATIONS (same as _explore_revit_data — all patterns valid):
  GetElements("Walls").GroupByParam("Base Constraint").Table()
  GetElements("Doors").Select(e => new { Id = e.Id.IntegerValue, ... }).Table()

❌ FORBIDDEN — will always be rejected:
  new FilteredElementCollector(Doc)...
  doc  (lowercase) — use Doc
  ActiveDocument   — use Doc

OUTPUT: Tables (first 5 rows + total), text (first 10 lines).
Write operations return a confirmation message with affected element count.

FAILURE: Structured error with type, line number, and suggested fix.
Self-correct up to 3 times. Common failures:
  • Wrong parameter name → run _search_schema first
  • foreach with writes missing Transact() → wrap in Transact("name", () => {...})
  • Chaining .Select() after .GroupByParam() → chain .Table() directly instead
```

---

## 4. `_search_schema` — Enhanced Description

```
Fast parameter schema lookup for a Revit category.
Use this INSTEAD of _explore_revit_data when you just need to know
what parameters exist — it's faster and cheaper than running live C#.

PREFERRED for parameter discovery before any query or write.
Results are cached in memory — instant on subsequent calls for the
same category.

'category_name' is a Revit category string.
Common values: "Rooms", "Walls", "Doors", "Floors", "Ceilings",
"Windows", "Structural Columns", "Structural Framing", "Ducts", "Pipes",
"Levels", "Grids", "Stairs", "Railings", "Curtain Panels".

OUTPUT: Compact list of parameter names with storage types
(String, Double, Integer, ElementId) and scope (Instance / Type).

  ⚠️  Copy ONLY the parameter name — do NOT include [String] or [Double]
      annotations in your code. Parameter names are case-sensitive.

After getting parameter names, use them in queries like:
  GetElements("Walls").WhereParam("Base Constraint", "Level 1").Table()
  GetElements("Walls").Select(e => new {
      Id             = e.Id.IntegerValue,
      BaseConstraint = e.GetStr("Base Constraint"),
      Height         = e.GetNum("Unconnected Height", "mm")
  }).Table()

FAILURE: If the category is not found, try _explore_revit_data with
  GetElements("YourCategory").FirstOrDefault().CombinedParams().Table()
to discover available parameter names directly from a live element.
```

---

## 5. `_read_extension_methods` — Enhanced Description

```
Look up the EXACT syntax, parameters, and usage of all Paracore
extension methods. Call this BEFORE writing any code to load the full
method catalog — it's the equivalent of reading the docs before coding.

CALL WITH NO ARGUMENTS to get the full reference:
  _read_extension_methods()   ← correct

  ⚠️  query is an OPTIONAL keyword-only parameter.
      Do NOT pass it as a positional argument.
      _read_extension_methods("GetStr")   ← WRONG — causes a TypeError
      _read_extension_methods()           ← CORRECT for full reference

The full reference covers: GetStr, GetNum, GetElements, WhereParam,
GroupByParam, Table, Select, SetVal, SetNum, SetParam, CombinedParams,
Delete, Hide, Unhide, Isolate, BarGraph, and more.

OUTPUT: Markdown reference with method signatures, parameter
descriptions, and usage examples.

FAILURE: Always available — no network or Revit dependency.
```

---

## 6. Recommended New Tool: `_get_globals` (ADD THIS)

```
Returns the complete list of globally available variables, types,
and namespaces pre-imported in the Paracore script engine.

Use this when you are unsure what globals are available, or to
verify exact type names before writing C# code.

Call with no arguments.

OUTPUT example:
  GLOBALS:
    Doc          → Autodesk.Revit.DB.Document
    ActiveView   → Autodesk.Revit.DB.View (current active view)
    Selection    → System.Collections.Generic.List<Autodesk.Revit.DB.Element>
    Println      → void Println(string)
    GetElements  → PipelineEnumerable<Element> GetElements(string category)
                   PipelineEnumerable<T> GetElements<T>()
    Transact     → void Transact(string name, Action body)

  PRE-IMPORTED NAMESPACES:
    Autodesk.Revit.DB
    Autodesk.Revit.DB.Architecture
    Autodesk.Revit.DB.Structure
    System.Linq
    System.Collections.Generic

FAILURE: Always available — no network or Revit dependency.
```

---

## Summary of Changes

| Tool | Change Type | Reason |
|---|---|---|
| `_ping` | 🔴 Enhanced | Add cheat sheet to response — primes LLM context immediately |
| `_explore_revit_data` | 🔴 Enhanced | Add forbidden patterns + copy-paste query examples |
| `_execute_dynamic_query` | 🔴 Enhanced | Add workflow order, Transact rule, forbidden patterns |
| `_search_schema` | 🟡 Enhanced | Add usage-to-query examples after schema lookup |
| `_read_extension_methods` | 🔴 Fixed | Clarify `query` is keyword-only, not positional |
| `_get_globals` | 🟢 New tool | Expose all globals + pre-imported namespaces explicitly |

---

## Bonus: Recommended `_ping` Response Payload Change

Instead of returning just `"pong"`, return a structured object:

```json
{
  "status": "pong",
  "revit_version": "2025",
  "api_version": "25.2.0.0",
  "active_document": "Paracore_Demo.rvt",
  "active_view": "Level 5",
  "quick_start": "GLOBALS: Doc | ActiveView | Selection | GetElements() | Println() | Transact(). NEVER use: doc / ActiveDocument / new FilteredElementCollector(). Call _get_globals() for full reference."
}
```

This way an LLM always gets grounding context without a separate tool call.
