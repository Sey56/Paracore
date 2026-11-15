# Paracore v4.8.4 — technical release notes

**Windows x64 · one .NET 8 payload · Revit 2025, 2026 & 2027**

An accuracy and reliability update. Category-scoped element queries now return only the category
you asked for, parameter reads that used to invent a `0` now name what is wrong, numbers keep their
real digits unless you ask for rounding, and the desktop app no longer needs the network to draw
its own UI.

> **Supersedes the published v4.8.3 (2026-11-06).** Everything in
> [v4.8.3](https://github.com/Sey56/Paracore/blob/main/Release-Notes-4.8.3.md) is included here,
> including Revit 2027 support. This note covers **every commit** since that tag —
> [§6 is the complete inventory](#6-complete-commit-inventory).

> **This is an update, not a breaking change.** No public API was removed and no signature was
> taken away. The changes turn silent wrong answers into correct ones: a query returns the right
> elements, a name that does not belong to a category says so, and a number keeps its real digits.
> Scripts that were already correct keep working. Scripts that were reading a fabricated `0` from a
> parameter that does not exist now get a clear error instead of a fake measurement.

---

## 1. Download — one page, four installers

Everything ships on **this release page**. There is no second download location.

| Installer | What it installs | Version |
|---|---|---|
| `Paracore_4.8.4_x64.msi` | Paracore desktop app | 4.8.4 |
| `Paracore_Addin_v4.8.4.exe` | Revit add-in (2025 / 2026 / 2027) | 4.8.4 |
| `corescript-4.8.4.vsix` | VS Code extension | 4.8.4 |
| `Paracore-Gen-v2.1.3.exe` | Paracore-Gen MCP server | 2.1.3 |

The **desktop app** and the **Revit add-in** are the two Paracore components — install both. The
VS Code extension and Paracore-Gen are optional: the extension lets you write C# in VS Code and run
it in Revit; Paracore-Gen generates REPL scripts for an AI assistant and runs them in Revit, with
no separate run step. Paracore-Gen's own `v2.1.3` tag carries a pointer release with no assets, so
this page stays the single place to download.

---

## 2. Engine — correctness and precision

### 2.1 Category queries now return only the requested category  — the largest engine change

`GetElements<FamilySymbol>(category)` and the other category-filtered queries were matching the
**BuiltInCategory name as a substring**, using the singularised key. `"Doors"` became `"door"`,
and `"door"` is a substring of `OST_DoorTags`. The result set therefore contained door **tags**
alongside real door types. The same leak hit every category whose tag/head/mullion/subcategory
enum name contains the requested word — Windows, Structural Framing, Walls, Rooms, Grids, Areas,
Columns and the rest. **The fix is to the shared filter, so it applies to all categories**, not to
a fixed list of categories.

`ParameterOptionsComputer.CategoryFilterMatches`, last-resort branch:

```csharp
// BEFORE (v4.8.3) — substring test against the raw enum name
return bic.IndexOf(key.Compact, StringComparison.OrdinalIgnoreCase) >= 0
    || bic.IndexOf(key.SingularCompact, StringComparison.OrdinalIgnoreCase) >= 0;

// AFTER (v4.8.4) — exact test against the compacted enum name, OST_ prefix removed
var enumCompact = Compact(bic.StartsWith("OST", ...) ? bic.Substring(3) : bic);
return enumCompact.Equals(key.Compact, ...) || enumCompact.Equals(key.SingularCompact, ...)
    || enumCompact.Equals(key.SingularCompact + "s", ...)
    || enumCompact.Equals(key.Compact + "s", ...);
```

The plural forms are deliberate: they keep `"Door"` → `OST_Doors` and `"Column"` →
`OST_Columns` working, which was the only legitimate job the substring test was doing. A
contains-check can only ever *add* categories, and every legitimate match at this point is exact
(`"Structural Framing"` == `structuralframing`), so tightening it removes the false categories and
nothing else. `FindBuiltInCategory`, the resolver's own fallback, was already exact — this branch
was the last loose place.

Measured live on `TestModel.rvt` with `GetElements<FamilySymbol>(…)` **before** the fix (recorded
in the change itself, not re-measured by this release):

| query | what came back |
|---|---|
| `"Doors"` | 8 symbols, **including Door Tags** |
| `"Windows"` | 26 symbols, **including Window Tags** |
| `"Rooms"` | 7 symbols, **every one a Room Tag — zero room types** |
| `"Columns"` | Columns **and** Structural Columns |
| `"Walls"` | 14 symbols, incl. Curtain Wall Mullions, Curtain Panels and Wall Tags |
| `"Structural Framing"` | incl. Structural Framing Tags |
| `"Grids"` / `"Areas"` | Grid Heads / Area Tags only |

After the fix, each returns only the loadable family symbols of the category named. Live
re-verification on the installed 4.8.4 build is part of the release smoke test (§9).

### 2.2 Parameter names — what 4.8.3 already did, and what 4.8.4 adds

**Already in 4.8.3:** misspelled names were detected. `"Fire Ratng"` produced a
`Did you mean "Fire Rating"?` hint through `_declaresParameter` / `_warnUnknownParameter` /
`_closestParameterName`. That is not new in this release.

**New in 4.8.4:** the case where the name is **spelled correctly and exists in the model**, but not
on the category you are reading from. `"Base Offset"` is a real parameter on Walls and other
categories, but Category Doors does not declare it. Previously `dr.GetNum("Base Offset")` on a
door silently returned `0` — and in a quantity table, `0` reads as a measurement. Now it says so:

```text
GetNum("Base Offset"): there is no "Base Offset" parameter in Category Doors.
Use .CombinedParams().Table() to list the real names.
```

A closest-name hint (`Did you mean "Top Level Offset"?`) is added when one is within one edit per
four characters. This is a **correctness update for code you write**, not an API break:

- The check runs **only on the read-failure path**. A parameter the category declares but this
  particular element has no value for still returns `""` / `0` — a legitimate empty cell in a
  mixed set. Nothing that used to produce a value is re-validated.
- A bounded index (50 elements, instance + type parameter names unioned, cached per category per
  process) decides *whether to look*. Because a sample cannot convict, `_categoryDeclaresByName`
  confirms the name across the **whole category** before throwing; a hit is folded back into the
  cache so the second call is free. No category, no document or an empty index means "cannot tell",
  and the engine returns silently rather than accusing a correct name.
- Applies to `GetStr`, `GetNum`, `GetInt`.

**Packs keep their own contract (`12e321bb`).** A compiled pack is a product, not a typo: it ships
its own fallbacks and therefore *probes* names whose absence is the normal answer — takeoff's
`sym.GetNum("b", "m")` for a rebar width, or `el.GetStr("Structural Material")` on Doors and
Ceilings. When the failing read originates in an assembly declaring `IParacorePack`
(`_callerIsPackCode`, cached per assembly), the engine keeps the released warn-and-return
behaviour. A script still throws for both. Measured 2026-11-09: with the raise reaching packs,
takeoff's export finished with **zero** collected sections and five sections died on their first
element; with the exemption, all 12 sections collected and built a 19-sheet workbook.

**One more diagnostic fix in the same change:** Roslyn reports a lambda frame at the line the
lambda *starts* on, not the failing statement. A trace that used to say `at your line 4 — the
script stopped here` now says `in the lambda starting at your line 4 — the failing call is named
above`, rather than accusing a line the caller did nothing wrong on.

### 2.3 One rounding rule — nothing rounds unless you ask

Before 4.8.4 the API was inconsistent: `GetNum` / `OutputUnit` / `SumParam` were exact, while
`GetStr(name, unit)`, `GetVal(name, unit)`, the type-level twins, `FormatUnit`, `FormatValueOnly`
and `RoundTo` silently rounded to **2 decimals**. `GetVal(name)` / `GetStr(name)` had no
`decimals` argument at all and returned `AsValueString()` verbatim, so their precision came from
the **project's** unit settings. `GroupByParam` applied `Math.Round(total, 3)` with no way to opt
out.

After: **every value accessor that can round takes `decimals` and defaults to `-1` = exact.**
Omit it for the exact value; pass it to round deliberately. No accessor's precision is hidden or
unchoosable any more.

| call / situation | v4.8.3 | v4.8.4 |
|---|---|---|
| `GetNum("Length", "m")` on a wall of exactly 5.065 m | `5.07` | `5.065` |
| A 915 mm door width read in metres | `0.91` | `0.915` |
| `GetVal("Area")` on a 0.477 m² wall, project Area accuracy = 1 | `"0 m²"` — the quantity disappeared | exact `0.4770000000000004 m²` |
| `GetVal("Area")` on a 15.645 m² wall, Area accuracy = 1 | `"16 m²"` | `"15.644999999999998 m²"`; `GetVal("Area", "m2", 2)` → `"15.64 m²"` |
| `FormatUnit("m2")` on `196.85` | `"18.29 m²"` | `"18.288… m²"`; `FormatUnit("m2", 2)` → `"18.29 m²"` |
| `GroupByParam(...).Total`, exact sum 95.2417 m² | `95.242` (`Math.Round(…, 3)`) | `95.2417` — a raw sum, like `SumParam` |
| Sum of 2-dp wall areas | `95.23 m²` | exact |

Implementation notes: numeric parameters are read with `AsDouble()` and converted using the
parameter's **own** display unit, so `GetVal(name)` is no longer the WYSIWYG Properties-palette
string (read `Parameter.AsValueString()` yourself if you actually want that). Text, `ElementId` and
yes/no values still use Revit's own strings. New `_unitToken(ForgeTypeId)` maps a Revit display
unit to a helper token and returns `null` for units it cannot convert exactly (e.g. feet +
fractional inches), so the engine keeps Revit's value string rather than printing a
converted-looking wrong number. `ElementDiscoveryExtensions._valueOf` makes parameter-dump rows
exact for numeric values too.

### 2.4 Five dead parameter attributes removed

`ParameterExtractor` matches attribute names in **source text**, not CLR types.
`ScriptParameterAttribute`, `MinAttribute`, `MaxAttribute`, `PatternAttribute` and
`DescriptionAttribute` were declared but had no reader: a script using one compiled, showed no
error, and silently got no control, no bounds, no validation and no tooltip. Removing them turns
that silent no-op into a compile error. `ValidationAttributes.cs`: 49 deletions, 20 → 15 public
attribute classes. `RevitElementsAttribute` and every named argument on it are untouched.

---

## 3. Desktop app — the UI works fully offline

`1e8738ca`, 81 files, +882 / −690. The app loaded Inter from Google Fonts over the network and
drew every glyph through FontAwesome's font-based renderer; 79 files disagreed about radius, size,
tracking and glow because each call site invented its own `text-[11px]` / `rounded-[3rem]` /
`shadow-[..]` values.

- `Icon.tsx` is a compatibility wrapper: call sites keep `<FontAwesomeIcon icon={faBolt} spin />`
  but render a Lucide stroke glyph sized in `em` by `svg.pc-icon`, so `text-*` utilities work and
  explicit `w-*` / `h-*` still win. `iconAliases.ts` maps the old `fa*` names. **Both modules must
  ship together** — 40+ tracked files import them.
- `main.tsx` imports the self-hosted `@fontsource-variable/geist` (already declared in
  `package.json`); `index.html` drops the three Google Fonts links. **No network dependency for
  the UI.**
- `globals.css` declares one radius scale (`--radius: 0.5rem`), one selection colour, an em-based
  icon base rule, a `prefers-reduced-motion` opt-out, and tighter panel padding below 1280px for
  125–150% Windows scaling. Arbitrary per-call-site sizes, blurs, glows and tracking values
  collapse onto those tokens.

---

## 4. Gates and tooling

- **`execute_script` opens the dialog-watcher in-flight gate (`7769b1b3`).** Measured 2026-11-11:
  a *"Highlighted floors overlap."* modal stayed on screen through a whole `preview_tool` run and
  Forge timed out with the dialog still up; `DialogWatcher.txt` held only startup lines because
  every scan hit `if not call_in_flight(): continue`. Forge calls `ExecuteScript`, **not**
  `ExecuteRepl`, so the resident watcher was never permitted to answer a modal blocking our own
  call. `mcp/grpc_client.py` now resolves the watcher through `sys.modules` (never a second copy
  by path, which would own a different `_call_depth`) and wraps the stub call in `revit_call()`
  when a watcher is resident. The desktop `rap-server` / manual Gallery path imports no watcher
  and stays operator-driven.
- **New `scripts/check-warning-awareness.py`**: 8 subjects, 39 anchors, 3 `create_server`
  consumers, takeoff explicitly excluded, **an empty scan FAILS**, and `--prove-teeth` proves the
  anchors bite. Registered in `.repl/gates.json`.
- **`scripts/check-installed-addin.py`** gained a `_unitToken` anchor so an installed 4.8.3 engine
  cannot pass the symbol check while reporting numbers the 4.8.4 source no longer produces. The
  earlier anchors were **retargeted, not deleted**.
- **Bundled AI skill examples (`06f42ca4`)** switched from `.ToList()` chains and
  `List<ElementId>` to C# collection expressions (`[.. ...]`) and the enumerable overloads — the
  form the engine sandbox actually accepts. Authority is `ai/desktop/skills/`; the two `rap-server`
  copies are generated mirrors.
- **Generated documentation** (`7676bced`, `4c66b528`, `06bc10ed`, `12e321bb`):
  `EXTENSION_METHODS.md` and its four shipped mirrors, `REPL_GUIDE.md`, the generated API index,
  and the engine skills in the AI tree were regenerated from the new source so the reference and
  the shipped engine agree.

---

## 5. Public-repo documentation — no runtime effect

- `60126034` — README rewritten to say what Paracore is and how to install it; removed the .NET 10
  / Revit 2027 assembly-load-context reasoning, the `-Release` flag aside and "AI-ready" wording.
- `202d982f` — README states that Paracore-Gen **generates and runs C# from the conversation**, with
  no fixed set of task tools, so readers do not assume a fixed operation list.
- `06bc10ed` — private product names removed from the opening prose of `EXTENSION_METHODS.md`,
  `PROJECT_SPEC.md` and `DEVELOPMENT.md`; all 12 doc targets and 2 AI-workspace mirrors
  regenerated. No code, symbol or behaviour changed.
- `ff4f09b9` — **13 internal plan/audit documents removed** from public `Docs/` (modularisation,
  .NET 10 migration, GTM assessment, UI audit, IntelliSense research, the release test plan and
  others). The commit deletes 14 files; one of them, `PARAMETER_MISSING_VALUE_PLAN.md`, was created
  earlier in this same release window, so the net difference against v4.8.3 is 13. Three dead
  pointers went with them (`DEVELOPMENT.md` → `NET10-MIGRATION.md`, `.repl/baseline.py`'s
  docstring, `Release-Notes-4.8.1.md` → `CLOUD_PLAN.md`). Git history is the archive; no copy is
  kept. Private-name occurrences in the repo fell 120 → 90.
- `d34dfe7b` — version bump and the manual doc surfaces listed in §8.

---

## 6. Complete commit inventory

Baselines: `paracore` `v4.8.3` = `22d928a` · `paracore-gen` `v2.1.2` = `e0b6334` ·
`paracore-mcp-core` = `9d414e1` (the `CORE_VERSION` the released 2.1.2 exe recorded; this library
has no semver tag). **30 commits in total: 14 + 6 + 10.** Every one is listed below.

### 6.1 `paracore` — 14 commits (`v4.8.3..d34dfe7b`)

| commit | date | change |
|---|---|---|
| `ca7d840b` | 11-08 | A parameter name the **category does not declare** now throws instead of reading as `0`/`""`. Adds the per-category name index (`_declaredNamesForCategory`, `_categoryDeclaresByName`, `_throwIfCategoryLacksParameter`), whole-category confirmation before convicting, and a closest-name hint. Also fixes lambda stack frames in `ReplSessionManager.cs` to name the lambda's opening line rather than accusing the caller. Adds two installed-DLL gate anchors. |
| `7676bced` | 11-08 | `EXTENSION_METHODS.md` still claimed `GetStr` tolerates wrong names — the behaviour `ca7d840b` removed. Rewritten in the authority and all four shipped mirrors; AI-workspace copies regenerated. |
| `cde3579a` | 11-08 | **Category filter matches `BuiltInCategory` exactly.** Fixes the substring leak that returned tags, heads, mullions and sibling categories for every category-filtered query. Applies to all categories (§2.1). |
| `60126034` | 11-09 | README rewritten around what Paracore is and how to use it; internal platform reasoning removed. |
| `202d982f` | 11-09 | README describes Paracore-Gen as code generation and execution, not a tool menu. |
| `06bc10ed` | 11-09 | Private product names removed from public engine docs, `PROJECT_SPEC.md` and `DEVELOPMENT.md`; 12 doc targets + 2 mirrors regenerated. |
| `ff4f09b9` | 11-09 | 14 internal plan/audit documents removed from the public repo (13 net vs v4.8.3) and three dead pointers fixed. |
| `12e321bb` | 11-09 | The missing-parameter raise **stops at a pack assembly** (`_callerIsPackCode`, `_packAssemblyCache`, `_declaresPack`). Restores all 12 takeoff sections. Docs and gate anchor updated. |
| `12cd4fa3` | 11-11 | Five never-read parameter attributes removed from `ValidationAttributes.cs` (−49 lines); `RevitElementsAttribute` untouched. |
| `4c66b528` | 11-12 | **One rounding rule.** Every `decimals`-taking accessor defaults to `-1`; `GetVal(name)`/`GetStr(name)` gain `decimals`; `GroupByParam` totals are raw sums; `_unitToken(ForgeTypeId)` added; parameter-dump rows exact. Regenerates the reference, `REPL_GUIDE.md`, the API index and all generated copies. |
| `06f42ca4` | 11-12 | Bundled sentinel/tool skill examples switched to C# collection expressions and enumerable overloads. |
| `7769b1b3` | 11-12 | `execute_script` dialog gate fixed; new `check-warning-awareness.py` gate with an empty-scan failure and a teeth prover; `.repl/gates.json` updated. |
| `1e8738ca` | 11-14 | Desktop UI: Lucide shim (`Icon.tsx` + `iconAliases.ts`), self-hosted Geist font, one visual token scale, reduced-motion support, 125–150% scaling adjustments. 81 files. |
| `d34dfe7b` | 11-15 | Release commit: `Set-Version.ps1` writes all 16 stored surfaces to 4.8.4; manual surfaces — README links, `RELEASE_NOTES.md`, this file, `corescript-vscode/CHANGELOG.md`, and the retargeted `_unitToken` gate anchor. |

### 6.2 `paracore-mcp-core` — 6 commits (`9d414e1..c4b57f6`)

Tagged `release-4.8.4`. This is a library: it is bundled into the gen exe and installed nowhere on
its own. Its changes are the **runtime** behaviour Paracore-Gen 2.1.3 inherits.

| commit | date | change |
|---|---|---|
| `064965b` | 11-08 | **Bulk advisories only for a proven collection.** The old rule warned *unless* a receiver could be proven single, so any shape its allow-list missed (indexer, `foreach` variable, field, parameter, differently-typed assignment) was announced as a bulk write for exactly one element. Three allow-list patches did not close it because the default was the bug. `_receiver_kind` now returns `single` / `collection` / `unknown`; an advisory is emitted only for a proven collection. `foreach` over a proven collection stays in scope. Advisory only, never blocks. |
| `a8ed3f7` | 11-09 | README rewritten as library documentation (contents, wire-contract location, both PyInstaller paths, consumption modes, version checking, tests); the "Why this repo is PUBLIC" decision text and two stale cross-references removed. |
| `8adf63f` | 11-09 | Private product names removed from README, `PROJECT_SPEC.md`, and the docstrings/comments of `dialog_watcher.py`, `domain.py`, `server.py`, `tools.py` and `core_version.py`. No code, symbol or behaviour changed. |
| `c5b2bd8` | 11-12 | Shared skills (`aggregate-group`, `materials-units`, `parameter-access`) corrected for the engine's one-rounding-rule change — exact values by default, `GroupByParam` totals raw. |
| `058c0a6` | 11-12 | **No dialog note is lost; two Revit failure channels taught separately.** Measured 2026-11-11 13:10: two *"Insert conflicts with joined Wall."* dialogs were answered but only the first reached the agent, because `_record()` published only after the up-to-1.2 s close confirmation and the next call destructively pre-drained the late record. `_record()` now publishes at **decision time** (by reference, so `closed`/`how` are visible mid-click); `single_flight` never pre-drains — a late record is reported on the next call, labelled `late`. `_settle_dialogs()` waits up to 1 s only when a dialog was seen recently and nothing has been recorded, so an ordinary call pays no latency. `COMMON_RULES` now separates the **blocking modal** the watcher answers from the **persistent (reviewable) warning** in the document read with `Doc.GetWarnings()`, which can be non-blocking or appear with no dialog at all; pins the baseline/delta recipe, counts **per description**, `GetFailingElements() -> e.Value`, adjust-and-rerun until zero, and never suppresses a failure (no `IFailuresPreprocessor`). |
| `c4b57f6` | 11-12 | `object.GetType().Name` resolves `.Name` through `System.Reflection.MemberInfo`, so the sandbox refuses it — but `check_dangerous_patterns` never caught the source and the agent got a bare refusal. The hint now points at typed checks (`x is ModelLine ? "ModelLine" : ...`) and `ex.Message`, and forbids reaching for reflection by another route. `suggest_for_error()` is exposed so compile-only tools (Forge `validate_tool`, which returns the engine's raw result) get the same guidance. |

### 6.3 `paracore-gen` — 10 commits (`v2.1.2..7a27026`)

This repo's **runtime code changed only in comments**. Everything functional is inherited from
`paracore-mcp-core` (§6.2); the rest is generated documentation, tests and public-repo hygiene.

| commit | date | change |
|---|---|---|
| `a96e2ae` | 11-08 | Generated `EXTENSION_METHODS.md` synced with the missing-parameter engine fix. |
| `d6e0b0c` | 11-08 | `spikes/probe_bulk_warning.py` repaired: it pointed at the pre-2.1.2 core path and exited FATAL without testing anything. It now resolves **both** `paracore-mcp-core` (`mcp_core`) and `paracore/mcp` (`grpc_client`), re-execs into the build venv when `grpc` is absent, and adds the four residual false-positive cases plus a real-`foreach` must-warn case. 16/16 pass; the old detector fails all four new silent cases. |
| `87ba572` | 11-08 | Release-notes tagline corrected: Paracore-Gen is a generator **and** executor — it writes REPL code and runs it in Revit with no separate run step. Historical 2.1.1 notes left as published history. |
| `0299c64` | 11-09 | README rewritten around install, client config, tool list, build and doc links; drops the stale claim that `mcp_core` lives at `paracore/mcp/mcp_core`. |
| `99eb068` | 11-09 | README lead states the code-generation model (a C# script per request, no fixed task tools) and that the conversation happens in the MCP client of the user's choice. |
| `464b677` | 11-09 | Private product names and an internal operator quote removed from `PROJECT_SPEC.md`, older release notes, `Docs/RELEASE_ACCEPTANCE.md`, installer/build comments and the server docstring. Corrects the claim that this server "cannot model" — what is filtered is a skill from the catalogue, not a capability. Comments and prose only; regenerated reference included. |
| `80c1316` | 11-11 | Generated mirror records that the missing-parameter raise stops at a pack assembly (`paracore 12e321bb`). |
| `35dc32d` | 11-12 | `EXTENSION_METHODS.md` and `REPL_GUIDE.md` regenerated for the one-rounding-rule engine change; byte-identical to `paracore`'s copies. |
| `144f7f4` | 11-12 | New `tests/test_dialog_watcher_gate.py`: pins that the gRPC stub runs **inside** `revit_call()` over `ExecuteScript` (Forge does not use `ExecuteRepl`), that a process with no resident watcher opens no gate, that a record exists **while** `click()` is still confirming the close, and that two identical dialog instances produce two messages. |
| `7a27026` | 11-15 | Release commit: `Set-Version.ps1` writes `VERSION`, `pyproject.toml` and `uv.lock` to 2.1.3; manual surfaces — README, `RELEASE_NOTES.md`, new `Release-Notes-2.1.3.md`. |

---

## 7. What Paracore-Gen 2.1.3 actually inherits

`paracore-gen.exe` is a PyInstaller onefile exe. It imports `mcp_core` from the sibling
`paracore-mcp-core` checkout and the wire contract from `paracore/mcp`; **a `.py` or `.md` edit is
inert until rebuild + install + restart**. `build-gen.ps1` bakes `CORE_VERSION` (short SHA of the
shared core) and `SOURCE_HASH` (hash of this repo's tracked `.py` files) with **no timestamp**, so a
byte-comparing gate does not go red on every rebuild. For this release `CORE_VERSION = c4b57f6`
and `SOURCE_HASH = 4b116d4123a07a08`.

The four inherited fixes are the bulk advisories, the never-lost dialog note / two-channel failure
rules, the sandbox-refusal hint, and the skills synced to exact numbers — all detailed in §6.2.

---

## 8. Versioning

`paracore` versions as **one unit**: engine, Revit add-in, desktop app and VS Code extension all
carry `4.8.4`. `scripts/Set-Version.ps1` is the only writer of the 16 stored surfaces; the build
scripts read `VERSION` before building. README links, `RELEASE_NOTES.md`, this file, the VS Code
changelog and the `check-installed-addin.py` anchor are **manual** surfaces.

`paracore-gen` versions independently from its own root `VERSION` via its own `Set-Version.ps1`
(`VERSION`, `pyproject.toml`, `uv.lock`) — this release is `2.1.3`. `paracore-mcp-core` is a
library with no version number; its identity is the `CORE_VERSION` short SHA baked into the exe,
and it is tagged `release-4.8.4` in this release.

---

## 9. Verification

Rows measured on the **source tree** unless stated otherwise. Nothing here is a claim about the
installed 4.8.4 build; installer and live-Revit rows are measured after the install and belong in
the published release body.

| check | result |
|---|---|
| `paracore/scripts/Set-Version.ps1 -Check` (16 surfaces) | all at 4.8.4 |
| `paracore-gen/Set-Version.ps1 -Check` | all at 2.1.3 |
| `python .repl/gate.py` (before rebuild) | PASS — 23 auto green, 1 known-red F5 (`workspace-map`), 16 manual not run |
| `scripts/gen-engine-docs.py --check` | 12/12 targets up to date |
| `verify_gen_docs` / `mcp-engine-drift` / `ext-method-audit` / `ai-tree` | clean |
| `EXTENSION_METHODS.md` / `REPL_GUIDE.md`, paracore ↔ gen | byte-identical |
| `git diff --check` (all three repos) | clean |
| `npx tsc -b` (`rap-web/`) | exit 0 — the command `npm run build` uses |
| `npx tsc --noEmit` (`rap-web/`, root `tsconfig.json`) | exit 0 |
| `npx tsc --noEmit -p tsconfig.app.json` (`rap-web/`) | **213 errors** — see the caveat below |

⚠ **`tsc` caveat (PRODUCT, pre-existing, not a 4.8.4 regression).** The two green rows are not a
clean bill of health. The strict app config (`tsconfig.app.json`) enables `noUnusedLocals` and
`verbatimModuleSyntax`, and reports **213** diagnostics — mostly `TS1484` type-only imports and
`TS6133` unused declarations in files this release did not touch, plus `TS2339` on
`import.meta.env`. The root config does not enable those flags and build mode is incremental, so
`tsc -b` and the root `--noEmit` both exit 0. The Vite/Tauri MSI build does not run the strict
config, so it builds. An earlier draft of these notes claimed "zero diagnostics" from that run;
that was a **false all-clear from a skipping gate** and is corrected here. Neither new UI module
adds an error.

⚠ **`workspace-map` (F5)** is a **pre-existing known-red** about the private workspace map, not a
shipped artifact. It was open in v4.8.3 too. Ten of its twelve rows were corrected for this
release; the remaining two are private repos deliberately not pushed in a public release.

⚠ **`installed-addin`** is expected to stay **red** until the fresh 4.8.4 add-in installer is
installed with admin/UAC. That gate compares the installed DLL against the current build; it is
doing its job, not reporting a defect.

**Requirements:** Revit 2025, 2026 or 2027 · Windows x64 · .NET 8 Desktop Runtime (Revit 2027
supplies its own .NET 10 host) · ASP.NET Core runtime 8.x, 9.x or 10.x.

---

## 10. Release readiness

| item | state |
|---|---|
| `paracore-mcp-core` committed, pushed, tagged `release-4.8.4` | ✅ `c4b57f6`, in sync with origin |
| `paracore` committed and pushed | ✅ `d34dfe7b`, in sync with origin |
| `paracore-gen` committed and pushed | ✅ `7a27026`, in sync with origin |
| `Paracore_Addin_v4.8.4.exe` | ✅ built from pushed code |
| `corescript-4.8.4.vsix` | ✅ built from pushed code, installed locally |
| `Paracore-Gen-v2.1.3.exe` | ✅ built from pushed code; installed exe hash matches `dist` |
| `Paracore_4.8.4_x64.msi` | ⏳ **not built** — `installers/` still holds the 4.8.3 MSI |
| 4.8.4 add-in installed / live Revit smoke test | ⏳ installer requires admin; installed DLLs are still the 4.8.3 build |
| GitHub `v4.8.4` release page + four assets, `v2.1.3` pointer | ⏳ held until the smoke test passes |

**Do not publish** until the MSI exists, all four assets are freshly built from the pushed commits,
the 4.8.4 add-in is installed and the smoke test passes.
