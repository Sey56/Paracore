# CoreScript.Engine — Polish Review

**Date:** 2026-10-02
**Scope:** `paracore-pro/CoreScript.Engine` (the engine only; `Paracore.Addin`, `Paracore.Shim`,
`Paracore.Server` and the Python MCP are out of scope)
**Method:** static measurement, not impression. Every number below is reproducible with the two
probes in `.repl/` (`_engine_audit.py`, `_engine_files.py`). Where a number is a *lower bound*,
it says so.

---

## 0. Verdict

**The engine is in good shape and the core design is sound.** It is a 31,035-line codebase with
zero `TODO`/`FIXME`/`HACK` markers, 587 doc comments, a genuinely clever pipeline-diagnostics
mechanism, and a typo-tolerant discovery API that distinguishes "valid but empty" from "wrong
name" — which most codebases do not.

**It has one structural problem, and it is the one you spotted.** The engine's public surface is
roughly a quarter pure pass-through, and its visualization API declares **the same function 30
times** to reach **one** implementation. `.BarGraph()` is not two names for one function — it is
*four* names and five hops for one function, and it has **zero callers anywhere**.

The fixes are small, mechanical and low-risk. None of them touch the takeoff maths.

> ⚠ **A stale number, corrected.** An earlier inventory recorded this engine as ~9,400 LOC / 90 files.
> That figure covers only the **shared** part. Measured properly:

| Subset | Files | Lines | Share |
| :--- | ---: | ---: | ---: |
| `Globals/TakeOff/` — **Pro-only** | 37 | 17,306 | **56 %** |
| Everything else — **shared (free + pro)** | 87 | 13,729 | 44 % |
| **Total** | **124** | **31,035** | |

**This matters for any change here:** over half the engine exists in `paracore-pro` only, so
"polishing the engine" splits into two very different jobs — a shared edit (must land in *both*
repos via `sync-shared.ps1`) and a Pro-only edit (one repo). Everything recommended in §4 below
except P-1 touches the **shared** 44 %.

---

## 1. What the engine actually is

| Measure | Value |
| :--- | ---: |
| `.cs` files | 124 |
| Lines | 31,035 |
| Top-level types | 167 |
| Method declarations | 699 |
| **of which public** | **480** |
| `/// <summary>` tags | 587 |

**The shape is a three-layer static facade over extension methods:**

```
 script            GetElements("Walls").Where(...).GroupByParam(...).Table()
                   │
 ① ScriptApi       static facade — the script-facing name space
                   (ScriptApi.cs 26 public + TakeOffGlobals.cs 55 public + ScriptApi.Sentinels.cs)
                   │
 ② Extensions      the real work: TakeOffExtensions, FinishingExtensions,
                   ElementExtensions, CollectionExtensions …  (partial classes, split by concern)
                   │
 ③ Output          Output.Show(string type, object data) — the ONE rendering implementation
                   │
                   context.AddStructuredOutput(type, json)  →  gRPC  →  rap-web
```

Two entry conventions coexist and both are legitimate:

- **Partial split by concern** — `Finishing.Collector.cs`, `Finishing.Classifier.cs`,
  `Finishing.Inspectors.Wall.cs` … all contribute to one `FinishingExtensions`. The file name is
  a *sub-part label*, not a class name. **This is good practice and worth keeping.**
- **Legacy** — `ElementDoorExtensions.cs` actually declares `ElementExtensions`. Same idea, older
  naming. Harmless, but inconsistent.

---

## 2. Strongest features — protect these

These are the reasons the engine is pleasant to script against. I would not touch any of them.

### 2.1 `PipelineEnumerable<T>` — the transparent funnel

`Globals/PipelineEnumerable.cs`. It exploits the fact that C# resolves *instance* methods before
`System.Linq` extension methods, so it can shadow `.Where()` with an instrumented version and
report the element count at every stage — **without the script author writing any instrumentation**:

```
Pipeline: [593 → 29 → 9 → table]
```

This is the single best diagnostic in the codebase. It answers the exact question that made this
project hard: *"my takeoff returned nothing — where did the rows go?"* It is invisible when it
works and priceless when it doesn't. **Do not refactor it.**

### 2.2 `GetElements(string)` — three failure modes, correctly distinguished

`ScriptApi.cs:402`. Most discovery APIs collapse every problem into "not found". This one separates:

1. **Valid category, 0 instances** → empty list + `[INFO] … valid Class or Category with 0 instances`.
2. **Type fallback** (asked for instances, only types exist) → `[INFO] … Fallback to Types`.
3. **Genuine typo** → `ArgumentException` with up to 3 suggestions: *"Did you mean 'Door' or 'Doors'?"*

That is a well-reasoned API. The `[INFO]` transparency lines are the difference between a user
learning something and a user guessing.

### 2.3 The extension-method vocabulary

`ElementExtensions` / `CollectionExtensions` / `ElementParamExtensions` etc. expose Revit via
LINQ-shaped chains (`.CombinedParams().Table()`, `.Materials()`, `.GroupByParam("Type","Volume","m3")`).
This is the engine's actual product. It is documented in `Docs/EXTENSION_METHODS.md` (567 lines).

### 2.4 The execution deadline

`SetExecutionTimeout(int)` + `Core/Rewriters/TimeoutRewriter.cs` + a deadline check that throws
with a *remedy in the message*. Given this project's history with a takeoff that simply timed out,
a hard, self-explaining deadline is exactly right.

### 2.5 `TakeOffDiagnostics`

Records errors and skips rather than dropping them silently. Same family as the `[INFO]` lines —
the engine tries to tell you what it could not do.

### 2.6 QS inputs kept out of the model

`EarthworkSettings` / `FinishingSettings` / `RebarSettings` hold the QS-only numbers (screed
thickness, blinding depth) so they never have to be modelled. Clean separation, matches the
project's stated design.

### 2.7 Comment archaeology

`0` debt markers, but real measurements preserved in prose — *"measured on wall **544462**, the DWA…"*,
*"the 5.24-vs-5.44 bug on the DWA wall"*. That is the right instinct: the *why* is recorded next to
the code. It is not machine-checkable, but it is far better than nothing.

---

## 3. Problems, ranked

### P1 — The visualization family: 30 declarations, 1 implementation ⚠ **the real finding**

`.BarGraph()` is the tip of it. One rendering implementation —
`Output.Show(string type, object data)` at `ExecutionGlobals.cs:163` — is reached through **30
public declarations across three layers**:

| Layer | File | Declarations | Count |
| :--- | :--- | :--- | ---: |
| ① `ScriptApi` (static) | `ScriptApi.cs` | `Show(string,object)` 135, `Table(object)` 143, `Table(IEnumerable<Element>)` 155, `BarChart` 279, `BarGraph` 285, `PieChart` 293, `PieGraph` 299, `LineChart` 307, `LineGraph` 313 | **9** |
| ② `ExecutionGlobals` (instance) | `ExecutionGlobals.cs` | `Show(object)` 560, `Table(object)` 565, `BarChart` 570, `BarGraph` 575, `PieChart` 580, `PieGraph` 585, `LineChart` 590, `LineGraph` 595 | **8** |
| ② `VisualizationExtensions` (generic) | `ExecutionGlobals.cs` | `Show<T>` 657, `Table<T>` 663, `BarChart<T>` 707, `BarGraph<T>` 713, `PieChart<T>` 715, `PieGraph<T>` 721, `LineChart<T>` 723, `LineGraph<T>` 729 | **8** |
| ③ `Output` | `ExecutionGlobals.cs` | `Show(string,object)` 163 **(the implementation)**, `BarChart` 312, `PieChart` 317, `Table` 322, `LineChart` 327 | **5** |
| | | | **30** |

The actual call chain for `.BarGraph()` on a list:

```
VisualizationExtensions.BarGraph<T>      (713)   ← the name you typed
  → VisualizationExtensions.BarChart<T>  (707)   ← hop 1
    → ExecutionGlobals.BarChart(object)  (570)   ← hop 2
      → Output.BarChart(object)          (312)   ← hop 3
        → Output.Show("chart-bar", data) (163)   ← the ONE implementation
```

**Five hops, four names, one function.** Measured across the whole engine: **121 delegation-only
methods, 117 of them public — 24% of the entire public API is a pass-through** — and **94 of
those 117 sit in just three files** (`TakeOffGlobals.cs` 55, `ExecutionGlobals.cs` 22,
`ScriptApi.cs` 17).

**Important distinction.** Not all pass-through is bad:

- `TakeOffGlobals.cs`'s 55 one-liners are a **legitimate facade** — each exposes a *distinct*
  capability under a flat name so scripts can write `GetConcreteTakeoff()` instead of
  `TakeOffExtensions.GetConcreteTakeoff(Doc)`. One name per capability. **KEEP.**
- The `*Graph` set is **redundant aliasing** — the *same* capability under *two* names.
  **REMOVE.**

### P2 — The `*Graph` aliases: 9 declarations, and a name the ecosystem depends on

Three names × three layers = **9 declarations** existing only to offer a second spelling.

> ⚠⚠ **CORRECTED 2026-10-02 — this section was WRONG.** The original claim was "zero call sites
> across the entire workspace". That search covered only `paracore` + `paracore-pro`. Searching
> the *whole* `Paracore/` workspace finds the `*Graph` names in **~15 files across 5 other
> repos** — and crucially, **the MCP actively instructs the AI to emit them**:
>
> | Repo | Evidence |
> | :--- | :--- |
> | `paracore-gen` | `mcp_core/skills/display-visualize/SKILL.md:55-57,60` — *"NOTE: `.Bar()` does NOT exist — use `.BarGraph()`."* · `prompts/catalog.md:17,164,182-187,232` · `prompts/globals.md:24-26` · `prompts/common-patterns.md:35` · `skills/aggregate-group/SKILL.md:19,51` · `mcp_server.py:391` · `SKILLS.md:33` |
> | `paracore-help` | `docs/scripting-reference/globals.md:72-74` · `docs/interactive-repl/index.mdx:130-131,143,187` · `docs/extension-methods/collection-operations.mdx:82-84` · `docs/authoring/vscode.mdx:57-59` |
> | `corescript-vscode` | `ai-instructions.md:57-59,303-304,346,716,811` · `copilot-instructions.md` (same content) |
> | `paracore-examples` | `06_Showcase_Demos/ProjectDashboard/Scripts/ProjectDashboard.cs:29` |
> | `docs/` | `In-App-Agent-Interaction.txt` — a design discussion of exactly this ambiguity |
>
> **No executable script calls `.BarGraph()`** — that half was right. But the *contract* does.
> The MCP's prompts and skills are how the AI decides what to write, so deleting `BarGraph`
> would make the MCP instruct the agent to call a method that no longer exists.
>
> So this is **not dead weight — it is a deliberate, documented, ecosystem-wide affordance.**
> And the pair is **inverted** between the engine and its consumers: the engine's doc calls
> `BarGraph` the *alias* (`/// <summary> Alias for BarChart. </summary>`), while the MCP, the
> help site and the UI label ("Bar Graph") treat `*Graph` as the *primary*.
>
> **Verdict: DO NOT REMOVE unilaterally.** Either name may survive, but the choice must be made
> once and applied across all consumers. See §4 REMOVE and §7 (open decision).
>
> The related point still stands: **the engine contains `0` `[Obsolete]` attributes**, so nothing
> can be retired with a compiler warning — a rename here is a hard break by construction.

### P3 — `Show` ≡ `Table` is a synonym

`ExecutionGlobals.Show(object)` (560) → `Output.Table(data)` → `Show("table", data)`.
`VisualizationExtensions.Show<T>` (657) → `Table(data)`. The *untyped* `Show` is an exact synonym
of `Table` at two of three layers — 6 declarations. (The *typed* `ScriptApi.Show(string,object)` is
genuinely different and should stay.)

### P4 — `Table`'s real logic exists twice

`ScriptApi.Table(IEnumerable<Element>)` (155–187) and `VisualizationExtensions.Table<T>`
(663–705) are **the same code**: identical `isType` branch, identical
`"Family Name"`/`"Type Name"` vs `"Family"`/`"Type"` columns, identical anonymous `Id/Family/Type/Category`.
This is duplicated *logic*, not a thin wrapper — so the two copies can drift. The comment at 149–153
documents only one of them.

### P5 — `TakeOffGlobals.cs` declares `ScriptApi` — the file name lies

`Globals/TakeOff/TakeOffGlobals.cs` declares `public static partial class ScriptApi`. No type
named `TakeOffGlobals` exists anywhere. The file is really "the Pro half of `ScriptApi`" and
should be `ScriptApi.TakeOff.cs` — which is exactly the convention already used by
`ScriptApi.Sentinels.cs`.

### P6 — `ExecutionGlobals.cs` holds 8 types in 731 lines

Declares `ElementIdConverter`, `RevitElementConverterFactory`, `DocumentConverter`, `XYZConverter`,
`ParameterConverter`, `Output`, `ExecutionGlobals`, `VisualizationExtensions`. The file name matches
none of them. Four JSON converters, the renderer, the globals and the extension layer in one file.

### P7 — `ValidationAttributes.cs` declares 21 types

The largest mixed-responsibility file in the engine. 21 attributes/enums in one place.

*(14 files declare >1 top-level type in total. These two are the outliers.)*

### P8 — 257 empty-or-comment-only `catch` blocks

`catch { }` / `catch (Exception) { }` / `catch { //… }` — a **lower bound** (it does not count
catches with a body). Concentrated in `Finishing.Collector.cs` (41), `TakeOffEarthwork.cs` (31),
`TakeOffValidation.cs` (20).

**Most of these are deliberate and correct.** A missing Revit parameter is normal, not exceptional,
and throwing on it would be worse. But each one is a place where a *real* defect becomes
indistinguishable from a normal absence — the same failure class as a row emitted only `if (> 0)`.
This is not a bug to fix; it is a **list of 257 places where a bug would be invisible.** Worth
knowing where they are before chasing a missing quantity.

### P9 — There is no test suite

`Tests/` = 3 files, **263 lines, zero assertions, no test framework referenced** in the `.csproj`.
`CodeRunnerTests.cs` defines `RunReadOnlyTest()` / `RunWallCreationTest()` which must be invoked
manually inside Revit and only `Print` their results. `grep Assert` over the folder returns nothing.

The engine's real verification is the REPL and `.repl/` — which is a legitimate strategy for
geometry, but it leaves the *pure* code (parsers, rewriters, unit conversion, section routing)
completely uncovered. See §4 ADD-1.

### P10 — Two file-naming conventions coexist

45 files whose name matches no type they declare. Almost all are the intentional partial-split
convention. The inconsistency is cosmetic, but it costs a reader time — the only outright wrong
name is P5.

### P11 — `ToNotebook<T>()` has two hazards

`Globals/NotebookExtensions.cs`. It exports to Jupyter and launches VS Code. Genuinely nice. But:

- **Fixed data path** — every call writes `%APPDATA%\paracore-data\notebooks\scratch\data.json`, and
  every generated notebook `read_json`s that *same* file. Reopening an older notebook later silently
  reads the newest data. A plausible-looking wrong answer.
- It shells out to `code` with no check that VS Code exists (the `catch` does report it, at least).

---

## 4. KEEP / REMOVE / POLISH / ADD

### KEEP — do not touch

| Item | Why |
| :--- | :--- |
| `PipelineEnumerable<T>` | Best diagnostic in the codebase. |
| `GetElements(string)` + `[INFO]` transparency | Three failure modes, correctly separated. |
| `TakeOffGlobals.cs` 55-method facade | Legitimate facade — one name per capability. |
| Partial-split convention (`Finishing.Collector.cs` …) | Good practice; the model exists 3× already (D36), the file split helps. |
| `SetExecutionTimeout` + `TimeoutRewriter` | Correct response to this project's history. |
| The extension-method vocabulary + `EXTENSION_METHODS.md` | The product. |
| `TakeOffDiagnostics`, `[INFO]` lines, comment archaeology | The engine's honesty. |
| All takeoff maths | Out of scope. Untouched by anything here. |

### REMOVE — small, mechanical

| # | Remove | Where | Blast radius |
| :--- | :--- | :--- | :--- |
| ~~R1~~ | ~~`BarGraph` / `PieGraph` / `LineGraph` — 9 declarations~~ | — | ⛔ **WITHDRAWN 2026-10-02.** The premise was false — see the correction in P2. These names are *taught* by the MCP prompts, the help site and the VS Code instructions. Removing them breaks agent-authored scripts until every consumer is updated. |
| ~~R2~~ | ~~The untyped `Show(object)` / `Show<T>` synonyms — 2 declarations~~ | — | ⛔ **WITHDRAWN 2026-10-02, on the same evidence that killed R1.** The technical claim is *correct* — verified in source: `ExecutionGlobals.Show(object)` (now `ExecutionGlobals.cs:247`) is `Output.Table(data)`, byte-identical to `Table(object)` (252); `VisualizationExtensions.Show<T>` (`VisualizationExtensions.cs:46`) is `…Current.Value?.Table(data)`, identical to `Table<T>`. **But `.Show()` is documented public API** in five consumer files — `paracore-help/docs/extension-methods/collection-operations.mdx:85`, `…/authoring/inspector.mdx:21`, `paracore/README.md:43`, `paracore-pro/README.md:43`, `paracore-gen/…/prompts/catalog.md:185`. Removing 2 one-liners would hard-break documented scripts for **zero** functional gain. Rule 2 again: *no callers* ≠ *not load-bearing* when the name is the contract. |
| R3 | The duplicated `Table` element-adaptation logic | `ScriptApi.cs` 155–187 and `VisualizationExtensions.Table<T>` 663–705 | ⚠ **NOT a delete — an EXTRACTION.** The two are *not* equivalent: `ScriptApi` reaches the renderer through `Globals.Output` (a property that **throws** if the context is null, `ScriptApi.cs:29`), while the extension uses `ExecutionGlobals.Current.Value?.` (**silently no-ops**), and the extension has a non-element `else` branch. Extract the shared adaptation into one helper; keep both call paths and both behaviours. |

**Net: 1 duplicated logic block collapsed (R3 → `Output.AdaptElementsForTable`). R1 and R2 both
withdrawn — the apparent redundancy in the visualization family is documented, ecosystem-facing
affordance, not debt.**

⚠ **Shared-file rule:** `ScriptApi.cs` and `ExecutionGlobals.cs` are **shared** — verified
2026-10-02: both 731 lines, `diff --strip-trailing-cr` → IDENTICAL. Any change lands in **both**
repos via `sync-shared.ps1` (direction: **pro → free**, one way).

### POLISH — keep, but improve

| # | Polish | Why |
| :--- | :--- | :--- |
| P-1 | Rename `TakeOffGlobals.cs` → `ScriptApi.TakeOff.cs` | ✅ **DONE 2026-10-02.** The name lied (P5). Matches the existing `ScriptApi.Sentinels.cs` convention. |
| P-2 | Split `ExecutionGlobals.cs` (8 types, 731 lines) | ✅ **DONE 2026-10-02.** Converters → `JsonConverters.cs` (134 L) · `Output` → `Output.cs` (241 L) · `VisualizationExtensions` → `VisualizationExtensions.cs` (70 L) · `ExecutionGlobals.cs` keeps `ExecutionGlobals` (282 L). All four stay in `namespace CoreScript.Engine.Globals`, so no visibility or API change. |
| P-3 | Split `ValidationAttributes.cs` (21 types) | ⛔ **WITHDRAWN 2026-10-02 — the premise was wrong, and measuring killed it.** The file is **187 lines / 21 types ≈ 9 lines each**: one cohesive family of parameter attributes (`Required`, `Min`, `Max`, `Range`, `Unit`, `Pattern`, `Suffix`, `EnabledWhen`, `InputFile`, `FolderPath`, `OutputFile`, `Color`, `Stepper`, `Segmented`, …). Splitting it would produce 21 files of 4–20 lines and scatter the one declaration of *"what a script parameter can carry"*. Rule 2: **a matching TOTAL is not evidence its PARTS are right** — the count 21 was the total, the parts say one concern. |
| P-4 | Turn the 4 routing strings into named constants | See ADD-2 — this is the highest-value polish item. |
| P-5 | Give `ToNotebook` a per-call data path | `data-{notebookName}.json`. Removes a silent-wrong-answer path. |
| P-6 | Pick one file-naming convention | Modern dotted form (`Finishing.Collector.cs`) reads better than the legacy `ElementDoorExtensions.cs`. |

### ADD — the three things actually missing

**ADD-1 — A test project for the *pure* code. (Highest value.)** ✅ **DONE 2026-10-02**
Not for geometry — that needs Revit. For the parts that are string-in/string-out or number-in/number-out,
where a bug is silent and a test is cheap. Shipped as `CoreScript.Engine.Tests/` — **24 xunit tests,
0 failing, teeth proven**; see the ADD-1 section in §5. Run by path, since it is not in `Paracore.sln`:

```
dotnet test CoreScript.Engine.Tests/CoreScript.Engine.Tests.csproj
```

⚠ **The candidate list below was partly wrong, and measuring caught it.** `Globals/UnitExtensions.cs`
and `BOQSectionParameter` both carry `Autodesk.Revit` references, and `ScriptCombiner.Combine` reaches
`RevitApiResolver` on its multi-file path (only the guard paths are Revit-free). Of the 6 files in
`Core/Rewriters/`, **4 are Revit-free**. "Text-in/text-out" was my inference; the `using` was the fact.

- ✅ `Core/Rewriters/TimeoutRewriter.cs` — 10 tests
- ✅ `Core/ScriptParser.cs` — 14 tests
- ⏭ `Core/Rewriters/{ParameterRewriter, ParameterPullingRewriter, PipelineTrackingRewriter}.cs` — Revit-free, next
- ⏭ `Core/ScriptCombiner.cs` — guard paths only, via a fake `IScriptParser`
- ⏭ `Core/Parsers/{XmlDocParser, RegionParser, ExtractionUtils}.cs` · `Core/DiagnosticMapper.cs`
- ❌ `Globals/UnitExtensions.cs` · `BOQSectionParameter` — **not Revit-free**, despite this list

**ADD-2 — Named constants for the routing keys. (Closes a D30-class hole.)**
`"table"`, `"chart-bar"`, `"chart-pie"`, `"chart-line"` are a **cross-repo wire contract with no
shared definition**. The C# side emits them; the TypeScript side switches on the exact literals
(`rap-web/src/components/layout/OutputPanel/OutputPanel.tsx:32`,
`…/ScriptInspector/StructuredOutputViewer.tsx:675,712,724,728`). C# also compares them
internally: `type == "table"` (166) and `type.StartsWith("chart")` (176).

Rename `"chart-bar"` and nothing errors — the panel just renders the fallback
`effectiveType.replace('chart-', '')`, i.e. a bare word where a chart should be. **That is the same
failure shape as D30: a routing key that fails silently.**

**✅ IMPLEMENTED 2026-10-02** — as constants on `Output` itself. No new type and no new file, so
there is nothing to add to `sync-shared.ps1`'s expectations:

```csharp
public const string TypeTable     = "table";
public const string TypeBarChart  = "chart-bar";
public const string TypePieChart  = "chart-pie";
public const string TypeLineChart = "chart-line";
public const string ChartPrefix   = "chart";
```

Every comparison now uses them — `type == TypeTable` (was `type == "table"`),
`type.StartsWith(ChartPrefix)` (was `type.StartsWith("chart")`), and the four wrappers. The comment
block above them names the TypeScript consumers by file and line. Behaviour is unchanged **by
construction**: a `const string` comparison is identical to a literal one, and the same
`StartsWith(string)` overload is used.

**Proven:** build 0 errors · `verify_build_contains.py` **0 failed / 77 passed** · all five symbols
present in the built DLL · mirrored to `paracore` · isolation re-verified **CLEAN**.

**ADD-3 — Use `[Obsolete]`.**
The engine has **zero** `[Obsolete]` attributes. ⚠ **Do NOT apply this to the `*Graph` names** —
§4 R1 is withdrawn; they are the names the MCP teaches. It remains the right convention to adopt
*before* any future rename, so a break surfaces as a compiler warning first.

---

## 5. Suggested order of work

**Revised 2026-10-02 after the premise check. Step 1 is DONE.**

| # | Step | Status | Scope |
| :--- | :--- | :--- | :--- |
| 1 | **ADD-2** — routing-key constants | ✅ **DONE 2026-10-02** (build 0 errors; gate 77/0; mirrored) | shared |
| 2 | **R3** — extract the duplicated `Table` logic | ✅ **DONE 2026-10-02** — `Output.AdaptElementsForTable`; warnings back to the 878 baseline | shared |
| 3 | **P-5** — `ToNotebook` per-call data path | ✅ **DONE 2026-10-02** | shared |
| 4 | **P-2 / P-3** — split the two mixed-responsibility files | ✅ **P-2 DONE 2026-10-02** (4 files, bit-neutral) · ⛔ **P-3 WITHDRAWN** (measured: cohesive, 9 L/type) | shared |
| 5 | **ADD-1** — test project for the pure code | ✅ **DONE 2026-10-02** — `CoreScript.Engine.Tests/`, **24 tests, 0 failing, teeth PROVEN** | new project — Pro-only, outside the synced areas |
| 6 | **P-1** — rename `TakeOffGlobals.cs` | ✅ **DONE 2026-10-02** — renamed; 5 docs retargeted | pro-only |
| — | ~~ADD-3 / R1 / R2~~ | ⛔ **all three WITHDRAWN** — the names are the contract, not debt | — |

### ✅ ADD-1 DONE (2026-10-02) — the engine has tests that assert something, for the first time

`CoreScript.Engine.Tests/` — **24 xunit tests, 0 failing, and the teeth are proven** (below).
Until now the engine's `Tests/` folder was 3 files / 263 lines with **no framework and zero
assertions** — it printed.

**Why a SIBLING project, not `CoreScript.Engine/Tests/`:** `CoreScript.Engine.csproj` is a
**shared** file that must stay byte-identical, so the xunit packages must not go into it. Doing so
would either make the free engine ship test packages, or force a second intentionally-different
csproj — which `sync-shared.ps1` calls a regression. The sibling directory sits outside all four
synced areas, so the project is **Pro-only** and nothing about it is mirrored. It is also **not**
in `Paracore.sln`, so `dotnet test` on the solution does not pull in the Revit-dependent harness.
Run it by path:

```
dotnet test CoreScript.Engine.Tests/CoreScript.Engine.Tests.csproj
```

**Scope — the Revit-free half, chosen by measurement.** Of the 6 files in `Core/Rewriters/`, only
4 carry no `Autodesk.Revit` reference, so the starting set is the two pure files:

| File under test | Tests | What they pin |
|---|---:|---|
| `Core/Rewriters/TimeoutRewriter.cs` | 10 | for/foreach/while/do each get a check; a single-statement body is **wrapped**; block bodies keep their own statements; loop-free scripts are untouched; nested and sibling loops each get their own check; the injected call is **fully qualified**, so it compiles in a user script with no `using` |
| `Core/ScriptParser.cs` | 14 | `IdentifyTopLevelScript` null / empty / single / one-of-many / declaration-only; usings and type declarations do not count as top-level; **two top-level files throws**; `CombineScriptFiles` throws on null and empty; usings are hoisted **above** the body blocks; the script file's statements and a supporting file's type declarations both survive; one `#line 1 "file"` block per file |

**⚠ The teeth were PROVEN, not assumed.** Two deliberate mutations of the engine, each reverted:

| Mutation | Result |
|---|---|
| delete `TimeoutRewriter.VisitDoStatement` | `Do_loop_gets_a_timeout_check` **FAILED** |
| delete the "only one script file can contain top-level statements" throw in `ScriptParser` | `Identify_throws_when_two_files_have_top_level_statements` **FAILED** |

Exactly **2 failed / 22 passed**, and nothing else moved — each test guards the thing it names.
After reverting, `git status` and `git diff` on both engine files are **empty** and the suite is
**24/24** again. ⚠ Neither file is on `verify_build_contains.py`'s `TOUCHED` list, which is what
made a temporary mutation gate-safe — **check that list before mutating anything else.**

⚠ `xunit` **v2 has no implicit `using Xunit;`** (v3 does). Without it every `[Fact]` is CS0246,
which reads like a broken package reference but is not.

⚠ **The 2 initial failures were MY bugs, not the engine's.** I asserted the injected statement is
followed by a space; Roslyn emits `{Check();DoWork();}` with no separator. The assertions now strip
all whitespace before comparing. The engine was right; the test was wrong.

### ⚠⚠ FINDING (new, 2026-10-02) — the help site documents a behaviour `.Show()` does not have

`paracore-help/docs/extension-methods/collection-operations.mdx:85` says:

> `| \`.Show()\` | **Pro Output**: Smart data grid + automated 3D geometric focus |`

**The engine does no such thing.** `ExecutionGlobals.Show(object)` → `Output.Table(data)` →
`Show(TypeTable, data)` → `AddStructuredOutput("table", json)` — and nothing else. The 3D focus
lives in a **separate** call: `CollectionUIExtensions.Zoom<T>` / `ElementUIExtensions.Zoom` /
`ScriptApi.Zoom`, which `Select` and `Isolate` invoke (`ScriptApi.cs:177,192`). `.Show()` and
`.Table()` are one method under two names.

⇒ **A consumer doc promises behaviour the code does not have.** Someone writing from the help calls
`.Show()` expecting a zoom and gets a grid. This is the **D30 shape in documentation**: nothing
errors, the result is simply not what was described.

⚠ **Deferred, not fixed** — the help site is a consumer (Seyoum's scope ruling: *"the help is what
we'll adjust next"*). Recorded so it is not lost. The engine is not wrong; the doc is.

**Every one of these is bit-neutral to the takeoff.** None touches `Finishing.*`, `TakeOff*`
geometry, or the BOQ pipeline.

⚠ **The prediction below was wrong, and the measurement is the point.** It said the five docs cite
the file by *filename* only, so that "a rename keeps the line numbers valid, and only the filename
mentions need updating." **The line anchors were already stale before the rename.** Measured
2026-10-02 (`git show HEAD:…/TakeOffGlobals.cs | grep -n Inspect`): the spec cites
`TakeOffGlobals.cs:66-70` for the `Inspect*Finishes()` forwarders and `:67` for
`InspectRoomFinishes`; in the **committed** file those sit at **71–75** and **72**. The rename
therefore could not preserve them — they had to be **retargeted** (rule 3: retarget, never delete).

Sites updated: `TAKEOFF_SPEC.md:91, :94, :364, :5326` · `CODEBUDDY.md:102` ·
`TAKEOFF_REFERENCE.md:30` · `D32_INSTALL_AND_VERIFY.md:120,296` · `MODULARIZATION_PLAN.md:464`.

---

### ⚠⚠ FINDING (new, 2026-10-02) — the anchor rot is SYSTEMIC: 98 anchors, most dead

`TAKEOFF_SPEC.md` carries **98 `file.cs:NNN` anchors** (67 lines). Spot-checked **15** against the
current source: **13 stale, 2 still correct.** Deltas are all one-directional (+7 … +105) because
the files only gained lines since 2026-09-19 — anchors near the top survived, everything deeper
rotted. (`Collector.cs` = `Finishing.Collector.cs`, `Wall.cs` = `Finishing.Inspectors.Wall.cs`,
`Room.cs` = `Finishing.Inspectors.Room.cs`, `Exposure.cs` = `Finishing.Exposure.cs`.)

| register says | construct it means | actually at | drift |
|---|---|---|---|
| `Collector.cs:435` | `_collectElementFinishes`'s per-wall walk | 465 | +30 |
| `Collector.cs:452` | `_DwaPairsForHost` per host wall | 488 | +36 |
| `Collector.cs:460` | `dwaBoxes` built from that list | 487 | +27 |
| `Collector.cs:527` | the standard-opening pass | 561 | +34 |
| `Collector.cs:593` | `_HiddenArea` consumption | 662 | +69 |
| `Collector.cs:627` | `_FaceCoveredArea` consumption | 695 (first of 4 call sites) | +68 |
| `Wall.cs:261` | `InspectWallFinishes` | 337 | +76 |
| `Wall.cs:419` | `_DwaPairsForHost` in the wall inspector | 499 | +80 |
| `Wall.cs:452` | the standard-opening pass | 529 | +77 |
| `Wall.cs:521` | unfiltered `elemBoxes` → `_HiddenArea` | 626 | +105 |
| `Room.cs:365` | the `if (!isExtRoom)` jamb wrapper | 372 | +7 |
| `Room.cs:384` | `_DwaPairsForHost` in the room inspector | 394 | +10 |
| `Room.cs:405` | the standard-opening pass | 421 | +16 |
| `Room.cs:32` | `InspectRoomFinishes` | 32 | **0** ✅ |
| `Exposure.cs:87-91` | the short-face bbox fallback | 87 | **0** ✅ |

**Why this matters:** a stale anchor is a **D30-class silent failure** — you land on a plausible
line and read something the register never claimed is there. It is the documentation form of
"a routing key that fails silently."

**Recommended as a DISCRETE task — deliberately NOT done here.** Retarget all 98 by *locating each
construct*, never by arithmetic, and land it with a **teeth-prover** that resolves every anchor and
**fails on a mismatch**, so the register cannot rot silently again. Fixing only the four anchors
this rename touched would leave 94 unverified — worse than a known-bad count, because it looks
maintained.

---

## 6. Limits of this review

- The counts come from **regex-based static probes**, not the Roslyn API. Accurate to within a few
  declarations; generics and multi-line signatures are the weak spots. Both probes report what they
  cannot parse rather than guessing.
- ⚠⚠ **The original "0 callers" claim for the `*Graph` aliases was WRONG.** Corrected in P2. It was
  a text search over only two repos. **Lesson: scope the search across every consumer before
  calling anything dead** — the consumers here were `paracore-gen`, `paracore-help`,
  `corescript-vscode`, `paracore-examples` and `docs/`.
- I did not read all 31,035 lines. §2 and §3.P1–P6 come from reading `ScriptApi.cs`,
  `ExecutionGlobals.cs`, `PipelineEnumerable.cs`, `NotebookExtensions.cs` in full plus the measured
  probes; P8–P11 come from probes only.
- The **takeoff correctness** question is out of scope and belongs to `Docs/TAKEOFF_SPEC.md`, which
  remains the authority on defects.

---

## 7. DECIDED & DONE 2026-10-02 — keep `*Graph`, retire `*Chart`

Seyoum chose **(b)**: `BarGraph` / `PieGraph` / `LineGraph` survive; the `*Chart` names are gone.

**Why this was the right call:** `paracore-gen`'s prompts and skills teach `*Graph` — that is what
the AI actually emits — and the UI label is "Bar Graph". Retiring `*Chart` therefore needs **no MCP
or help change**; retiring `*Graph` would have needed ~12 files across 4 repos.

### What changed

| Layer | Before | After |
| :--- | :--- | :--- |
| ① `ScriptApi` | `BarChart` + `BarGraph` (*"Alias for"*) | **`BarGraph` only** |
| ② `ExecutionGlobals` | `BarChart` + `BarGraph` (*"Alias for"*) | **`BarGraph` only** |
| ② `VisualizationExtensions` | `BarChart<T>` + `BarGraph<T> => BarChart` | **`BarGraph<T>` only, real body** |
| ③ `Output` | `BarChart` | **`BarGraph`** — renamed so ONE name runs end-to-end |

**21 declarations → 12.** No behaviour change: `BarGraph` now holds the body `BarChart` had, and
`Output.BarGraph` still calls `Show(TypeBarChart, …)`.

### Proof

| Check | Result |
| :--- | :--- |
| `dotnet build` — **pro** | **0 errors** |
| `dotnet build` — **public/free** | **0 errors**, 571 warnings |
| `verify_build_contains.py` (D16–D24) | **0 failed, 77 passed** |
| `.repl/_api_surface_check.py` | **24 / 24 passed** |
| `_crossrepo_verify.py` | **ISOLATION CLEAN** |
| mirrored to `paracore` | `ScriptApi.cs`, `ExecutionGlobals.cs` |

⚠ **Instrument limits (learned the hard way):** the XML doc sidecar lists only members carrying a
`///` comment, so it cannot prove an undocumented member exists; and .NET's `#Strings` heap applies
**suffix compression** (`BarChart` is a suffix of `TypeBarChart`, `Table` of `TypeTable`), so a
NUL-delimited DLL search returns 0 for names that DO exist. Member-level proof for the undocumented
`Output.*` members is the **build itself** — a missing method would be CS1061.

### ⚠ Consequent breakage — all consumers, all expected, none blocking the engine

| Consumer | What breaks |
| :--- | :--- |
| `paracore-examples/…/ProjectDashboard.cs:29,48,73` | calls `BarChart`/`PieChart`/`LineChart` — no longer compiles |
| `paracore-help/` (4 files) | still documents both names |
| `corescript-vscode/ai-instructions.md`, `copilot-instructions.md` | list both names |
| `paracore-gen/EXTENSION_METHODS.md:484-486`, `REPL_GUIDE.md:128`, `spikes/_tmp_probe.md` | stale |
| `paracore/EXTENSION_METHODS.md:477-479`, `paracore/REPL_GUIDE.md:128` | stale |
| **`rap-web/…/ConsoleContext.tsx:223`** | ⚠ a **live UI help string** — `h('.BarChart() / .PieChart() / .LineChart()', 'Charts')` now names methods that do not exist |

⚠ `StructuredOutputViewer.tsx:4-6` also imports `BarChart`/`PieChart`/`LineChart` — those are
**recharts components**, unrelated to this API. Do not "fix" them.

**Deliberately not done, per scope:** the consumer updates above. The engine is clean; consumers are
a follow-up pass.
