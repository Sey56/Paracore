# Delivery Mode Decision — Paracore-Finishing & Paracore-Aluminum

**Date:** 2026-09-19
**Question:** how should these two tools be delivered — as traditional Revit addins, as pure-Revit-API
addins, or as gallery scripts?
**Companion document:** `Docs/ADDIN_EXTRACTION_RESEARCH.md` (the dependency surface).
**Status:** recommendation only. Nothing created or modified.

---

## 0. The headline: gallery scripts need **no extraction at all**

The dependency research assumed two new *projects* that would each need a copy of the engine's
surface. **If the tools are gallery scripts, that whole problem disappears** — because a gallery
script is compiled against the installed `CoreScript.Engine.dll` and runs inside the engine.

Measured, from the scaffolded `Globals.cs` of `04_Advanced/ParacoreTiler`:

```csharp
global using CoreScript.Engine.Globals;
global using static CoreScript.Engine.Globals.ScriptApi;
global using static CoreScript.Engine.Globals.WatchdogRegistry;
```

and from `ParacoreTiler.csproj`:

```xml
<Reference Include="CoreScript.Engine">
  <HintPath>C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore\CoreScript.Engine.dll</HintPath>
  <Private>false</Private>
</Reference>
```

That is not just IntelliSense. The engine's own script compiler
(`Core/Rewriters/ScriptReferenceProvider.cs:33-40`) includes `typeof(ScriptCompiler)` — **which is
declared in `CoreScript.Engine.dll` itself** (`Core/ScriptCompiler.cs:19`) — in the metadata
reference set of every script it compiles, and `GetImports` adds `CoreScript.Engine.Globals` to the
default usings. So at runtime a script has:

- the whole Revit API, and
- `ScriptApi` (`GetElements`, `Selection`, `Println`, `Table`, `UIDoc`, `Transact`, `Show`), and
- **every engine extension class**, including `FinishingExtensions` and `TakeOffExtensions`.

Which means a gallery script can simply write:

```csharp
foreach (var row in Doc.InspectRoomFinishes())     Table(row);
foreach (var row in Doc.GetFinishingTakeoff())     Table(row);
foreach (var row in Doc.GetPaintingTakeoff())      Table(row);
foreach (var row in Doc.GetDwaScheduleRows())      Table(row);
```

No fork, no seam, no duplicated `_isDoorWin`, no drifting copy. **The `_isDoorWin` question that
the research flagged as the one thing to settle first is dissolved by this choice** — there is one
engine, therefore one definition, therefore nothing to drift.

I verified the installed assembly is the same one the engine runs:
`C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore\CoreScript.Engine.dll` = 1,060,864 B,
mtime 2026-09-19 21:03 — the same artifact recorded as installed in the project memory.

---

## 1. What a gallery script actually is (measured)

A **script source** is a folder containing a `.paracore` marker:

```json
{ "name": "04_Advanced", "description": "04_Advanced", "version": "4.0.0", "type": "automation-pack" }
```

Each script is a folder inside it, holding a top-level-statement entry script:

```
04_Advanced/ParacoreTiler/Scripts/ParacoreTiler.cs        (454 lines)
04_Advanced/RoomFinishUpdater/Scripts/RoomFinishUpdater.cs
```

**"Edit Script" scaffolds** the folder into a real VS Code workspace —
`ParacoreTiler.csproj`, `ParacoreTiler.sln`, `global.json`, `Globals.cs`, `.editorconfig`,
`.github/copilot-instructions.md`. The scaffold files are generated, not authored: the examples
repo's `.gitignore` excludes `**/*.csproj`, `**/Globals.cs`, `**/global.json`, `**/.editorconfig`,
`**/.vscode/`, `**/bin/`, `**/obj/`. IntelliSense comes from `Globals.cs` plus references to
`RevitAPI.dll`, `RevitAPIUI.dll` and `CoreScript.Engine.dll` from the installed Paracore folder.

The entry script carries a metadata header that becomes gallery metadata:

```csharp
/*
DocumentType: Project
Categories: Architectural, Interiors, Analysis
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
An advanced floor pattern generator ...
*/
```

**Parameters are declarative.** A `Params` class at the bottom of the entry script is reflected
into the gallery UI. The full attribute set observed in the examples:

| Feature | How it is declared |
|---|---|
| Grouping | `#region 01. General Settings` + XML `/// <summary>` = label/help |
| Number with slider | `[Range(0, 360, 15)] public double RotationAngle { get; set; }` |
| Unit-aware input | `[Unit("mm")]` / `[Unit("m")]` |
| Dropdown | `public string PatternType { get; set; }` + `public List<string> PatternType_Options => [...]` |
| Element picker | `public Room SelectedRoom { get; set; }` (hydrated by the engine) |
| Multi-element picker | `public List<Room> CustomRooms { get; set; }` |
| Conditional visibility | `public bool Tile2_Type_Visible => PatternType != "Single Tile";` |
| Conditional enable | `[EnabledWhen(nameof(UseCustomScope), "true")]` |
| File input | `[InputFile("csv"), Required]` |
| File output | `[OutputFile("csv")]` |

**Output** is `Println(...)`, `Table(data)`, `Show("table"\|"chart", data)`, and `Transact(name, () => {...})`
for model writes. `.ptool` is the published artifact: a JSON of `metadata` + the reflected
`parameters` schema, with `is_compiled`, `is_protected`, `is_watchdog` flags.

---

## 2. Q1 — Standard Revit API vs ScriptApi: **you do not have to choose**

The worry was that isolating from the Paracore ecosystem would cost the REPL-verification
advantage. That trade-off only exists for a *traditional addin*. A gallery script has **both at
once**: `Autodesk.Revit.DB` is globally imported, and `ScriptApi` is globally imported as static,
and `CoreScript.Engine.Globals` is globally imported. You can write raw Revit API
(`new FilteredElementCollector(Doc)…`) and `ScriptApi` calls (`GetElements("Rooms")`, `Println`,
`Table`) in the same method.

So the three options are not "isolated" vs "coupled". They are:

| Option | Gets ScriptApi + REPL | Gets engine takeoff code | Standalone (no Paracore needed) |
|---|---|---|---|
| Pure-Revit-API addin | no | **no — must reimplement** | yes |
| Traditional addin referencing the engine | yes, with a context bootstrap | yes | no (needs the engine DLL) |
| **Gallery script** | **yes, automatically** | **yes, directly** | no (needs the Paracore addin) |

The middle row costs a 4-line `ExecutionGlobals` bootstrap (already proven at
`ParacoreApp.cs:135-151`). The bottom row costs nothing. **Going pure-Revit-API buys only
standalone distribution, and pays for it by reimplementing the finishing and DWA engines** — the
7,973-line finishing model and the DWA closure. That is not a good trade unless standalone
distribution is an actual requirement (§6).

---

## 3. Q2 — Zoning: the change is **presentation-only**, and the hard part is already done

Your requirement: no sub/super classification in the output. The sub/super boundary level serves only as a
*filter* (a checkbox: substructure, or superstructure), and with no sub/super boundary level everything is
calculated as one.

**The engine already splits exactly along the axis you want to filter on.** Measured:

- `Finishing.Collector.cs:120-122` builds two buckets and routes by zone:
  ```csharp
  var sub = new ElementFinishTotals();
  var sup = new ElementFinishTotals();
  ElementFinishTotals Tgt(Room r) => _roomZone(r, boundaryM, tolM) == "sub" ? sub : sup;
  ```
- `GetFinishingTakeoff` emits rows tagged `Section = "A.7"` (substructure) and `"B.7"`
  (superstructure) — that tag is the *only* place zoning reaches the output.

So all three behaviours you asked for are already reachable:

| Your requirement | How it maps | Engine change |
|---|---|---|
| Checkbox = substructure only | read the `sub` bucket / keep only `Section == "A.7"` rows | none |
| Checkbox = superstructure only | read the `sup` bucket / keep `B.7` | none |
| **No sub/super boundary level → everything as one** | `ZoneRule.Resolve` returns `"super"` whenever `boundaryM` is null, so **everything already lands in `sup`** | none |
| Don't report sub/super | drop the `Section` code, or relabel to a neutral section | **script-level, not engine** |

The last row is the whole of the work, and for a gallery script it is a two-line projection:
consume `GetFinishingTakeoff()` and re-emit the rows without the `A.7`/`B.7` section code — or,
if you prefer, call the six `Inspect*Finishes` inspectors directly and never see a zone at all.

⚠ One trap to respect (project rule 9): `ZoneRule.Resolve(Element, …)` classifies an **element**
(bbox Z, midpoint rule); `_roomZone(Room, …)` classifies a **room** by `Level.Elevation`. They
answer different questions. The filter checkbox should be explicit about which one it is filtering,
because a room and a wall in it can legitimately land on opposite sides of the sub/super boundary level.

**Also note:** `GetFinishingTakeoff` calls `LicenseContext.RequireEnterprise("TakeOff")`. A gallery
script runs through the same engine, so the same licence gate applies.

---

## 4. Q3 — The parameter-init button: a small dedicated script

You are right that neither addin needs the "QS Sections" button. There is **no single
"bind everything" entry point** — `EnsureParameterBound(doc, showUI)` (`BOQSectionParameter.cs:454`)
binds only `BOQ_Section`. The classifiers are eight separate, individually idempotent methods:

| Method | Binds | Needed by |
|---|---|---|
| `EnsureRoomParametersBound` (`:623`) | `IsWetRoom`, `IsExterior` on Rooms | Finishing |
| `EnsureDoorWindowClassifier` (`:716`) | `IsDoorWin` on Walls | Finishing, **Aluminum** |
| `EnsureWallPurposeParameters` (`:835`) | `IsParapetWall`, `IsFenceWall`, `IsHandrailWall` | Finishing |
| `EnsureEarthworkParametersBound` (`:936`) | `IsExcavationMarker` | — |
| `EnsureRoofSlabParameterBound` (`:1016`) | `IsRoofSlab` | — |
| `EnsureGradeSlabParameterBound` (`:1143`) | `IsGradeSlab` | Finishing |
| `EnsureGradeBeamParameterBound` (`:1289`) | `IsGradeBeam` | — |
| `EnsureParameterBound` (`:454`) | `BOQ_Section` | — |

So the separate init tool is three calls for Finishing and **one** for Aluminum. It is a natural
gallery script: no parameters except a "which set" selector, `Println` a report of what was bound,
and it inherits the gallery UI for free. Each method already starts its own `Transaction` and is
documented as safe to re-run ("Runs every call so curtain walls added later stay visible").

---

## 5. Q4 — Race conditions: what is actually shared, and what is already safe

Your instinct is right that they share the document and the engine's statics. Here is the measured
picture, separated into what is real and what is not.

**Not a real race — Revit serialises us.** The Revit API is main-thread-only. A gallery script runs
inside the engine's `ExternalEvent`/command context on Revit's main thread. Three tools cannot
touch the document simultaneously; they run one after another. There is no concurrent
`FilteredElementCollector` hazard.

**Not a real race — the execution context is per-run.** `ExecutionGlobals.Current` is
`public static readonly AsyncLocal<ExecutionGlobals>` and the host sets it on entry and calls
`ClearContext()` in a `finally`. So `ScriptApi` state cannot leak from one tool's run into
another's.

**Would become a real problem only if you split into separate addins.** Each addin would load its
*own* copy of `CoreScript.Engine.dll` into its own `AssemblyLoadContext`, giving each its own
statics: `ScriptApi` in one addin would be invisible to the other, and the in-memory
`_finishesCache` would exist twice. That is isolation, which sounds good — but it doubles memory,
doubles the caches, and means the two addins can disagree about a shared on-disk artifact. **This
is an argument for gallery scripts, not against them.**

**What genuinely is shared, and how it behaves:**

| Shared resource | Where | Race behaviour |
|---|---|---|
| Finishing bucket cache | `%TEMP%\paracore_finishes_<hash>.json` | **Tolerant by construction** — see below |
| Finishing settings | `%APPDATA%\paracore-data\paracore-takeoff\finishing_settings.json` | last writer wins; read at start of a run |
| Shared-parameter file | `%APPDATA%\paracore-data\Paracore_SharedParameters.txt` | written once, idempotent |
| Parameter **bindings** | `doc.ParameterBindings` | the real risk — see below |
| `IsDoorWin` / `IsWetRoom` values | the document | last writer wins; both tools only ever *seed*, never overwrite a user choice |

The temp cache deserves credit because it was built defensively
(`Finishing.Collector.cs:1035-1065`):

```csharp
var key = (doc.PathName ?? doc.Title ?? "project").GetHashCode();
return Path.Combine(Path.GetTempPath(), $"paracore_finishes_{key:x8}.json");
...
if (j.Doc != docName || j.BoundaryM != boundaryM || j.TolM != tolM
    || Math.Abs(j.GslM - gslM) > 1e-9 || j.Fp != fp) return null;
if (_finishesTotal(j.Sub) + _finishesTotal(j.Sup) < 1e-9) return null;
```

Every key must match or it returns `null`; the whole read is inside `try/catch`; and an all-zero
hit is rejected. `File.WriteAllText` is not atomic, but a torn file simply fails to deserialize →
`null` → **recompute**. So a concurrent writer degrades performance, never correctness.

**The one thing to actually guard is transaction reentrancy.** `EnsureDoorWindowClassifier` and its
siblings each open their own `using (var tx = new Transaction(doc, …))`. Revit throws if you start a
transaction while one is open. So:

- never call an `Ensure*` from inside another transaction or inside `Transact(...)`;
- keep the parameter-init tool as its own separate invocation, not a preamble inside a takeoff run;
- treat "two tools running at once" as out of scope — it cannot happen on Revit's main thread, and
  the guard is simply "one tool per invocation", which the gallery already enforces.

**Recommendation:** the race worry does not justify isolation. Keep them as gallery scripts in the
same engine; the shared state is either per-run (AsyncLocal), tolerant (the temp cache), or
idempotent (the parameter binding). Add one rule to the docs: *do not nest transactions, and run
the parameter-init tool on its own.*

---

## 6. Q5 — Gallery script vs traditional addin: the honest comparison

| | Gallery script | Traditional addin |
|---|---|---|
| Extraction work | **none** — calls the engine directly | fork 15 files + 5 seam helpers + a `BOQSectionParameter` slice |
| REPL verification | **automatic** — runs in the engine | requires a 4-line `ExecutionGlobals` bootstrap (proven) |
| Parameter UI | declarative `Params` class, free | hand-written WPF (`SchedulesCommand` is 463 lines of it) |
| Iteration loop | edit in VS Code → run; **no build, no install, no Revit restart** | build → `install-engine.cmd` (ACL-protected, user-run, Revit closed) → restart Revit |
| Independently versioned | yes — one folder per tool | yes — one repo per addin |
| Ribbon button | no — invoked from the gallery / Desktop app | yes |
| Rich custom window | no — form-shaped UI only | yes |
| Client-facing PDF | **blocked today** — see below | works (PDFsharp + `WindowsFontResolver`) |
| Standalone distribution | no — needs the Paracore addin | possible |
| Coupling to engine changes | recompiled per run; no compile-time gate | compile error at build time |

### The one real blocker: PDF from a script

`GetCoreReferences` adds third-party DLLs from a **hard-coded list**
(`ScriptReferenceProvider.cs:71`):

```csharp
string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
```

**PdfSharp is not in it** — even though `PdfSharp.dll` (791,552 B) *is* already deployed to the
addin folder. So a gallery script cannot `using PdfSharp.Drawing;` today.

Three ways out, in order of preference:

1. **Add `"PdfSharp.dll"` to `extraDlls`** — a one-line engine change that unlocks PDF for every
   future script, and mirrors what is already deployed. This is the clean fix.
2. Have the Aluminum script emit the schedule as CSV/HTML (both already available via
   `[OutputFile]` and `MiniExcelLibs`), and let the existing Schedules addin produce the PDF.
3. Keep the PDF export as the existing addin path and make only the *quantification* a script.

For Finishing this is a non-issue: `Table()` output is exactly what a QS reviews.

---

## 7. Recommendation

**Build both as gallery scripts first.** Concretely:

1. **`Paracore-Finishing`** — a script source whose entry script calls the six `Inspect*Finishes`
   inspectors and `GetFinishingTakeoff`/`GetPaintingTakeoff` directly, with a `Params` class holding
   the sub/super boundary filter (substructure / superstructure / all) and the include-exclude toggles.
   Rows are re-emitted **without** the `A.7`/`B.7` section code. A second, separate script in the
   same source is the **parameter-init tool** (`EnsureRoomParametersBound`,
   `EnsureDoorWindowClassifier`, `EnsureWallPurposeParameters`).
2. **`Paracore-Aluminum`** — a script source whose entry script calls `GetDwaScheduleRows()`,
   flattens the row into fabrication quantities (glazing area, RHS length **by profile type**, hosted
   doors/windows as structured rows), and shows them with `Table()`. The per-profile mullion counts
   are already computed inside `_dwaFingerprint` and currently discarded — that is the first thing
   to surface. Its init tool is the single `EnsureDoorWindowClassifier` call.
3. **Do the one-line engine change** (`extraDlls += "PdfSharp.dll"`) if you want PDF from the
   Aluminum script now; otherwise emit CSV/HTML first and add PDF later.

**Why this matches what you asked for.** It gives you separate, independently evolvable artifacts;
it keeps the REPL-verification advantage *automatically* rather than as a bootstrap you maintain;
it needs **zero** extraction, so the seam, the `_isDoorWin` duplication risk, and the drift rule
(project rule 14) never arise; there is no new ribbon, no installer, and no Revit restart per
iteration; and zoning becomes a presentation detail in the script instead of an engine concern.

**When to revisit this decision.** Only if you need either (a) **standalone distribution** — selling
Paracore-Aluminum to an aluminum subcontractor who does not own Paracore, or (b) a **rich custom
window** that a `Params` form cannot express. In that case the path is the traditional addin, and
`Docs/ADDIN_EXTRACTION_RESEARCH.md` is the blueprint: the seam is 6 helpers out and 5 in, the true
seam is 22 not 24, `BOQSectionParameter` reduces to a ~160-line slice for Aluminum and ~450 for
Finishing, and `_isDoorWin` must be moved to a neutral class first.

---

## 8. Open decisions for you

1. **Standalone or engine-dependent?** If the aluminum tool must ship to subcontractors who do not
   own Paracore, gallery scripts are out for that one and we go the addin route for it.
2. **PDF now or later?** Approve the one-line `extraDlls` change, or start with CSV/HTML?
3. **Where do the script sources live?** A new repo each (matching "separately evolve"), or one
   source with two scripts?
4. **Sub/super boundary filter semantics.** With no sub/super boundary level, everything currently lands in `sup` — which
   gives you "everything as one" for free. Confirm you want the checkbox to mean *filter the
   existing split*, not *re-derive the split*.
