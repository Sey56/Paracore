# paracore-gen — pre-release verification

**Date:** 2026-10-27 · **Revit:** 2025 · **Model:** `C:\Users\seyou\Documents\TestModel.rvt`
(9 walls · 3 doors · 4 windows · 5 rooms · 9 dimensions · 119 materials · 25 views · not workshared)
**Method:** every MCP tool and every public engine method exercised against the live model; each probe
isolated in try/catch so one failure could not mask the rest. Writes were verified by read-back and the
model was restored to its baseline counts (9/3/4/5/9, 0 warnings) at the end.

## Verdict

**AS FIRST SWEPT — not ready to release.** 4 functional defects, 1 of which kills a whole feature
(checkpoints). Everything else — retrieval, reads, filtering, sorting, aggregation, units, writes,
bulk writes, type swaps, geometry, doors, materials, batch stamping, notebooks, charts, view export —
behaved correctly.

⚠ **THIS VERDICT IS THE STATE OF THE FIRST PASS, NOT THE CURRENT STATE.** It is kept because the
finding list below is the record of what was actually measured. For where things stand now, read
**Fix status** (line 177) and everything after it. In summary:

| | first pass | now |
| --- | --- | --- |
| B1 checkpoints | dead — `Mark()` always threw | fixed, and **live-verified**; a second defect found under it (bag keyed by parameter NAME) is also fixed |
| B2 `GetElement(id)` | never resolved an id | fixed, live-verified |
| B3 type-level writes | silently no-opped | fixed — but **the first fix crashed Revit** (stack overflow, `0xc00000fd`); corrected and guarded, see line 217 |
| B4 `TypeParams()` | 0 rows on a type | fixed, live-verified |
| D1 `Isolate()` | no auto-transaction | fixed |
| D2 `ExportImage` | returned a path that did not exist | fixed, live-verified — file found by prefix, newest match |
| doc defects | 3 | fixed, mirrors regenerated |

⚠ **Still NOT verified, and this is the honest gap before a tutorial:** `Pick()` driven from an MCP
agent, `DropCheckpoint`, the 90 s loop budget actually firing on a runaway loop, and the Watcher's
dialog-dismiss path. Everything in the table above was exercised; those four were not.

## Release blockers

### B1 — `Mark()` always throws; checkpoints are entirely dead
`ScriptApi.Checkpoints.cs:323-324` builds `new FilteredElementCollector(Doc)` with **no filter** and
then iterates it. Illegal since Revit 2023:

```
Mark("pc-cp") -> InvalidOperationException: The collector does not have a filter applied.
                 Extraction or iteration of elements is not permitted without a filter.
```

`Checkpoints()` is therefore always empty, `RollbackTo` reports *"no checkpoint named …"*, and
`DropCheckpoint` returns false. The whole checkpoint API is non-functional, not merely degraded.
Fix is one line — apply a filter (e.g. `WhereElementIsNotElementType()` or an `ElementIsElementTypeFilter`
pair) before iterating.

### B2 — `GetElement("name-or-id")` never resolves an id
`ScriptApi.cs:343-352` matches only `Element.Name` and `GetElementIdentity(x)`; there is no id parse at
all. Every form returns null:

| call | result |
| --- | --- |
| `GetElement("359588")` | null |
| `GetElement<Wall>("359588")` | null |
| `GetElement("359588" as long/int)` | null |
| `GetElement("<type name>")` | resolves |

Both `EXTENSION_METHODS.md:80` and `get_globals` advertise `"name-or-id"`. Either implement the id
branch or correct the docs — as shipped, the documented call silently returns null.
Workaround exists and is correct: `(359588L).ToElement(Doc)`.

### B3 — type-level writes silently no-op when the receiver IS a type
`ElementWriteExtensions.cs:388/391/394` are `e.GetElementType()?.SetVal(...)`. On an `ElementType`,
`GetTypeId()` returns **-1**, so `GetElementType()` is null and `?.` swallows the write:

```
dt.SetTypeNum("Width", 950, "mm")   // type width 915 -> 915   (no throw, no warning)
dt.SetTypeVal("Description", "…")   // value stays ""          (param EXISTS per search_schema)
```

The instance path is correct — `d1.SetTypeNum("Width", 950, "mm")` did write to the type (id 49490).
So this only bites when the receiver is the type itself, which is exactly what
`GetElements<WallType>().First()` hands you. **A silent no-op is the worst failure mode here**: the
script reports success and the model is unchanged.

### B4 — `TypeParams()` returns 0 rows on a type element
`ElementDiscoveryExtensions.cs:56-64` keys off `e.GetTypeId()`, which is -1 for a type.
Measured on the same object: `InstanceParams()` = 34, `CombinedParams()` = 45, **`TypeParams()` = 0**.

This is an internal inconsistency, not a design choice: `ElementTypeWriteGuard.cs:59` already does
`e is ElementType ? e.Id : e.GetTypeId()` — the correct pattern. `TypeParams` should use it too.

B3 and B4 are the same root cause and should be fixed together.

## Non-blocking defects

### D1 — the global `Isolate()` doesn't auto-transact
`ScriptApi.cs:223-233` calls `ActiveView.IsolateElementsTemporary(ids)` with no transaction, while the
element-level `.Isolate()` extension does open one. Result:

```
Isolate(GetElements("Doors"))                  -> ModificationOutsideTransactionException
Transact("iso", () => Isolate(...))            -> works
```
`Select()` and `Zoom()` are fine (no transaction needed). Either wrap it or document it.

### D2 — `ExportImage` lies when the path carries an extension
The docs say *"Pass the path without an extension"*, and that is right — but the failure is misleading:

```
ExportImage(@"C:\…\pc-export-test.png")  -> "Revit reported success but wrote no file matching
                                            'pc-export-test.png*' in 'C:\…\Documents'."
ExportImage(@"C:\…\pc-export-noext")     -> "C:\…\pc-export-noext - 3D View - {3D}.png"  ✓
```
The file **was** written — as `pc-export-test - 3D View - {3D}.png` (Revit strips the `.png` you passed
and appends its own suffix), so the wildcard search misses it. Verified by listing the directory.
Message should say "do not pass an extension", not "Revit wrote nothing".

### D3 — `Batch()` doesn't open a transaction
It opens a `TransactionGroup` only (`ScriptApi.Batch.cs:408`), so the natural usage fails:

```
Batch("id", "stage", () => { Wall.Create(...); })   -> "Modifying is forbidden because the document
                                                        has no open transaction."
```
Correct form is `Batch(id, stage, () => { Transact("…", () => { … }); })`, which then works perfectly
(stamped 2, found by `ListBatch`, refused without confirm, deleted exactly 2). The error message gives
no hint of the required nesting.

## Documentation defects

| # | Where | Problem |
| --- | --- | --- |
| Doc1 | `get_globals` + the runtime error hint | Documents the global as **`Uidoc`**; the real name is **`UIDoc`** (`ScriptApi.cs:1138`). `Uidoc` fails to compile, and the error hint repeats the wrong name. |
| Doc2 | `EXTENSION_METHODS.md:628` | `196.85.OutputUnit("m2") // 18.2895…` — the correct value is **18.288** (196.85 × 0.09290304). The engine is right; the example is wrong. |
| Doc3 | `EXTENSION_METHODS.md` §2 | Says the type writers no-op for *"a system-family instance such as a `Wall`"*. A Wall **does** have an `ElementType`; that example is misleading. The real no-op case is a **type** receiver (B3). |
| Doc4 | `get_globals` | `GetElement<T>(string) → single element by name/id` — id unsupported (B2). |

## Minor / observations

- **Bulk report overstates scope.** A single-element `SetNum("Base Offset", -150, "mm")` printed
  *"modified 23"* plus 2 created/2 deleted — Revit's joined-geometry recompute. Verified harmless (all 9
  walls still 0, 0 warnings), but a user reading "modified 23" after editing one wall will panic. Worth
  distinguishing *targeted* from *collaterally recomputed*.
- **Internal discovery leaks user-facing warnings.** `CombinedParams`/`NativeProperties` emit
  `⚠ GetStr("Image"): no parameter of that name` while probing. Noise from an internal call.
- **Duplicate `Category` row** in `Peek`/`CombinedParams`.
- **`Isolate()` has no inverse.** There is no `Unisolate()`, and `Unhide()` does not exit isolate mode.
  I left the 3D view isolated, and `export_view` then returned a **blank white image** — a confusing
  symptom for a state the API cannot clear. `ActiveView.DisableTemporaryViewMode(…)` inside a
  `Transact` is the only way out.
- **`read_extension_methods()` with no query** ends mid-snippet (`wall.Peek()`), so I could not verify the
  documented "trailer saying where it stopped" — the reply is truncated before it. Unverified, not
  necessarily broken.
- **`Pick()`** is interactive and was not exercised (it would block the session).

## Verified correct (and previously suspected)

These looked like bugs and were **not** — each checked against source or an independent expectation:

- `GetElements("Curtain Walls")` throws `ArgumentException` — **not a valid category**. The real names are
  `Curtain Systems` / `Curtain Panels` / `Curtain Wall Mullions`. A 0-instance *valid* category returns 0
  with an INFO line, as documented.
- `WhereParam(…, "starts"/"ends", …)` returning 9 of 9 — correct: both wall types are
  `PC 1xx Concrete Masonry Units`, sharing a prefix and suffix. Full-name prefix/suffix returns exactly 4.
- `RoundTo` "double-converting" — it is a **destructive snap** (internal → external → round → back to
  internal), exactly as documented. My chained call was wrong.
- `SetParam(…, "Base Offset", 100, "mm")` rolling back — Revit refused it because 9 dimensions reference
  those walls. The engine reported `ROLLED BACK` correctly; the same write on an undimensioned new wall
  committed fine.
- `ChainDim` failures — it needs **face** planes, not wall centre-lines (off by half the 150 mm width).
  Given face planes it created dim 366113.
- `IsTypeParameter()` returning false for a type parameter read from an instance — documented as
  *"true when this Parameter lives on an ElementType"*, which is what it does. Subtle, but not wrong.
- `GetBatchId(null.Id)` NRE — my own null deref, not an engine bug.
- `File.Delete()` blocked by the script guard — correct and welcome.

## Coverage

| Area | Result |
| --- | --- |
| MCP tools (10: ping, get_context, get_globals, list_skills, read_skill, search_schema, read_extension_methods ×2, export_view, explore/execute) | all working |
| Retrieval (`GetElements` ×6 forms, `GetMagicNames`, `GetCategories`, `ToElement` ×3) | pass, except `GetElement(id)` (B2) |
| Parameter reads (`GetStr`/`GetNum`/`GetInt`/`GetVal`, type twins) | pass — exact-vs-rounded contract holds (5.065 / 5.07 / 150 mm) |
| Discovery (`CombinedParams`, `InstanceParams`, `TypeParams`, `BuiltInParams`, `NativeProperties`, `ParamsDict`, `Peek`, `Reflection*`) | pass, except `TypeParams` on a type (B4) |
| Filtering (all `WhereParam` overloads, `WhereCategory`, `WhereAnyParam`, `WhereTypeParam`, `WhereMatches`, `WhereMaterial`/`Not`) | pass |
| Sorting / grouping / `SumParam` | pass — 95.241702 exact, matching grouped totals 28.76 + 66.481 |
| Units (all `InputUnit`/`OutputUnit` overloads, comparisons, `RoundTo`, `FormatUnit`, `ToMeters`) | pass |
| Writes (`SetVal` ×2, `SetNum`, `SetParam` ×4, `SetTypeParam`, `NewType`, `SwapSymbol`, `Hide`/`Unhide`/`Isolate`/`Select`/`Zoom`, `Delete` ×2) | pass, except type receivers (B3) |
| Geometry / doors / materials (`GeometrySummary`, `GetZSpan`, `FaceRefs`, `SideFaceRefs`, `RoomFrom/To/Access/Destination`, `Handing`, `FindSwingArc`, `Materials`) | pass |
| Batch (`Batch`, `StampBatch`, `GetBatchId` ×2, `ListBatch`, `DeleteBatch`) | pass when nested correctly (D3) |
| Checkpoints (`Mark`, `Checkpoints`, `RollbackTo`, `DropCheckpoint`) | **fail (B1)** |
| Notebooks, charts, `Table` ×2, `ExportImage`, `SetExecutionTimeout` | pass |

## Recommended order

1. B1 — checkpoints (one-line filter fix, unblocks a whole feature).
2. B3 + B4 together — the `GetTypeId()`-on-a-type root cause; make the no-op loud at minimum.
3. B2 — `GetElement` id support, or fix the two docs that promise it.
4. D1, D2, D3 — cheap, and each currently produces a confusing message.
5. Doc1–Doc4 — `Uidoc` → `UIDoc` is the one that actually breaks a user's first script.

## Fix status — all four blockers + D1/D2 patched (2026-10-27, after the sweep)

| # | Fix | File | Verified |
| --- | --- | --- | --- |
| B1 | `CaptureInto` collector now filtered — `LogicalOr(ElementIsElementTypeFilter(false), …(true))`, so the capture stays COMPLETE (types included) while satisfying Revit's filter rule | `CoreScript.Engine/Globals/ScriptApi.Checkpoints.cs` | compiles |
| B2 | `TryResolveId()` added; both `GetElement` overloads answer an id BEFORE the name scan. A non-numeric identity still falls through to name matching | `CoreScript.Engine/Globals/ScriptApi.cs` | compiles |
| B3 | ⚠⚠ **AS FIRST FIXED — THIS VERSION CRASHED REVIT AND MUST NOT BE REINSTATED.** `GetElementType()` returned the element when it IS an `ElementType`, so `SetTypeVal`/`SetTypeNum` on a type wrote to that type. The intent was right; the shape was a missing base case: `GetVal → GetTypeVal → GetElementType → GetVal`, unbounded, stack overflow, process death. The shipping fix returns `"-"` for an `ElementType` receiver and guards the whole family with `ScriptGuard` — see line 217 | `CoreScript.Engine/Globals/ElementParamExtensions.cs` | **superseded — see line 217** |
| B4 | `TypeParams()` now asks `GetElementType()` instead of `GetTypeId()` | `CoreScript.Engine/Globals/ElementDiscoveryExtensions.cs` | compiles |
| D1 | Global `Isolate()` wraps in `Tx.Transact` when `!Doc.IsModifiable` — same pattern `CollectionUIExtensions` already used | `CoreScript.Engine/Globals/ScriptApi.cs` | compiles |
| D2 | **`ExportImage` normalises to the STEM**, so the path handed to Revit and the prefix searched for are the same string; searches two prefixes and, on failure, lists files that DO start with that name | `CoreScript.Engine/Globals/ScriptApi.ViewExport.cs` | compiles |
| Doc1 | `Uidoc` → `UIDoc` (3 sites) | `mcp/mcp_core/prompts/globals.md`, `mcp/mcp_core/tool_helpers.py` | grep 0 |
| Doc2 | `18.2895` → `18.288` | `EXTENSION_METHODS.md` (+ synced to 5 copies) | synced |
| Doc3 | Type-writer note corrected: a Wall DOES have an ElementType; the silent case was a TYPE receiver | `EXTENSION_METHODS.md` | synced |
| — | `FORBIDDEN … WILL fail` split into FORBIDDEN (really fails) vs AVOID (runs, with a note) | `mcp/mcp_core/server.py` | — |
| — | **Watcher documented** in the shared rules so every MCP that uses it explains the dialog | `mcp/mcp_core/server.py` | — |

`dotnet build CoreScript.Engine.csproj` → **0 errors**.

MCP rebuilt: `build-gen.ps1` → `dist\paracore-gen.exe` (26,664,742 B) + `installers\Paracore-Gen-v2.1.0.exe`.
Bundled-prompt gate: 2 on disk / 2 in the exe — VERIFIED. Drift check (`find -newer` under `mcp_core`): clean.
New two-sided probe `spikes/probe_release_fixes.py` → **10/10 PASS** against the built exe:
instructions carry `PARACORE DIALOG WATCHER`, `A DIALOG IS NOT YOURS TO CLOSE`,
`REVIT SHOWED A DIALOG WHILE THIS CALL RAN` and `these RUN, with an advisory note attached`;
the FORBIDDEN block leads with `doc` and no longer names `FilteredElementCollector`; bundled
`globals.md` has `UIDoc` and no `Uidoc`.

### Still required before any of this is live

1. **Engine + add-in**: `build-addin.ps1`, then `install-engine.cmd` — ACL, so **the user runs it with
   Revit CLOSED**. Until then B1–B4/D1/D2 exist only in source.
2. **MCP server**: rebuild (done) → install → **client restart**. `prompts/*.md` and every
   `mcp_core/*.py` are bundled INTO the exe, so the Watcher text and the `UIDoc` fix are invisible
   until all three happen.
3. **Drift**: `find . -newer dist/paracore-gen.exe` under `mcp_core/skills/` must be empty.

⚠ The MCP install stops the running server, which disconnects this session's MCP tools — it is the
last step, not the first.

---

## ⚠⚠ REGRESSION — the B3 fix crashed Revit (found + fixed, 2026-10-27 round 9)

**This one is ours, and it is the most severe thing in this document: it killed the process.**

The B3 fix (a type is its own type — `GetElementType()` returns `e` for an `ElementType`) created an
unbounded recursion:

```
GetVal(name) → GetTypeVal(name) → GetElementType() → (self) → GetVal(name) → …
```

Reachable from three ordinary calls: `TypeParams()` on a type (→ `InstanceParams()` → `GetVal()` per
parameter), `GetTypeStr("…")` on a type, and `GetVal("…")` on a type.

**Evidence (measured, not inferred):**

| Source | Finding |
|---|---|
| `journal.4555.txt` | `20:38:26` — TaskDialog answered `1001 Allow`; `[Jrn.ExternalEventExecution] … CoreScript Code Executor`; then the journal **stops** |
| Windows Application log, id 1000, `20:38:33` | `Revit.exe 25.4.50.35 … Exception code: 0xc00000fd`, faulting PID `0x4B04` (= 19204) |

`0xc00000fd` is **STACK_OVERFLOW**. The `tbbmalloc.dll` module in the message is only where the guard
page tripped — not an Autodesk defect. The hang the user saw was the process dying inside our script.

**Fix:** one guard in `GetVal` before the type fallback — `if (e is ElementType) return "-";`.
Steps 1–3 of `GetVal` already read the receiver's own parameters, so on a type there is no separate
type left to consult. This covers all three entry shapes at once.

**Audited every other `GetElementType()` caller for the same shape — all safe:** the writers
(`SetNum`/`SetVal`) already gate with `e is not ElementType`; `GetStr`/`GetNum` use `GetTypeId()`
directly (which is `-1` on a type, so they skip); `GetTypeStr/Num/Int` self-delegate but terminate;
`TypeParams → InstanceParams` is one-directional.

---

## NEW — `ScriptGuard`: recursion can no longer kill Revit

**The gap:** the engine had no recursion protection at all (no depth counter, no stack guard, no
`EnsureSufficientExecutionStack`). Any unbounded recursion — in engine code or in agent-authored
script code — was `0xc00000fd`: Revit dies with no message, no report, nothing for the agent to read.

**Why NOT a depth cap.** A nested family is a `GeometryInstance` holding more `GeometryInstance`s, so
the depth is a property of the **model** — 40 levels is ordinary and must keep working. Any fixed
number is either too small for a real model or too large to fire before the crash.

**What it does instead** — `RuntimeHelpers.TryEnsureSufficientExecutionStack()`, i.e. *"is there room
for another call?"*. It measures the resource that actually runs out, so it is depth-independent.
Depth is kept as a **signal only** (`MaxDepth` / `DeepestScope`): a one-time advisory at depth 100,
never a stop.

**Guarded entry points:** `GetVal`, `GetStr`, `GetNum`, `GetElementType` (the family the crash lived
in), `ScanGeometryRecursive` (nested families), `ScanForArcRecursive` (door swings). Deadline
bookkeeping is started in `CodeRunner.ExecuteCore` **and** `ExecuteBinary` — two separate funnels, so
both are wired.

### Proof — two-sided, measured on this machine's .NET 8 (`%TEMP%\guard-probe`)

| Case | Result |
|---|---|
| Unbounded recursion **with** guard | caught at **depth 22,420**, catchable exception, **exit 0, process alive** |
| Recursion to **2,000** levels **with** guard | **completes normally** (depth 2001) — no cap on legitimate depth |
| Unbounded recursion **without** guard | `Stack overflow. Repeat 32142 times: at Program.Unguarded` → **process death** |

The third row is the control: it reproduces exactly what killed Revit.

### ⚠ What this does NOT cover, stated plainly

- **Loops are a different mechanism, and they are already covered.** `TimeoutRewriter` injects
  `ExecutionGlobals.CheckTimeout()` into every `for`/`foreach`/`while`/`do` body and every
  block-bodied lambda; the deadline is armed by `ExecutionGlobals.SetContext` and is **90 s** on the
  agent path (`ReplTimeoutSeconds`, since `execute_dynamic_query` runs through the REPL session).
  Scripts raise it with `SetExecutionTimeout(n)` on line 1. **No second budget was added** — two
  sources of truth for one limit is the failure this note exists to prevent.
- **Code that calls nothing is still fatal**: `while (true) { }` with an empty body, or
  `int f(int n) => f(n + 1);`. .NET Core removed `Thread.Abort`, and a stack overflow on any thread
  takes the whole process down. Nothing in-process can stop it. Every loop or recursion that touches
  the model is covered.
- Advisories (`MaxDepth`, the depth-100 note) are wired on the `CodeRunner` path; the REPL path gets
  the **guard** but not the advisories. The protection is path-independent; only the reporting isn't.

---

## LIVE RE-TEST — 2026-10-27 21:1x · engine Release `FD5237E59D19B413` (installed 21:05, Revit PID 24464)

Revit was restarted after the install, and every call below ran against the **installed** engine.

| Item | Result | Evidence |
|---|---|---|
| **B2** `GetElement` by id | **PASS** | `GetElement("359588")` → `359588 'PC 150 Concrete Masonry Units'`; `GetElement("Level 1")` → `311`; `GetElement(garbage)` → `null` (no throw) |
| **B3** type-level write | **PASS** | `SetTypeVal("Type Comments", "PARACORE PROBE")` → read back `'PARACORE PROBE'`, `modified 2`, then restored to `''` |
| **B4** `TypeParams()` on a type | **PASS** | **34 rows** returned (was 0) — the call that killed Revit now completes |
| **D1** global `Isolate()` | **PASS** | opened its own `"Isolate Elements"` transaction, COMMITTED, then cleared with `DisableTemporaryViewMode` |
| **D2** `ExportImage` with a `.png` path | **PASS** | requested `…\pc_export_probe.png`; returned `…\pc_export_probe - 3D View - {3D}.png`, `exists: True`, **40,623 B**; image opened and verified — a correct 3D view with masonry hatch, windows and openings, **not blank** |
| **ScriptGuard** | **PASS (inert, as designed)** | max depth **1–2** on every call; never fired. `guard = script: 60 guarded calls, max depth 2 (GetStr)` |
| **B1** checkpoints | **FAIL — still throws** | `The collector does not have a filter applied.` |

### B1 was only HALF fixed — the live test caught it

`CaptureInto` was fixed in the first pass, but `RollbackTo` has a **second** bare
`new FilteredElementCollector(Doc)` in its diff pass. `Mark()` therefore still threw and checkpoints
remained dead. Same rule in two places, and only one was changed.

⚠ The second site matters for correctness, not just for the exception: `RollbackTo` reports every
element **not** found in `entry.Values` as **created**. A diff pass scanning a different set than the
capture did would misreport untouched elements as new — a wrong answer that looks like a working
feature. Both passes now use the identical `LogicalOrFilter(ElementIsElementTypeFilter(false),
ElementIsElementTypeFilter(true))`.

⚠ Audited **every** `new FilteredElementCollector(` in the engine (~20 sites): all others already
carry `OfClass` / `OfCategory` / `WhereElementIsNotElementType`. The two checkpoint sites were the
only filterless ones.

**Rebuilt: Release 0 errors, Debug 0 errors.** Needs one more install + Revit restart to verify.

⚠ One note on the B3 probe: the restore wrote `''`, but the parameter was originally *unset* rather
than *empty* — a re-read cannot distinguish the two. Test model only.

---

## B1 VERIFIED — and a NEW defect it exposed: the checkpoint bag was keyed by parameter NAME

**Installed:** Debug `3BA7CB615A69E1FC` (21:12:07), `LIVE IN REVIT: Debug`, Revit PID 24900 (21:14).

The checkpoint cycle now works end to end:

```
📍 Mark "probe" — 4034 elements, 13447 parameter values captured.
Comments mutated = 'CHANGED-BY-PROBE'
✅ Transact "Paracore: rollback to probe" — COMMITTED
Comments after   = ''
restored ok      = True
```

### But the rollback reported restoring 5 elements when 1 had changed

A **no-op** cycle (Mark → RollbackTo with nothing mutated) exposed it:

```
✅ Transact "Paracore: rollback to noop" — COMMITTED   modified 0
✅ Batch "checkpoint:noop" — 0 element(s) restored · modified 14
   modified : 312, 316, 695, 699, 8157, 8176, 8237, 8251, 25223, 25224, 25225, 98984 …
```

The transact wrote **nothing**, yet `skipped = False` and the same **14 ids** appeared every run. So
`Differs()` returns deterministic false positives.

**Root cause — a name is not a unique key.** Measured with the capture gates applied:

| Element | Duplicate name | Ids and values |
|---|---|---|
| View 312 | `View Template` ×2 | `-1005199` = `'None'` · `-1005176` = `'<None>'` |
| Railing 25223 | `Type` ×3 | `-1150333` = `'<None>'` · `-1150329` = `'<None>'` · `-1150327` = `'Rectangular - 50x50mm'` |

The bag was `Dictionary<string, string>` keyed by `Definition.Name`. Capture **overwrites** on a
duplicate, so the LAST one wins; `Differs`/`RestoreElement` iterate in order and compare the FIRST.
The mismatch is permanent.

⚠ **This is not a reporting defect.** Those values genuinely differ, so a restore would write the
**wrong duplicate's value** — silent corruption rather than a wrong number in a message.

**Second, independent bug:** `Differs` applied **neither** capture gate — it did not skip read-only
parameters, nor a type's parameters projected onto an instance. It therefore compared parameters the
bag never contained, and its `now == null → true` branch reported each as a difference. Three
functions read one bag; all three must agree on what that bag can contain.

### Fix

`ScriptApi.Checkpoints.cs` — one edit covering all three functions plus a new helper:

```csharp
private static string ParamKey(Parameter p)   // "p:<Parameter.Id>", or "n:<name>" if the id is invalid
```

used by `CaptureInto`, `Differs` and `RestoreElement`, and `Differs` now applies the same gates as the
other two.

**Rebuilt: Release 0 errors, Debug 0 errors.** Bags are in-memory only, so a Revit restart clears the
old name-keyed ones — no migration needed. One install + restart remains to confirm the false diff is
gone.

---

## ⚠⚠ STRUCTURAL FINDING — the system prompt was built by a function nothing called

Not a defect in a tool, and worth recording because it is the failure mode this whole
review kept running into: **a thing that reads like the authority while nothing reads it.**

`mcp_core/prompt_assembler.py` composed TEN `prompts/*.md` files into one ~36 K string via
`build_prompt()`. When the shared core moved into `mcp/mcp_core/` (2026-10-13) the live channel
became `server.build_instructions()` — `COMMON_RULES` + the Domain intro + the skill catalogue,
delivered as `instructions=` in the MCP handshake — and nothing called `build_prompt()` again.

So for two weeks:
- the file that looked like the system prompt was dead;
- the eight prompt files behind it were dead, on disk, and **bundled into every installer**;
- and the live instructions were a DIFFERENT text, which is where the rules an agent actually
  obeyed came from.

Nothing caught it because there was no check that a shipped file is read by anything. The
`mcp_core` drift gate checks that names in the docs appear in the code — it cannot notice that a
whole module has no caller.

**Resolution:** the eight files are DELETED, not left inert. A stale file that nothing reads is
indistinguishable from one that is about to be read, and the next person to touch prompt text
would have edited the dead one. What remains is what is genuinely read: `globals.md` (the
`paracore://globals` resource) and `catalog.md` (fallback for `build_extension_reference()`).

⚠ **The general lesson, stated so it can be checked next time:** for every file that ships,
name the code path that reads it. If the answer is "it is the documentation", say so
explicitly. `prompt_assembler.py` now opens with a docstring saying the prompt is NOT built
there and where it IS built, so the next reader is not misled the way this one was.

---

## ROUND 18 — LIVE release test of the rebuilt stack (23:5x, Revit 25.4, TestModel.rvt)

**What was under test** (identity, not a claim): `paracore-gen.exe` installed
`C:\Users\seyou\AppData\Roaming\paracore-data\mcp-servers\paracore-gen.exe`, 26,621,850 B,
SHA256 `b569e777…114d`, **byte-identical to `paracore-gen\dist\`**. All five exes rebuilt
23:46–23:49 and byte-identical to their `dist/`. Revit 25.4.50.35 with the rebuilt add-in;
`TestModel.rvt` (4,034 elements).

### What was proven, by doing it

| # | Capability | Result |
|---|---|---|
| 1 | `ping` | connected; cheat sheet carries the AVOID/REJECTED split; **no install path** |
| 2 | `get_context` | project, `{3D}`, no selection, 2 levels; no user-name field |
| 3 | `list_skills` / `read_skill` | 8 skills; `query-filter` served from the bundle |
| 4 | read query | Walls 9 · Doors 3 · Windows 4 · Rooms 5; projected table, `Id` first |
| 5 | **guard, layer 1** | `SetVal` inside `explore_revit_data` **REFUSED before execution** |
| 6 | **guard, layer 1b** | `GetMethod()` reflection **REFUSED** |
| 7 | **guard, layer 2** | `w.Pinned = true` → `Attempt to modify the model outside of transaction`; model verified unchanged (Comments empty, nothing pinned) |
| 8 | write | `SetVal("Comments")` → `COMMITTED modified 1`, read back, then restored to `""` |
| 9 | checkpoint | `Mark` → 4,034 elements / 13,540 values, keyed by document path; edit; `RollbackTo` → **1 element restored**, value back to `""` |
| 10 | `DropCheckpoint` | `True`, then `False` on the second call; `Checkpoints()` = 0; model untouched |
| 11 | **90 s budget** | `SetExecutionTimeout(2)` + a bounded 20 s loop → **timed out after 2 seconds**; session survived |
| 12 | **B3 regression** | `WallType` receiver: `GetTypeStr` = PC 150…, `GetVal` = 150, `GetNum` = 150 mm, `TypeParams` = 34, `InstanceParams` = 34 — no recursion |
| 13 | aggregate | `GroupByParam` 5 + 4 = 9 ✓; `SumParam("Area")` = 95.24 m²; `BarGraph` rendered |
| 14 | schema table | `CombinedParams` = **82 rows, "shown in full"**, no Totals line |
| 15 | `export_view` (model) | 3D image, masonry hatch, openings, no annotation clutter |
| 16 | `export_view` (tags, "Level 1") | dimensioned plan (5215 × 7500), room tags BEDROOM/BATHROOM/LOBBY/SITTING ROOM/COOK |

⚠ Tests 7, 11 and 12 are the three that could have taken Revit down. 11 and 12 were **bounded**
on purpose so that a failure would report itself instead of killing the process.

### Defect found — G1: a FALSE diagnostic on the primary discovery call

Every `CombinedParams()` / `InstanceParams()` / `BuiltInParams()` call on a Wall prints:

```
⚠ GetStr("Image"): no parameter of that name on this element. Check the spelling, or use
  .CombinedParams().Table() to see the real names.
```

- **The name is not the caller's.** `InstanceParams` reads `Value = e.GetVal(p.Definition.Name)`
  — it re-resolves BY NAME a parameter it already holds as a `Parameter` object
  (`ElementDiscoveryExtensions.cs:47`). `Image` exists on the wall but has **no value**, so the
  by-name lookup misses and the diagnostic fires.
- **It is new.** `7933bed0` (today) gated the type fallback with
  `_declaresParameter(type, name)`. Before that, the type answered for the element and the
  warning never ran. So the fix that stopped the type answering on the element's behalf
  exposed every internal name-based read that had been leaning on it.
- **The advice is circular** — it points the caller at the very call that produced the warning.
- **It repeats on every call**, not once per session: `_warnedParams` counts *elements seen*, and
  a single-element query keeps `seen == 1`.
- ⚠ For an MCP agent this is not cosmetic noise. It reads as "your query was wrong" on the
  discovery call the instructions tell the agent to make first.

**Fix, when the engine is opened:** in `GetStr`'s not-found step, distinguish *no such
parameter* (`LookupParameter == null` → warn) from *exists, no value* (return `""` silently).
One condition; the warning keeps its teeth for real typos.

### Defect found — G2 (minor): duplicate rows in the schema tables

`Category` appears twice in both the Instance and the Type scope of `CombinedParams` (82 rows,
80 distinct names), because the rows are `e.Parameters` verbatim. Not wrong, but a reader
counting parameters gets 82 when the answer is 80.

### Gate defect found and FIXED — the `server.py` anchor could never match

`check-mcp-exes.py` tracked `server.py` with the sentinel `omit=omit_common`. That is **source
syntax** (a keyword argument) — it compiles to a `LOAD_FAST` plus the kwarg *name* `"omit"`,
never to a string constant, and `consts_contain()` scans string constants. So the row reported
**STALE for every build ever made**, and no rebuild could clear it. Measured: all five installed
exes carried 50 of the 57 long literals in `server.py` and every round-5 dialog-watcher string,
while that literal was absent from all five.

Retargeted to `"PARACORE DIALOG WATCHER"` (a real constant, added in round 5). **Teeth proven
two-sided:** present in all five current exes, absent in `paracore-takeoff.exe.prev` (2026-10-18).

Consequence: F2, F3 and F4 now PASS, so their `known_red` allowances were deleted in the same
change (a passing allowance FAILS the gate). Gate is now **15 auto green, 2 allowances open**
(F1 `hover-docs` — one engine doc-comment; F5 — commits not yet pushed).

### NOT tested — say so plainly

- **`pick_object_report`** — needs a human to click in Revit. The 120 s backstop frees the
  *agent*; whether Revit leaves pick mode and releases the UI thread afterwards is **still
  unmeasured**, and it is the one place a stalled `single_flight` could report REVIT IS BUSY.
- **The Watcher's dialog-dismiss path** — no warning dialog was staged.
- **Nothing above is protected by a test.** Every line of this round is "verified once, by
  hand", on this machine, against this build.

---

## ROUND 19 — G1 root-caused and fixed (2026-10-28, 06:0x–06:2x)

### The operator's evidence, which changed the diagnosis

> "it only comes at the first execution on a new session … if I run that same script again it is
> gone … it is like it expects the engine to be hot first."

⚠ **The first thing to record is a correction: I changed nothing between ROUND 18 and that
observation.** The only files touched were `scripts/check-mcp-exes.py`, `.repl/gates.json` and
this document — none of them is loaded by Revit. So the disappearance was the engine's own
behaviour, and it made the "warm-up" reading the right one to chase.

### Measured, in the live session

| Probe | Result |
|---|---|
| `w.LookupParameter("Image")` on wall 359588 | **found** (StorageType `ElementId`) |
| the same name in `w.Parameters` | 1 entry, **`HasValue = 0`** |
| `w.GetStr("Image")` | `""` — **no warning** |
| `type.LookupParameter("Image")` on the WallType | **`null`** — while the wall declares it |
| `CombinedParams()` on Walls / Doors / Windows / Rooms | warned **only on Walls** — the only category that declares `Image` |
| the same `CombinedParams()` call at 23:55 and at 06:1x | warned **then**, silent **now**, same session, no rebuild |

⇒ The guard's **only** existence test was `ResolveParam` → `LookupParameter`. That call returns
`null` for a parameter that is present in the element's own parameter set. So
`_declaresParameter` answered "undeclared" from a volatile API result, and `GetStr` accused the
caller of a typo. **"First execution only" was never warm-up logic — it was one API call giving a
different answer at different times.** The dedupe in `_warnedParams` (keyed on distinct element
ids, printed at 1 and every 25th) is why it never repeated in a way that looked random.

### Changed

| File | Change |
|---|---|
| `Globals/ElementParamExtensions.cs` | `_declaresParameter` now scans `e.Parameters` and the type's `Parameters` by name **before** concluding a name is undeclared. The set is authoritative and it is the same list discovery iterates, so the two can no longer disagree. |
| `Globals/ElementDiscoveryExtensions.cs` | NEW `_valueOf(Parameter)` — reads the value from the Parameter object the row already holds (`AsValueString` → `AsString`), exactly as `GetVal` does, **without resolving a name**. Used by `BuiltInParams`, `InstanceParams` and `ParamsDict`, which previously called `e.GetVal(p.Definition.Name)`. Discovery can no longer reach `GetStr` by name, so this class of false warning is unreachable from it. |
| `Globals/ScriptApi.cs` | F1 closed: `<see cref="Element.Name"/>` → `<see cref="Element.Name">Element.Name</see>`, so the AI's hover reads the member name instead of a blank. |

⚠ **No MCP rebuild is needed for any of this** — the exes embed `mcp_core` Python, not the engine.

### Two gate messages that pointed at the wrong file

Both found while trying to read the gate's verdict, both fixed:

1. `verify_ext_method_gen.py` printed **"the built DLL is not older than the newest engine source"**
   — the *pass* condition — as the *failure* text, next to `dll=…908 src=…109` (37 minutes older).
2. The remedy was **"rebuild the engine"** even when the copy it measured was the **installed** one
   (`resolve_build_artifact` prefers it). After a correct rebuild the gate stayed red and told the
   reader to rebuild again. It now names the copy and the action that closes it:
   `the INSTALLED DLL is OLDER … — run installers\Paracore_Addin_v4.8.1.exe with Revit CLOSED`.

### Built

`dotnet build` → **0 errors**. `build-addin.ps1` → exit 0, `installers\Paracore_Addin_v4.8.1.exe`
(06:21). The shipped `CoreScript.Engine.dll` (06:20:18) contains `_valueOf` in its metadata; no
`GetVal(p.Definition.Name)` remains in the discovery file.

### Gate at handover — RED, and that is the honest reading

14 auto gates green. Two red, and **both are the same fact**: the fix is built but not installed —
`ext-gen-trust` (installed DLL is 395 min older than the source) and `installed-addin`. They close
when the installer runs. F5 (unpushed commits) remains the operator's call. **No allowance was added
to hide this**: a red that is true is not a nuisance.

### ⚠ NOT YET PROVEN LIVE — the one thing left

The fix has not run in Revit. It needs the add-in install (ACL, Revit closed). **The verification
must be two-sided**, because "no warning" alone cannot distinguish *fixed* from *deleted*:

1. `GetElements("Walls").First().CombinedParams().Table()` → **no** `GetStr("Image")` warning.
2. `GetElements("Walls").First().GetStr("Fire Ratng")` → the warning **must still appear**, with
   the closest-name suggestion. A typo that goes silent is worse than the false alarm this fixed.
