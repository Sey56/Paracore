# Paracore execution model — live-verified learnings

Everything on this page was either (a) executed live in Revit through `paracore-gen.exe`
on 2026-09-23 (model: `Paracore_Tutorial`, addin 1.27.2), or (b) verified statically in
source. Each item says which. Tooling for both lives in this folder.

## Tooling (this folder)

| File | Purpose |
|---|---|
| `mcp_client.py` | stdio JSON-RPC client for `paracore-gen.exe`. `code --file x.cs --out out.txt` (read-only) / `code --rw --file x.cs --out out.txt` (write). **Always write output to a file** — PowerShell mangles stdout. |
| `check_compliance.py` | Runs the MCP server's own gates locally (`sanitize_csharp_code`, `check_paracore_compliance`, `check_dangerous_patterns`, `check_suspicious_param_names`) and prints exactly which regex matched. Run this BEFORE sending code — saves a round trip. |
| `live_probe1.cs` | Read-only idiom probe — PASSED live. |
| `live_probe2.cs` | Write idiom probe (`--rw`) — PASSED live. |
| `live_probe3.cs` | DWA-row access probe — compiles, but runtime-blocked by the license gate (see below). |

Run pattern:

```powershell
$py='C:\Users\seyou\AppData\Local\Programs\Python\Python312\python.exe'
& $py '.repl\check_compliance.py' '.repl\your_script.cs'          # pre-flight
& $py '.repl\mcp_client.py' code --file '.repl\your_script.cs' --out '.repl\out.txt' 2>$null
```

## The compliance gate = the "what to avoid" catalog

Source: `C:\Users\seyou\Paracore\paracore-gen\mcp_core\tool_helpers.py` (`_ANTI_PATTERNS`,
`check_paracore_compliance`). It is a set of regexes over the **whole submission text —
comments included** (learned live: a comment spelling out the ft↔mm factor was rejected).
It is also NOT syntax-aware: the regexes match anywhere, so never write the forbidden
tokens even in prose.

| Blocked pattern | Use instead |
|---|---|
| `new FilteredElementCollector(` | `GetElements<T>()` (typed) / `GetElements("Category")` |
| `.LookupParameter(`, `.get_Parameter(` | `.GetStr("Name")`, `.GetNum("Name", "unit")`, `.GetVal("Name")` |
| hardcoded unit math (`* 304.8`, `/ 304.8`, `* 0.3048`, `/ 12.0`) | `.InputUnit("mm")` (to feet), `.GetNum(name, "mm")` / `.OutputUnit("mm")` (from feet) |
| `Autodesk.Revit.<ns>.` fully-qualified names | short names — all Revit namespaces are pre-imported |
| `.GetElement(new ElementId(...))` | `id.ToElement(Doc)`, `GetElement<T>("name")` |
| lowercase `doc.` / bare `document` | the global is `Doc` |
| `.OrderBy(x => ...)`, `.OrderByDescending(x => ...)` | `.OrderByParam("Name")` / `.OrderByParamDesc("Name")` |
| `.Sum(x => x.GetNum(...))` | `.SumParam("Name", "unit")` |
| `.Where(x => x.Prop <op> ...)` on element collections | `.WhereParam("Name", value)` / `.WhereParam("Name", ">", value, "unit")` — `.Where(lambda)` only for complex conditions with no Paracore equivalent |
| `.GroupBy(x => x.GetStr(...))` | `.GroupByParam("Name")` |
| `.Select(...)` chained AFTER `.GroupByParam(...)` | chain `.Table()` directly — GroupByParam output is already table-shaped |
| foreach loop with 3+ `Println` as primary display | `.Select(x => new{...}).Table()` |
| `string.Join(...Select(...)` for output | `.Table()` |
| `Print(` (bare), `Console.WriteLine(` | `Println()` |
| `Transact(() => ...)` without a label | `Transact("label", () => { ... })` |
| `.CombinedParams(args)` | `.CombinedParams()` takes NO arguments; filter with `.Select` |
| `.SetVal()/.SetNum()` on a collection (e.g. after `.WhereParam`) | single-element only — for collections use `.SetParam("Name", value)` (bulk, one transaction) or `Transact` + foreach |
| `foreach` containing `.SetVal/.SetNum` WITHOUT `Transact(` | wrap in `Transact("label", ...)` or every iteration creates its own undo entry (this rule is textual, not scoped — any foreach + any SetVal + no Transact anywhere in the file trips it) |
| `AllElements` | does not exist — `GetElements` |

Soft warnings (non-blocking): PascalCase quoted strings not in the schema cache
(hallucinated-param heuristic); `_execute_dynamic_query` without prior discovery;
`.SetParam` bulk-write confirmation prompt.

## Live-verified idioms (probe 1 & 2, executed in Revit)

- `GetElements<Wall>()` → **197** walls; returns a **List** — `.Count` property works.
- `GetElements("Walls")` → same 197, but untyped (`Element`) — use `GetStr`/`GetNum`.
- `WhereParam`/`GroupByParam` returns **IEnumerable** — `.Count` there is the LINQ
  extension METHOD; a bare `.Count` compiles to a method group and fails with
  *"cannot convert from 'method group' to 'scoped ReadOnlySpan<char>'"*. Write
  `.Count()` or `.ToList()` first. **This is the one real typing trap between
  GetElements (List) and the param extensions (IEnumerable).**
- `GetElements("Walls").WhereParam("Base Constraint","!=","").GroupByParam("Base Constraint").Table()`
  renders a proper grouped table through the MCP (5 level-groups: 22/70/57/36/12).
- Units: `w.GetNum("Length","m")` → `5.250`; internal `17.2244 ft`;
  `.OutputUnit("mm")` → `5250.0`. Round-trips through `InputUnit` compile clean.
- Writes (probe 2, `--rw`): `collection.SetParam("Mark", w => w.GetStr("Mark"))` runs as
  ONE transaction; `Transact("label", () => { foreach ... SetVal ... })` runs clean.
  Missing parameters warn gracefully (`⚠ GetStr("Mark"): parameter not found...`) rather
  than throwing.
- Read/write separation is enforced: the read-only tool rejects code containing
  `Transact` as a read-only violation; keep probes strictly read-only.


## DWA schedule rows — verified statically

Source: `CoreScript.Engine\Globals\TakeOff\TakeOffSchedules.cs`.
`Doc.GetDwaScheduleRows()` is declared **`IEnumerable<object>`**; the runtime row is an
**anonymous type**, so dot-access does NOT compile (probe 1 proved it) — columns are
reachable only via `dynamic` or reflection (hence `EngineRowReader.cs` in the gallery
script).

Grouping: DWA curtain walls are grouped by **structural fingerprint** (type name +
dimensions rounded to 10 mm + mullion/panel/ghost counts + hosted-door counts via
`CurtainWallMembers.FingerprintParts`), NOT by type — because curtain walls can be
edited per instance. Doors/windows hosted on curtain walls are excluded from the
standard door/window schedules (`_hostedOnCurtainWall`).

Exact row shape (14 columns, exact CLR types):

| Column | Type | Notes |
|---|---|---|
| `Id` | int | representative wall instance id (for rendering) |
| `Family_Type` | string | |
| `Width_mm` | int | |
| `Height_mm` | int | |
| `Count` | int | instances merged into this fingerprint group |
| `Panels` | int | |
| `Mullions` | int | |
| `Ghost_Panels` | int | removed panels (not built) |
| `Ghost_Mullions` | int | removed grid lines (not built) |
| `Grid_Cells` | int | |
| `Mullion_Length_m` | double | |
| `Hosted_Doors` | List&lt;string&gt; | e.g. `"900 x 2100 (x2)"` |
| `Marks` | string | |
| `Level` | string | one level per line, lowest first |

Door/window rows (different shape): `Id, Family_Type, Width_mm, Height_mm, Count,
Marks, Level` — grouped by TYPE (`Symbol.Id`), with bbox fallback when Width/Height
params are ≤ 0.

## Open questions for the ParacoreAluminum rewrite

1. **License gate — RESOLVED (2026-09-23).** See "TakeOff Enterprise sign-in" below:
   `paracore-takeoff.exe` (48 curated tools) is signed in and runs everything with
   `license_tier="enterprise"`; `paracore-gen.exe` stays free-tier BY DESIGN, so
   `GetDwaScheduleRows()` remains 🔒 there. Panel sign-in does NOT affect the MCP path.
2. **dynamic vs reflection for rows.** `foreach (dynamic r in rows)` COMPILES in the
   engine (probe 3 got past compile; the failure was the license gate at runtime).
   Whether the binder can reach the anonymous type's members from the script assembly
   (anonymous types are internal) is still unverified — no MCP can run it (takeoff =
   curated tools only); test in the desktop app after panel sign-in. Until
   proven, keep `EngineRowReader`-style reflection in the gallery script.
3. **PDF export.** The clean reference implementation is
   `Paracore.Addin\Services\SchedulesExportService.cs`: `ImageExportOptions` PNG shots
   (plan + shaded elevation) composed into PDF with **PdfSharp** — no Revit text-note
   placement. The TakeOff folder has no PDF export of its own.

## TakeOff Enterprise sign-in (done 2026-09-23)

**Flow** (`rap-server\server\takeoff\cloud_auth.py`): `sign_in` tool → local listener
on 127.0.0.1:8123 → browser Google OAuth → code exchanged server-side
(`rap-auth-server-production.up.railway.app`, accounts approved by Paras Partners only)
→ RS256 JWT persisted to `%APPDATA%\paracore-data\auth\takeoff_session.json`
(~30-day token; every gated call re-verifies signature + expiry locally).
Signed in as seyoumhgs@gmail.com, session expires **2026-10-23**.

**Tooling (this repo, .repl\):**
- `takeoff_signin.py` — connects to
  `%APPDATA%\paracore-data\mcp-servers\paracore-takeoff.exe`, prints account_status
  before/after and calls `sign_in` (blocks ≤180 s while the browser flow completes).
- `takeoff_call.py <tool> [args.json] [--out file]` — generic caller for any of the
  48 takeoff tools; `takeoff_call.py list` prints all tool names.
- Run pattern: `cmd /c '"…\python.exe" .repl\takeoff_call.py ping --out .repl\x.txt 2> nul'`
  (console is cp1252 — both scripts reconfigure stdout/stderr to utf-8 for the ✓/🔒 emoji).

**Licensing architecture (fully traced):**
- `LicenseContext.Tier` is `[ThreadStatic]`, default `"free"`, `Reset()` in finally —
  no leakage between requests. `IsEnterprise` = tier == "enterprise" AND the engine is
  the Pro build (`ProPaths` type probe).
- Tier flows per-request only: `ExecuteReplRequest.license_tier` (proto field 3)
  → `ReplHandler.ExecuteRepl` → `ReplSessionManager.ExecuteAsync(..., licenseTier)`
  → `__license_tier__` parameter → `CodeRunner.Execute` sets it before compiling.
- `paracore-gen.exe` (generalist) never sends a tier → always free. Signing into the
  Paracore panel in Revit does NOT change this — the REPL path ignores panel auth.
- `paracore-takeoff.exe` gates on the cloud session, then forwards
  `license_tier="enterprise"` on every `_execute` — but exposes ONLY its 48 curated
  tools (no raw code execution). `GetDwaScheduleRows` is not among them.
- ⇒ Arbitrary enterprise code (e.g. live probe of `GetDwaScheduleRows`) = desktop app
  after Google sign-in in the panel, or add a curated tool in `takeoff_server.py`.

**Live results via takeoff MCP (Paracore_Tutorial, 2026-09-23):**
- `discover_model_categories`: 21 cats — Mullions 675, Curtain Panels 254, Walls 197,
  Doors 39, Windows 8, …
- `get_curtain_wall_schedule` (`.repl\to_cw.txt`): **28 DWA curtain walls, types
  "DWA - Type1"…"Type5"**, levels 02–04, areas 3.5–14.3 m² + panel rollups
  (System Panel Glazed 4/2/6: 127/59/68) + mullion rollups (Frame 50×65: 537,
  50×65 rotated: 132, 60×65: 6). NB: this global is NOT built on `GetDwaScheduleRows` —
  it's a simple instance+count schedule (`TakeOffArchitectural.cs:596`); the rich
  14-column DWA fingerprint rows remain verified statically only.
  Missing optional params (`Image`, `IsParapetWall`, …) degrade to ⚠ warnings.
- `get_door_schedule` (`.repl\to_doors.txt`): 39 doors incl. curtain-wall-hosted glass
  doors (`Doors_Sgl_Glass_No_Frame_2: Glass_Panel` ×8, `Double-Flush-GlassDoor:
  Glass_Dbl_Door` ×5) — exactly the `Hosted_Doors` population the DWA rows list.
- `get_window_schedule` (`.repl\to_win.txt`): 8 TopWindows with SillHeight.


