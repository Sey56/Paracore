# REPL Playground — IntelliSense Acceptance Test Plan

**Branch:** `feature/repl-intellisense` · **Add-in build:** `Paracore_Addin_v4.8.0.exe`

**Goal:** prove the REPL playground behaves as a clean C# code editor — completion,
hover documentation and red squiggles — **including the extension methods contributed by an
installed pack** (`Paracore.TakeOff`), not just the generic engine surface.

---

## How the answers are produced

The editor asks the **add-in's Roslyn workspace** over gRPC; Monaco only draws the widget.

```
Monaco (replIntellisense.ts)
  → POST /api/repl/completions            (rap-server, script_execution_router.py)
  → execution_service.get_repl_completions_logic
  → grpc_client.get_repl_completions      (paracore-gen)
  → gRPC  CoreScriptRunner.GetReplCompletions
  → add-in ReplHandler.GetReplCompletions
  → ReplCompletionProvider.GetCompletionsAsync   (CoreScript.Engine)
```

The workspace compiles the buffer wrapped in this preamble:

```
using static CoreScript.Engine.Globals.ScriptApi; using static CoreScript.Engine.Globals.TakeOffScriptApi;
using Parameter = Autodesk.Revit.DB.Parameter;
#line 1 "script"
```

> **A method is "known" only if it is reachable from one of those `using static` lines.**
> The first line is the generic engine surface; the second is appended by the pack at startup
> (`ScriptSurface.AddStaticImport`).

---

## ⚠ Fixed 2026-10-11 — two false-diagnostic defects (measured, out of process)

The editor was compiling the buffer as a **regular program**, not as a **script**. Two independent
causes, both proven with a standalone probe (`_probecompile/replscript`) that runs the real
`ReplCompletionProvider` side by side with the real execution path (`CSharpScript`):

| # | Cause | Symptom the user saw |
|---|---|---|
| 1 | `AdhocWorkspace.AddDocument(projectId, name, text)` builds a **Regular** document even when the project's parse options say `SourceCodeKind.Script` — measured: the tree came back `Regular` | `CS8805 "Program using top-level statements must be an executable"` on everything, plus `CS1002 ; expected` on a trailing expression the REPL executes fine |
| 2 | The REPL's namespace imports arrive at execution via `ScriptOptions.WithImports(...)`, so they are **not in the source text**; the workspace never added them | `CS0103` for `Console`, `CS0246` for `List<>` / `Wall` — code that runs perfectly |

**Fix** (`ReplCompletionProvider.GetBaseDocument`): create the document explicitly via
`DocumentInfo.Create(..., sourceCodeKind: SourceCodeKind.Script, loader: TextLoader.From(...))`,
and put the shared import list on the compilation options with
`new CSharpCompilationOptions(...).WithUsings(ScriptReferenceProvider.GetImports(includeRevitSelection: true))`.

**Result:** the editor and the execution path now report an **identical** diagnostic set on a
9-case two-sided matrix — no false errors, and the genuine ones still fire.

> ⚠ This is an **engine** change, so it only reaches the desktop app after the add-in is rebuilt
> and reinstalled.

---

## 0. Prerequisites

| # | Requirement | How to check | Verified |
|---|---|---|---|
| P1 | Add-in installed **with the Roslyn Features DLLs** | `Microsoft.CodeAnalysis.Features.dll` + `Microsoft.CodeAnalysis.CSharp.Features.dll` present in the add-in folder | yes |
| P2 | Revit open, with a model loaded | TopBar shows the document title | — |
| P3 | Desktop app + rap-server running, Revit connected | TopBar = **Connected** (green) | — |
| P4 | TakeOff pack installed | `%APPDATA%\paracore-data\packs\Paracore.TakeOff\Paracore.TakeOff.dll` exists | yes |
| P5 | Pack registered **in this Revit session** | `%APPDATA%\paracore-data\logs\CodeRunnerDebug.txt` contains `Loaded 1 pack(s): Paracore.TakeOff` | yes |

> **Sign-in is needed only to RUN TakeOff methods** — they call
> `LicenseContext.RequireEnterprise("TakeOff")`. Completion, hover and squiggles need
> **no** sign-in: the editor compiles the buffer, it never executes it.

### Editor behaviour you can rely on (from `MonacoReplEditor.tsx`)

- Suggestions auto-open **while typing code** (`quickSuggestions.other = true`) and on `.`.
- `Ctrl+Space` forces the list open anywhere.
- Word-based guesses are **off** — every suggestion is a real Roslyn answer.
- Red squiggles appear after **600 ms of idle** (they are a full compile, not per keystroke).
- `Ctrl/Cmd+Enter` = run · `Ctrl/Cmd+S` = save · `Ctrl/Cmd +/-/0` = font size.
- Line numbers on, bracket-pair colouring on, minimap off, tab = 4.

### How to report

For each test give **PASS / FAIL**, the **exact text you typed**, and **what you saw**
(the literal message, or a screenshot).

---

## T1 — Editor mechanics (no backend)

| # | Do | Expect |
|---|---|---|
| T1.1 | Type `var x = 1;` | Line number appears; `var`/`int` keywords coloured; no squiggle |
| T1.2 | Type `Console.WriteLine(` | `)` auto-inserted; the two brackets colour-match |
| T1.3 | Type `if (true)` then Enter | Cursor indents one level (4 spaces) |
| T1.4 | Type a line, press `Ctrl+Z` then `Ctrl+Y` | Undo / redo work |
| T1.5 | Press `Ctrl+F`, search a word | Find widget works, matches highlighted |
| T1.6 | Press `Ctrl+-`, `Ctrl++`, `Ctrl+0` | Font shrinks / grows / resets to 14 px |
| T1.7 | Press `Ctrl+Enter` on a valid line | The buffer RUNS (console panel gets output) |
| T1.8 | Click **RUN** | Same as T1.7 |

---

## T2 — Completion (IntelliSense)

Type each snippet and check the named items appear.

### T2.1 — Core C# / BCL
```csharp
var xs = new List<
```
Expect a type list including `int`, `string`, `Wall`, `Element`, `Parameter`.
Then:
```csharp
var xs = new List<string>();
xs.
```
Expect `Add`, `Count`, `Where`, `Select`, `ToList`, …

### T2.2 — Generic engine surface (`ScriptApi`)
Type `Get` → expect `GetElement`, `GetElements`, `GetCategories`, `GetMagicNames`
(plus every pack `Get*` — see T2.6).

Type `GetElements(` → the overloads should be offered.

### T2.3 — Engine **element** extensions (receiver = `Element`)
```csharp
Selection[0].
```
Expect: `GetStr`, `GetNum`, `GetInt`, `GetVal`, `GetTypeNum`, `SetVal`, `SetNum`,
`Peek`, `CombinedParams`, `InstanceParams`, `TypeParams`, `BuiltInParams`,
`Select`, `Isolate`, `Zoom`, `Hide`, `Unhide`, `Delete`, `Materials`, `Matches`.

### T2.4 — Engine **pipeline** extensions (receiver = `IEnumerable<T>`)
```csharp
GetElements("Walls").
```
Expect: `WhereParam`, `WhereMatches`, `OrderByParam`, `OrderByParamDesc`,
`GroupByParam`, `SumParam`, `Table` — plus the LINQ set (`Where`, `Select`, `Count`, `ToList`).

### T2.5 — Revit types
- `Wall.` → Revit `Wall` statics (e.g. `Create`)
- `ElementId.` → `InvalidElementId`
- `BuiltInCategory.` → category enum members

### T2.6 — ⭐ PACK extension methods (the headline test)
The pack contributes ~40 statics via `using static …TakeOffScriptApi;`. Check each appears:

| Type this | Expect to see |
|---|---|
| `GetFinishing` | `GetFinishingTakeoff` |
| `GetConcrete` | `GetConcreteTakeoff`, `GetConcreteSummary`, `GetConcreteAuditTrail` |
| `GetEarthwork` | `GetEarthworkTakeoff`, `GetEarthworkQuantities` |
| `GetBOQ` | `GetBOQValidationReport` |
| `GetModel` | `GetModelFingerprint` |
| `ClassifyBOQ` | `ClassifyBOQSections` |

**If any of these are missing but T2.2 works**, the pack is not in the completion
reference set — report it (that is the failure mode this test exists to catch).

### T2.7 — Pack enum
`TakeOffZone.` → `Both`, `Sub`, `Super`.

### T2.8 — Overload picker
`GetFinishingTakeoff(` → two overloads: the no-arg form and `GetFinishingTakeoff(TakeOffZone)`.

---

## T3 — Hover documentation

Hover a symbol: a tooltip shows its C# **signature** in a code block and, when the symbol is
documented, its XML `<summary>` as prose. The token being described is highlighted.

> ⚠ Built 2026-10-11 (it did not exist before — the tooltip you used to see was Monaco's own
> squiggle message). Requires the rebuilt add-in: the engine carries the lookup, the add-in the RPC.

| # | Hover over | Expect |
|---|---|---|
| T3.1 | `GetFinishingTakeoff` | signature + summary — **only if the pack's XML doc is deployed** (see below) |
| T3.2 | `Element` | signature; documentation only if `RevitAPI.xml` ships with the Revit install |
| T3.3 | `GetStr` | `string Element.GetStr(string name)` + the engine's summary |
| T3.4 | `Println` | `void ScriptApi.Println(string message)` + "Prints a message to the unified output console." |
| T3.5 | `Console` / `WriteLine` | signature; usually **no** documentation — the .NET runtime ships no XML docs |
| T3.6 | whitespace, `+`, `(` | **no tooltip at all** — null, not an empty box |

⚠ **A signature with no documentation is correct, not a defect.** XML docs only exist when the
assembly ships a sibling `.xml` file, and `MetadataReference.CreateFromFile` does **not** look for
it on its own (measured: documentation length `0` with the XML sitting right beside the DLL, `428`
once attached explicitly — the engine now attaches it in `ScriptReferenceProvider`). Known gaps:
the **TakeOff pack deploys no `Paracore.TakeOff.xml`** into `%APPDATA%\paracore-data\packs\`, and
the .NET runtime ships none — so those hovers show a signature only.

---

## T4 — Diagnostics (red squiggles)

Squiggles appear ~600 ms after you stop typing.

### T4-A — script semantics: these MUST be CLEAN
This is the group that was broken. A **script** may end on a bare expression with no semicolon,
and its top-level statements need no executable output kind.

| # | Type | Expect |
|---|---|---|
| T4.1 | `GetElements("Walls")` — **no semicolon** | **NO squiggle** (trailing expression; the REPL echoes it) |
| T4.2 | `GetElements("Walls");` — with semicolon | **NO squiggle** |
| T4.3 | `var rooms = GetElements("Rooms");` ⏎ `rooms` | **NO squiggle** |
| T4.4 | `Console.WriteLine("hi")` | **NO squiggle** — the REPL imports `System` |
| T4.5 | `var l = new List<int>();` | **NO squiggle** — `System.Collections.Generic` |
| T4.6 | `var t = typeof(Wall);` | **NO squiggle** — `Autodesk.Revit.DB` |
| T4.7 | `GetFinishingTakeoff();` | **NO squiggle** — proves the pack assembly is in the compilation |
| T4.8 | `GetElements("Walls").WhereParam("Level", "Level 1");` | **NO squiggle** |

### T4-B — these MUST still fire
A clean editor that reports nothing is worthless; these prove the compile actually ran.

| # | Type | Expect |
|---|---|---|
| T4.9  | `int x = "hello";` | squiggle; hover → `CS0029 Cannot implicitly convert…` |
| T4.10 | `FooBar();` | squiggle; hover → `CS0103 The name 'FooBar' does not exist…` |
| T4.11 | fix T4.10 to `GetElements("Walls");` | squiggle **clears** within ~1 s |
| T4.12 | `GetElements("Walls")` ⏎ `GetElements("Rooms")` | squiggle on **line 1 only** — the *last* statement may omit `;`, earlier ones may not |
| T4.13 | `GetFinishingTakeoff().NotAMethod();` | squiggle on `NotAMethod` |
| T4.14 | `1 + 1;` | squiggle → `CS0201` — a non-call expression is not a valid *statement*; this one genuinely does not run in the REPL either |

---

## T5 — Comprehensive script (mixed C# + Revit + engine + pack)

Paste this, check **no red squiggles anywhere**, then press `Ctrl+Enter`.

```csharp
// --- C# core ---
var names = new List<string> { "alpha", "beta" };
names.Add("gamma");

// --- Revit ---
var all   = GetElements("Walls");
var first = Selection.FirstOrDefault();

// --- engine element extensions ---
var level = first?.GetStr("Level") ?? "-";
var area  = first?.GetNum("Area", "m2") ?? 0;

// --- engine pipeline extensions ---
all.WhereParam("Level", "Level 1")
   .OrderByParam("Area")
   .Table();

// --- pack extension methods (TakeOff) ---
var finishing = GetFinishingTakeoff();
var subOnly   = GetFinishingTakeoff(TakeOffZone.Sub);
var concrete  = GetConcreteTakeoff();
var boq       = GetBOQValidationReport();

Println($"walls={all.Count()} first={level} area={area}");
```

**Expected**
- No red squiggles anywhere (this is the strongest single assertion — it means the
  preamble, the engine references **and** the pack reference all resolved).
- Completion resolves at every `.`.
- **RUN:** the free-tier lines execute; the four TakeOff lines stop at the enterprise gate
  (see T6.1). That is correct behaviour, not an editor failure.

---

## T6 — Expected results that are NOT editor bugs

| # | Observation | Why it is correct |
|---|---|---|
| T6.1 | Running a TakeOff method while signed out → `🔒 'TakeOff' is an Enterprise feature. Sign in with Google in Paracore to unlock.` | The product's runtime gate (`LicenseContext.RequireEnterprise`). Completion/squiggles are unaffected. |
| T6.2 | A BOQ line shows rate `—` | Rates are provisional by design; only quantity is ours. |
| T6.3 | `Println(...)` output appears in the console panel, not the editor | The REPL transcript is separate from the buffer. |

---

## Results

| Test | PASS/FAIL | Exact input | What you saw |
|---|---|---|---|
| T1.1 | | | |
| T1.2 | | | |
| T1.3 | | | |
| T1.4 | | | |
| T1.5 | | | |
| T1.6 | | | |
| T1.7 | | | |
| T1.8 | | | |
| T2.1 | | | |
| T2.2 | | | |
| T2.3 | | | |
| T2.4 | | | |
| T2.5 | | | |
| T2.6 | | | |
| T2.7 | | | |
| T2.8 | | | |
| T3.1 | | | |
| T3.2 | | | |
| T3.3 | | | |
| T3.4 | | | |
| T3.5 | | | |
| T3.6 | | | |
| T4.1 | | | |
| T4.2 | | | |
| T4.3 | | | |
| T4.4 | | | |
| T4.5 | | | |
| T4.6 | | | |
| T4.7 | | | |
| T4.8 | | | |
| T4.9 | | | |
| T4.10 | | | |
| T4.11 | | | |
| T4.12 | | | |
| T4.13 | | | |
| T4.14 | | | |
| T5 | | | |
| T6.1 | | | |
| T6.2 | | | |
| T6.3 | | | |
