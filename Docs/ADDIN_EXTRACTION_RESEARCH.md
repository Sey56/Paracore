# Addin Extraction Research — Paracore-Finishing & Paracore-Aluminum

**Date:** 2026-09-19
**Status:** Research complete. **No repos, projects, or engine files were created or modified.**
**Question answered:** *what do these two proposed addins use from the Paracore-Takeoff ecosystem, and what would have to come with them?*

Every number below was re-derived from source in this session. Where a claim was previously
believed and then contradicted by measurement, the measurement wins and the correction is stated.

---

## 0. Method, and one correction to a prior belief

The measurement path was, in order:

1. Enumerate the finishing module and the takeoff module from disk (`wc -l`, class declarations).
2. Count cross-section calls by name (17 section entry points).
3. Count the external symbol surface (`ScriptApi.`, `BOQSectionParameter.`, `LicenseContext.`, …).
4. **Find the project's own boundary gate** — `.repl/verify_module_boundary.py` — which already
   measures the finishing↔takeoff seam and *requires it to only ever shrink*.
5. Run that gate, then **re-measure the seam independently** with comments stripped.

**Correction.** An earlier ad-hoc scan of this session concluded the finishing module borrows
**three** plain static helpers from `TakeOffExtensions` (`_isCurtainWall`, `_typeName`,
`_getMaterial`). That scan only looked at helpers *defined inside the finishing files*. The
project's gate is authoritative and finds **six** forward helpers. The gate is right; the ad-hoc
scan was incomplete. The corrected figure is used throughout §1.4.

---

## 1. Task 1 — Paracore-Finishing

### 1.1 What the finishing subsystem actually is

One `public static partial class FinishingExtensions` in namespace `CoreScript.Engine.Globals`,
spread over **15 files / 7,973 lines**:

| File | Lines |
|---|---:|
| `Finishing.Contract.cs` | 129 |
| `Finishing.Shafts.cs` | 190 |
| `Finishing.Context.cs` | 239 |
| `Finishing.Inspectors.Column.cs` | 278 |
| `Finishing.Inspectors.Slab.cs` | 278 |
| `Finishing.Classifier.cs` | 318 |
| `Finishing.Common.cs` | 416 |
| `Finishing.Skirting.cs` | 421 |
| `Finishing.Inspectors.Beam.cs` | 560 |
| `Finishing.Inspectors.Wall.cs` | 611 |
| `Finishing.Exposure.cs` | 726 |
| `TakeOffFinishing.cs` | 768 |
| `Finishing.Inspectors.Room.cs` | 802 |
| `Finishing.Dwa.cs` | 1,002 |
| `Finishing.Collector.cs` | 1,235 |
| **Total** | **7,973** |

The split into `FinishingExtensions` vs `TakeOffExtensions` was made on **2026-09-17**. It is a
*source-level* split only — **neither is a separate project or assembly today.** The gate's own
header states the intent verbatim: *"The point of the split is that the finishing section is now a
NAMED, MEASURABLE thing, so a future extraction is mechanical."* This research is that extraction's
feasibility study.

The class declares **76 distinct static members: 16 public, 60 underscore-private.** The 16 public
members are the intended API:

```
CalcArea                  GetFinishingTakeoff        MeasureAllRoomFinishes
FaceKey                   GetPaintingTakeoff         MeasureRoomFinishes
FinClassifyElement        GetRoomFinishingSummary    ModelFingerprint
FinRoomBoundaryPolys      InspectBeamFinishes        InspectColumnFinishes
FromDouble                InspectRoomFinishes        InspectSlabFinishes
                          InspectWallFinishes
```

### 1.2 The entry points the user named

All six element/space inspectors the user listed are present and public:

| Entry point | Location |
|---|---|
| `GetRoomFinishingSummary(this Document)` | `Finishing.Common.cs:24` |
| `InspectBeamFinishes(this Document)` | `Finishing.Inspectors.Beam.cs:294` |
| `InspectColumnFinishes(this Document)` | `Finishing.Inspectors.Column.cs:72` |
| `InspectRoomFinishes(this Document, RoomFinishingMeasure? sink = null)` | `Finishing.Inspectors.Room.cs:32` |
| `InspectSlabFinishes(this Document)` | `Finishing.Inspectors.Slab.cs:34` |
| `InspectWallFinishes(this Document)` | `Finishing.Inspectors.Wall.cs:261` |

Plus the two takeoff-export entry points the user also wants: `GetFinishingTakeoff` and
`GetPaintingTakeoff`, both in `TakeOffFinishing.cs`.

Note `InspectRoomFinishes` carries an optional `RoomFinishingMeasure? sink` — a **typed measurement
sink**. That is the `.Table()`-equivalent path the user referenced, and it is what
`MeasureRoomFinishes` / `MeasureAllRoomFinishes` drive. It is already designed to be called by a
non-engine host.

### 1.3 Does finishing reach into the other takeoff sections?

**No. Zero calls.** Measured against 17 section entry points — `GetConcreteSummary`,
`GetEarthworkTakeoff`, `GetMasonryBlockWorkTakeoff`, `GetRoofingTakeoff`, `GetJoineryTakeoff`,
`GetGlazingTakeoff`, `GetSteelTonnageSummary`, `GetRebarSummary`,
`GetCurtainWallAssembliesTakeoff`, `GetMetalWorkTakeoff`, `GetWaterproofingTakeoff`,
`GetLinearQuantities`, `GetDoorScheduleRows`, `GetWindowScheduleRows`, `GetDwaScheduleRows`,
`GetArchitecturalTakeoff`, `GetFormworkTakeoff` — **every one returns 0.**

This is the single most important structural finding for Task 1: **the cut is clean.** The
finishing subsystem is a leaf, not a hub. Extracting it cannot destabilise the other 16 sections
through a call edge, because there is no call edge.

`TakeOffDiagnostics` and `TakeOffValidation` are also **not referenced** by finishing (0 each).

### 1.4 The seam — the coupling that does exist

There *is* coupling, but it is not call-based; it is **plain-static-helper sharing inside the
shared namespace**. The project already formalises this as "the seam", and already gates it.

**The gate's result (`.repl/verify_module_boundary.py --report`, run this session):**

```
finishing module :  14 files declare FinishingExtensions
other sections   :  18 files declare TakeOffExtensions

seam: finishing -> TakeOffExtensions
  Finishing.Collector.cs           2  _isCurtainWall, GetAllTakeoffs
  Finishing.Common.cs              2  _isCurtainWall, _collectBeamSideArea
  Finishing.Context.cs             1  _isCurtainWall
  Finishing.Dwa.cs                 1  _typeName
  Finishing.Inspectors.Beam.cs     1  _typeName
  Finishing.Inspectors.Column.cs   1  _typeName
  Finishing.Inspectors.Room.cs     1  _isCurtainWall
  Finishing.Inspectors.Slab.cs     1  _typeName
  Finishing.Inspectors.Wall.cs     2  _isCurtainWall, _typeName
  TakeOffFinishing.cs              4  _isCurtainWall, _typeName, _getMaterial, _getStairRunGeometry

seam: other -> FinishingExtensions
  TakeOffArchitectural.cs          1  _isWetRoom
  TakeOffCurtainWalls.cs           1  _isDoorWin
  TakeOffSchedules.cs              1  _isDoorWin
  TakeOffStructural.cs             3  _FaceCoveredArea, _RectUnionArea, _FaceBox
  TakeOffValidation.cs             2  _isWetRoom, _StairShafts

seam size: 24 helper reference(s) (baseline 24)
[PASS] boundary intact
```

**Forward seam (finishing borrows) — 6 distinct helpers:**

| Helper | Declared in | Used by |
|---|---|---|
| `_isCurtainWall` | `TakeOffArchitectural.cs:355` | 6 finishing files |
| `_typeName` | `TakeOffBOQ.cs:134` | 6 finishing files |
| `_getMaterial` | `TakeOffBOQ.cs:17` | `TakeOffFinishing.cs` |
| `_collectBeamSideArea` | `TakeOffArchitectural.cs:627` | `Finishing.Common.cs` |
| `_getStairRunGeometry` | `TakeOffStructural.cs:291` | `TakeOffFinishing.cs` |
| `GetAllTakeoffs` | `TakeOffBOQ.cs:557` | *comment only — see below* |

**Reverse seam (takeoff borrows from finishing) — 5 distinct helpers:**

| Helper | Declared in | Borrowed by |
|---|---|---|
| `_isDoorWin` | `Finishing.Dwa.cs:991` | `TakeOffCurtainWalls.cs`, `TakeOffSchedules.cs` |
| `_isWetRoom` | `Finishing.Common.cs:391` | `TakeOffArchitectural.cs`, `TakeOffValidation.cs` |
| `_FaceCoveredArea` | `Finishing.Exposure.cs` | `TakeOffStructural.cs` |
| `_FaceBox` | `Finishing.Context.cs:27` | `TakeOffStructural.cs` |
| `_RectUnionArea` | `Finishing.Exposure.cs:374` | *comment only — see below* |

#### Correction: the true seam is 22, not 24

The gate counts a helper when its **name appears anywhere in the file**, including comments. Two of
its 24 hits are comment-only. Verified individually:

- `Finishing.Collector.cs:1013` — `//    bundled GetAllTakeoffs flow (single call, same process).` — 1 occurrence, a comment.
- `TakeOffStructural.cs:1127` — `// coplanar-hidden model (_FaceCoveredArea / _CoverRects / _RectUnionArea)` — 1 occurrence, a comment.

An independent re-measure with comments and string literals stripped gives:

```
TOTAL seam  with-comments = 24   true-code = 22
```

So the **true seam is 22**: 15 forward + 7 reverse. The gate's error direction is *conservative*
(it can only over-count, so it cannot let real coupling slip through), which is why this is a
note, not an alarm — but it does mean those two rows can never be "lowered", and the gate's
`EXPECTED_SEAM` can never reach the truth without a strip step.

**This also matters for the extraction:** the true forward seam is 15 references across 10 files
in 5 helpers — small enough to be genuinely mechanical.

### 1.5 ⚠ The one real blocker — and it is already solved in this repo

The finishing code calls `ScriptApi` **64 times**:

| Member | Count |
|---|---:|
| `ScriptApi.GetElements` | 49 |
| `ScriptApi.Selection` | 6 |
| `ScriptApi.Println` | 6 |
| `ScriptApi.UIDoc` | 3 |

`ScriptApi` is a facade over an ambient execution context, and it **throws without one**:

```csharp
// CoreScript.Engine/Globals/ScriptApi.cs:29
private static ExecutionGlobals Globals => ExecutionGlobals.Current.Value
    ?? throw new InvalidOperationException(
        "Script context is not available. Ensure the script is run through the engine.");
```

A plain Revit addin has no script host, so on first reading this looks like a rewrite of 64 call
sites. **It is not — and the repo already proves it.**

- `ExecutionGlobals.Current` is `public static readonly AsyncLocal<ExecutionGlobals>` — its `.Value` is settable.
- `ExecutionGlobals.SetContext(ExecutionGlobals)` and `ClearContext()` are **public static**.
- `ICoreScriptContext` is a **12-member interface** (`UIApp`, `UIDoc`, `Doc`, `Println`, `Print`,
  `LogError`, `AddStructuredOutput`, `PrintCallback`, `PrintLog`, `IsReadOnly`,
  `PipelineDiagnostics`, `Parameters`).
- **`Paracore.Addin` already contains two implementations:** `ServerContext` (98 lines,
  `Context/ServerContext.cs`) and `WatchdogContext` (53 lines, `Services/WatchdogContext.cs`).
- **`Paracore.Addin/App/ParacoreApp.cs:135-151` already performs the exact bootstrap:**

```csharp
// Initialize Global Context for ScriptApi access
var ctx = new WatchdogContext(uiApp, doc, watchdog.Parameters);
var execContext = new ExecutionGlobals(ctx, watchdog.Parameters);
ExecutionGlobals.SetContext(execContext);
...
finally { ExecutionGlobals.ClearContext(); }
```

`WatchdogContext` is self-contained: it takes `(UIApplication, Document, Dictionary<string,object>)`
— exactly what an `IExternalCommand.Execute` already holds — writes prints to an in-memory list,
and has no gRPC, no channel, and no file I/O except `LogError`.

**Consequence:** the Finishing addin can be a **near-verbatim fork** of the 15 files. All 64
`ScriptApi` calls — `GetElements`, `Selection`, `UIDoc`, `Println` — work unchanged once the
command installs a context around the call. The finishing code was in fact *written* for this:
`Finishing.Dwa.cs` already notes that a doc-based fingerprint is used *"because this method is also
called from the addin UI where no script context exists."*

### 1.6 Everything else finishing needs

Helper extension methods (shared root `Globals/`, resolve through the common namespace — **not**
seam coupling):

| Call | Count | Home |
|---|---:|---|
| `.GetNum(` | 38 | `ElementParamExtensions.cs` |
| `.GetStr(` | 20 | `ElementParamExtensions.cs` |
| `.GetBoundingBox(` | 18 | `ElementExtensions.cs` |
| `.GetLength(` | 13 | `ElementGeometryExtensions.cs` |
| `.GetInt(` | 5 | `ElementParamExtensions.cs` |
| `.ResolveParam(` | 2 | `ElementWriteExtensions.cs` |

Type surface:

| Type | Refs | Notes |
|---|---:|---|
| `FinishingSettings` | 19 | `Globals/FinishingSettings.cs` (152 lines); persists to `%APPDATA%\paracore-data\paracore-takeoff\finishing_settings.json` |
| `BOQSectionParameter` | 20 | see below |
| `RoomFinishingMeasure` | 17 | defined locally, `Finishing.Contract.cs:73` |
| `TakeOffExtensions` | 10 | the seam |
| `ZoneRule` | 9 | `TakeOff/ZoneRule.cs` (55 lines) — **already a neutral class** |
| `LicenseContext` | 8 | `Globals/LicenseContext.cs` (77 lines) |
| `ShaftCtx` | 7 | defined locally, `Finishing.Shafts.cs:31` |
| `FinishingBucket` | 4 | defined locally, `Finishing.Contract.cs:56` |
| `EnsureRoomParametersBound` | 3 | `BOQSectionParameter` |

`BOQSectionParameter` is used only through **six** members — so the 1,800-line file is not the
include it appears to be:

| Member | Refs | Location |
|---|---:|---|
| `GetBoundaryElevationM` | 7 | `:1714` |
| `Config` | 4 | lazy JSON config, `LoadConfig` at `:126` |
| `EnsureRoomParametersBound` | 3 | `:623` (~93 lines) |
| `EnsureDoorWindowClassifier` | 3 | `:716` (~100 lines) |
| `IsGradeSlab` | 2 | `:1169` region |
| `EnsureWallPurposeParameters` | 1 | `:835` (~100 lines) |

`Config` reads `Paracore_BOQ_Standard.json` (10,943 B) from beside the engine DLL, `Config/`, or
`%ProgramData%\Paracore\`. A forked addin must ship that JSON or carry an embedded fallback.

---

## 2. Task 2 — Paracore-Aluminum

### 2.1 What the DWA path is

"DWA" = **Door/Window Assembly** — a curtain wall that is checked as a door/window assembly rather
than plain glazing. The user's intent maps onto this exactly: in Ethiopia most doors, windows, or
combinations are site-assembled and traded as **"Aluminum Work"**, and the aluminum subcontractor
needs the glazing panels, the mullions/RHS, and the hosted doors and windows.

The engine already models this. `GetDwaScheduleRows(this Document)` (`TakeOffSchedules.cs:98`)
returns, per structurally-identical group:

```
Id, Family_Type, Width_mm, Height_mm, Count, Marks, Level,
Mullions, Panels, Mullion_Length_m, Hosted_Doors[], Hosted_Windows[]
```

`Mullion_Length_m` is summed from each `Mullion.LocationCurve.Length` — with a documented trap at
`:157-160`: a mullion's `Location` is a `LocationPoint`, so the old `Location is LocationCurve`
test always failed and reported **0.0 m for every DWA**. The current code reads the `LocationCurve`
property directly. That is a real, already-fixed bug worth not re-introducing in a fork.

### 2.2 Engine surface for the DWA exporter

| Piece | Location | Size |
|---|---|---:|
| `GetDwaScheduleRows` | `TakeOffSchedules.cs:98-221` | ~124 lines |
| `_hostedOnCurtainWall` | `:22` | small |
| `_LevelList` | `:228` | small |
| `_dwaFingerprint(doc, cw, tn, w, h)` | `:258` | ~54 lines |
| `_mark` | `:313` | small |
| `_numericMark` | `:319` | small |
| `_dimsFromBBox` | `:326` | small |
| `_typeName` | `TakeOffBOQ.cs:134` | — |
| `_getBoundingHeight` | `TakeOffBOQ.cs:121` | — |
| `_isDoorWin` | **`Finishing.Dwa.cs:991`** | ~10 lines |
| `EnsureDoorWindowClassifier` | `BOQSectionParameter.cs:716-816` | ~100 lines |
| `_MigratePrefixedBinding` | `BOQSectionParameter.cs:396-453` | ~58 lines |

**The DWA closure is roughly 250–400 lines — not a section-sized include.** `_dwaFingerprint` is
deliberately document-based (`FilteredElementCollector`, not `ScriptApi`) precisely so it works in
the addin UI. Note this means **the Aluminum addin does not need an `ExecutionGlobals` bootstrap at
all** — unlike the Finishing addin.

### 2.3 The `IsDoorWin` classifier, and why it crosses the two tasks

`_isDoorWin` (`Finishing.Dwa.cs:991`) is the single semantic that defines what a DWA *is*:

```csharp
internal static bool _isDoorWin(Wall cw)
{
    if (cw == null) return false;
    try { if (cw.WallType.Kind != WallKind.Curtain) return false; } catch { return false; }
    var p = cw.ResolveParam("IsDoorWin");
    if (p != null && p.HasValue && p.StorageType == StorageType.Integer)
        return p.AsInteger() == 1;
    return (_typeName(cw) ?? "").StartsWith("DWA", StringComparison.OrdinalIgnoreCase);
}
```

Its contract, from its own doc comment: the decisive classifier is the shared **`IsDoorWin`** Yes/No
parameter on the curtain wall, installed by `EnsureDoorWindowClassifier` with `HideWhenNoValue = true`
so the checkbox appears **only** on curtain walls. Values are written only there, so Basic/Stacked
walls never show it. It is **seeded once** from the legacy `"DWA"` type-name prefix, then
authoritative. Only curtain walls can ever be a DWA. Unchecked curtain walls are **glazing**.

Three consequences the extraction must respect:

1. **`IsDoorWin` is a routing key, not a label.** Changing the parameter name silently reclassifies
   every curtain wall between "DWA" and "glazing" — i.e. between two *different trades* (aluminum
   sub-contract vs glazing). The project's own rule 11 applies with force here.
2. **There is a migration alias.** `BOQSectionParameter.cs:743-744` defines
   `newName = "IsDoorWin"` / `legacyName = "Paracore IsDoorWin"`, and
   `ElementParamExtensions.cs:148` maps `["Paracore IsDoorWin"] = "IsDoorWin"` so bare names
   transparently resolve to migrated shared parameters.
3. **The Aluminum addin depends on the Finishing module.** `TakeOffSchedules.cs:8` declares
   `using static CoreScript.Engine.Globals.FinishingExtensions;` in order to reach `_isDoorWin`.
   **This is the one place where the two proposed addins are genuinely entangled.** If both are
   extracted and each gets its own copy of `_isDoorWin`, they can drift — and a drift here means the
   takeoff and the aluminum addin disagree about which walls are aluminum work.

`ZoneRule` is the precedent for the remedy: it was moved out of `TakeOffExtensions` into a class
belonging to **neither** side, which *removed* the coupling instead of counting it (seam 27 → 24,
2026-09-18). `_isDoorWin` is a candidate for the same treatment.

### 2.4 Addin surface for the DWA exporter

| File | Lines | Role |
|---|---:|---|
| `Paracore.Addin/Commands/SchedulesCommand.cs` | 463 | WPF UI; `MakeSection(body, "DWA Schedule", "DWA", …)` at `:132`; `Collect(name)` at `:243` |
| `Paracore.Addin/Services/SchedulesExportService.cs` | 1,307 | the PDF renderer |
| `Paracore.Addin/Services/SchedulesOrientationService.cs` | 324 | elevation/plan orientation |
| `Paracore.Addin/App/ParacoreApp.cs` | 504 | ribbon tab/panel/button scaffold |

`Collect("DWA")` is document-agnostic and reads the engine's anonymous row **by reflection**
(`_i`, `_s`, `_d`, `_list` helpers), which is what lets it run outside the engine. It sets
`LicenseCtx.Tier = "enterprise"` and resets in a `finally`:

```csharp
LicenseCtx.Tier = "enterprise";
IEnumerable<object> raw = name.StartsWith("Door") ? _doc.GetDoorScheduleRows()
    : name.StartsWith("Window") ? _doc.GetWindowScheduleRows()
    : _doc.GetDwaScheduleRows();
```

PDF side: `PDFsharp` **6.2.0**. `SchedulesExportService.cs` opens with `WindowsFontResolver :
IFontResolver` — required because *"PDFsharp needs a font resolver inside Revit's isolated load
context — its default (GDI+) resolver can't enumerate fonts there, so it reports 'No appropriate
font found'."* It reads real font files from the Windows Fonts folder. This class is **mandatory**
in any fork; omitting it produces a blank-font PDF, not an error.

Public surface: `RenderShots`, `BuildPdf(title, project, …)`, `ScheduleRow`
(`Type, Marks, Level, Details, Kind, ElevationImagePath, PlanImagePath`).

### 2.5 What the Aluminum addin needs beyond the DWA schedule

The user's stated goal is to *"quantify the glazings, the mullions or rhs, and the doors and windows
hosted in them."* Measured against the existing row, the gap is:

- **Glazing area** — the row gives `Panels` (a **count**) but no panel area. Glazing m² must be
  derived (panel dimensions, or `Width × Height − mullion share`). New work.
- **RHS/mullion quantities** — the row gives `Mullions` count and total `Mullion_Length_m`. For a
  fabrication BOQ the subcontractor needs **length by profile type**, not a single total.
  `_dwaFingerprint` already computes a per-mullion-type count internally (`M:{type}={count}`) and
  then throws it away into the fingerprint string — that data is available and currently unused.
- **Hosted doors/windows** — already present as grouped strings
  (`"2 Door: Glass_Dbl_Door 1550×2075mm"`). Usable, but stringly-typed; a fork would want them as
  structured rows.

So Task 2 is not purely a lift-and-shift: the **exporter** is lift-and-shift, the **quantification**
is new development. That is consistent with the user's framing ("work on it separately to polish and
scale it").

---

## 3. The shared surface, ranked

| Dependency | Size | Finishing | Aluminum | Verdict |
|---|---:|---|---|---|
| `ICoreScriptContext` + `ExecutionGlobals` | 731 lines (uses ~30) | **required** | not needed | reuse engine as-is |
| `WatchdogContext` pattern | 53 lines | **required** | — | copy or share |
| `ScriptApi` facade | 593 lines | **required** (64 calls) | not needed | reuse engine as-is |
| `ElementParamExtensions` | 381 lines | required | required | reuse engine as-is |
| `ElementGeometryExtensions` | 131 lines | required | — | reuse engine as-is |
| `ElementExtensions` | 406 lines | required | — | reuse engine as-is |
| `ElementWriteExtensions` | 264 lines | required | — | reuse engine as-is |
| `LicenseContext` | 77 lines | required | required | reuse engine as-is |
| `FinishingSettings` | 152 lines | required | — | fork with the module |
| `ZoneRule` | 55 lines | required | — | **already neutral — the model to copy** |
| `BOQSectionParameter` | **1,800 lines** | 6 members (~450 lines' worth) | 2 members (~160 lines) | **slice, do not copy** |
| `Paracore_BOQ_Standard.json` | 10,943 B | required (via `Config`) | — | ship as content |
| `PDFsharp` 6.2.0 + `WindowsFontResolver` | package + ~50 lines | — | **required** | package + fork |
| `_isDoorWin` | ~10 lines | **declares it** | **needs it** | **⚠ single source of truth** |

---

## 4. Recommended strategy

### 4.1 Do not copy `CoreScript.Engine` wholesale

`CoreScript.Engine` carries `Microsoft.CodeAnalysis.*`, `RestSharp`, `SixLabors.ImageSharp`,
`MiniExcel`, `MathNet.Numerics`, and the full script-host machinery — none of which either addin
needs. Both addins should **`ProjectReference` the engine** the way `Paracore.Addin` already does,
and take only the types they use. This keeps the engine as the single source of truth for the
shared helpers and, critically, for `LicenseContext` and the shared-parameter plumbing.

### 4.2 Paracore-Finishing — fork 15 files + a 4-line bootstrap

Because the cut is clean (zero cross-section calls) and the `ScriptApi` problem is already solved
in-repo, the honest recommendation is a **fork, not a refactor**:

1. Fork the 15 files into the new project, namespace unchanged or renamed as a unit.
2. Supply the **5 forward seam helpers** (`_isCurtainWall`, `_typeName`, `_getMaterial`,
   `_collectBeamSideArea`, `_getStairRunGeometry`) — either copied into a local
   `TakeOffCompat.cs`, or lifted into a neutral class (the `ZoneRule` precedent) so both the
   takeoff and the addin share one definition.
3. Slice the 6 `BOQSectionParameter` members rather than the whole file.
4. Ship `Paracore_BOQ_Standard.json`.
5. Bootstrap the context in the command:

```csharp
var ctx = new WatchdogContext(uiApp, doc, new Dictionary<string, object>());
ExecutionGlobals.SetContext(new ExecutionGlobals(ctx, new Dictionary<string, object>()));
try { /* Inspect*Finishes / Get*Takeoff */ }
finally { ExecutionGlobals.ClearContext(); }
```

`WatchdogContext` is `IsReadOnly => true`, which is correct for an inspector that must not mutate the
model — but note `EnsureRoomParametersBound` / `EnsureDoorWindowClassifier` **do** start transactions
(the shared-parameter binding is model data). Those calls must stay inside the addin's own
transaction/`ExternalEvent`, and the read-only flag on the *script* context does not gate them.

### 4.3 Paracore-Aluminum — lift the exporter, build the quantification

1. Fork the DWA branch of `SchedulesCommand` (`MakeSection`/`Collect`) into a DWA-only command.
2. Fork `SchedulesExportService` + `SchedulesOrientationService` + `WindowsFontResolver`, and carry
   the `PDFsharp` 6.2.0 package reference.
3. Take the ~250–400-line DWA engine closure, **including `_isDoorWin`**.
4. Slice `EnsureDoorWindowClassifier` + `_MigratePrefixedBinding` (~160 lines).
5. Add the new quantification (glazing m², mullion/RHS length by profile type, structured hosted
   doors/windows) — this is the actual product work, and it belongs in the new addin, not the engine.

### 4.4 Resolve `_isDoorWin` deliberately, before either repo is created

This is the one decision that must be made *first*, because both addins will contain it:

- **Option A — neutral class (recommended).** Move `_isDoorWin` out of `FinishingExtensions` into a
  class belonging to neither side (the `ZoneRule` precedent). The seam drops by 2, both addins and
  the engine reference one definition, and drift becomes impossible. This also *shrinks the gate*,
  which is the direction the gate wants.
- **Option B — duplicate with an agreement gate.** Copy into each addin and add a check that both
  compute the same classification over a fixture model. Cheaper now, but it is exactly the
  "a rule that lives in N places must be changed in N places" failure the project has already been
  bitten by (rule 14 — the finishing model implemented three times, which was defect D36).
- **Option C — leave it.** Both addins fork it and the risk is accepted. Not recommended.

### 4.5 Sequencing

The user said *"we'll just do them one by one."* The research supports doing **Aluminum second**,
not first: it is the smaller cut (≈600 lines of fork + new work) but it depends on the decision in
§4.4, whereas Finishing is self-contained and its only blocker is already solved. Doing Finishing
first also surfaces any `ExecutionGlobals`-in-an-addin edge cases on the larger surface, where the
failure modes are easier to see.

---

## 5. Open risks and decisions needed

| # | Risk / decision | Severity | Note |
|---|---|---|---|
| 1 | `_isDoorWin` shared by both addins and the engine | **High** | Decide §4.4 before creating repos. Drift silently reprices a trade. |
| 2 | The gate over-counts by 2 (comments counted as borrows) | Low | Conservative direction; fix with a strip step if `EXPECTED_SEAM` is ever to reach 22. |
| 3 | A fork makes the finishing model live in **two** places | **High** | The project already has rule 14 (three implementations = D36). A second copy is a third. Needs an agreement gate, or the neutral-class treatment for the shared helpers. |
| 4 | `ExecutionGlobals` bootstrap inside a plain addin | Medium | Pattern proven at `ParacoreApp.cs:135`, but only in an `Idling`/watchdog path. Validate in a command path, in a transaction. |
| 5 | `EnsureRoomParametersBound` / `EnsureDoorWindowClassifier` write model data | Medium | They start their own transactions; they must not run inside a read-only context or a failing transaction. |
| 6 | `Paracore_BOQ_Standard.json` resolution | Low | `Config` looks beside the DLL, then `Config/`, then `%ProgramData%\Paracore\`. A fork that misses it silently falls back. |
| 7 | `Mullion_Length_m` regression | Low | The `LocationPoint` vs `LocationCurve` trap is already documented at `TakeOffSchedules.cs:157`. Preserve the fix. |
| 8 | Aluminum needs quantification the engine does not emit | — | Not a risk; scope. `Panels` is a count, not an area; per-profile mullion lengths exist inside `_dwaFingerprint` and are discarded. |
| 9 | License tier | Low | Both paths call `LicenseContext.RequireEnterprise`; the addin sets `Tier = "enterprise"` and resets in `finally`. A fork must keep the reset or leak the tier. |

---

## 6. Summary

**Paracore-Finishing is a clean, mechanical extraction.** 15 files / 7,973 lines, one class, **zero**
calls into any other takeoff section, and the only genuine blocker — 64 `ScriptApi` calls needing an
execution context — is already solved inside `Paracore.Addin` by a 53-line `ICoreScriptContext`
implementation and a 4-line `SetContext`/`ClearContext` bootstrap. What it must bring: 5 plain
static helpers across the seam, ~450 lines' worth of 6 `BOQSectionParameter` members, the shared root
extension helpers (reuse the engine), `FinishingSettings`, `ZoneRule`, `LicenseContext`, and the BOQ
config JSON.

**Paracore-Aluminum is smaller but is not a pure lift.** The DWA engine closure is ~250–400 lines
plus ~160 lines of shared-parameter plumbing; the addin side is the DWA branch of `SchedulesCommand`
plus the 1,631-line PDF pair and `PDFsharp` 6.2.0 with its mandatory `WindowsFontResolver`. The
existing row already carries mullion count, mullion length, panel count, and hosted doors/windows —
but the user's actual goal (glazing area, RHS length **by profile**, structured hosted units) is new
development, and that is the right place for it.

**The one thing to settle first** is `_isDoorWin`: it lives in the finishing module, the takeoff
schedules depend on it, and both new addins will need it. The project already has the right pattern
for this — `ZoneRule`, a neutral class created precisely to remove this kind of coupling instead of
counting it.
