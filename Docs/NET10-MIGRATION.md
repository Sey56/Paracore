# Paracore — .NET 10 migration plan

> **⏸ PARKED — 2026-10-07.** The user's call: keep working on what exists (Revit 2025 / 2026 on **.NET 8**);
> the migration waits until a later date. **Nothing in this document is active.** It is the record for whenever
> it is picked up — it does not need to be read or acted on before then.
>
> ⚠ **The one thing that must not happen while parked: do not apply the Revit 2025.5 / 2026.5 update.** It is
> irreversible and it disables the current .NET 8 add-in (see below). Decline or defer it in Autodesk Access.
>
> Recorded 2026-10-07 from the user's plan: the next free-repo release is the FINAL .NET 8 release; the
> migration begins after that, **from scratch**.
>
> Version facts below are from Autodesk's own documentation, not inference:
> * *Revit: Requirements for products affected by the Microsoft .NET 10 transition* (support article, 2026-09-29)
> * *What's New in Revit 2027 → Migrating Revit to .NET 10*

## The decision (user's, 2026-10-07)

- The next free-repo release is **the final .NET 8 release** for Revit 2025 / 2026.
- After that, move the engine and everything else to **.NET 10**, so one source targets all supported Revit
  versions — instead of maintaining separate .NET 8 and .NET 10 repos.
- **Do it FROM SCRATCH.** A previous attempt exists on `release/net10` (4 commits, June 2026) and was
  abandoned after many problems. Do not resume it — use it only as a map of the problem surface (below).
- Not now — "after a day or two".

## ⚠⚠ THE BOUNDARY: the runtime flips at a SERVICE PACK, not at a version

| Revit | Runtime | Add-in must be |
|---|---|---|
| 2024 | .NET Framework 4.8 | (out of scope) |
| 2025.0 – 2025.4 | **.NET 8** | net8.0 |
| **2025.5+** | **.NET 10** | net10.0 |
| 2026.0 – 2026.4 | **.NET 8** | net8.0 |
| **2026.5+** | **.NET 10** | net10.0 |
| 2027 | **.NET 10** | net10.0 |

Autodesk: *"Installing an add-in built for a different .NET version may result in compatibility issues, such
as the add-in failing to load."* Autodesk ships its own add-ins in two flavours for exactly this reason — the
.NET 8 one is labelled **Legacy**, the .NET 10 one carries **2025.5** / **2026.5** in its name.

**Consequence for the plan:** a single .NET 10 build covers **2025.5+, 2026.5+ and 2027** — but NOT a user
still on 2025.0–2025.4 or 2026.0–2026.4. Those users need the .NET 8 build. So during the transition window
the project must ship from **two lines**, whichever way it is organised.

**Driver / deadline:** Microsoft ends support for .NET 8 and .NET 9 on **2026-11-10**. Autodesk is pushing
2025.5 / 2026.5 now. The risk is not our build breaking — a .NET 8 build keeps working on a .NET 8 host — it is
**a customer updating Revit and our add-in failing to load.**

## ⚠⚠ THE 2025.5 / 2026.5 UPDATE IS IRREVERSIBLE — AND IT DISABLES THE CURRENT BUILD

Confirmed from Autodesk's release notes (2026-10-07):

| Update | Build after applying | Released | Embedded runtime |
|---|---|---|---|
| Revit 2025.5 | **25.5.0.57** | 2026-09-16 | .NET 10 |
| Revit 2026.5 | **26.5.0.55** | 2026-08-06 | Windows Desktop Runtime 10.0.9 / ASP.NET Core 10.0.9 |

Autodesk, verbatim: *"The Revit 2026.5 Update **does not support uninstall**. Once Revit 2026.5 Update is
applied Revit 2026 **cannot be reverted** to its pre-update state."* (The same re-platform applies to 2025.5.)

**⇒ The ordering rule: MIGRATE FIRST, THEN UPDATE.**

- The user's dev machine is on **Revit 2025.4**, and the 2025.5 update is already offered on the tray.
- Applying it flips Revit to .NET 10, so the **current .NET 8 add-in will fail to load** — the REPL / MCP dev
  loop goes dark — and there is **no rollback**.
- So either migrate first, or keep a second machine / VM on 2025.4 for the .NET 8 line.

**Autodesk also confirms the API is not the risk:** *"maintaining **API compatibility for existing add-ins
after retargeting to .NET 10**."* Retarget, not rewrite — which matches the finding above that
`IntegerValue` is already gone. The API tax is ~zero; **the ALC problem is the real work.**

## Refinement: FREEZE the .NET 8 line — do not drop it

"Leave out .NET 8" is right as a *feature* decision, but state it as **freeze**, not **drop**:

- The final .NET 8 release becomes the **support baseline** for users on pre-.5 Revit. They are not broken —
  they are **pinned**. They simply stop receiving new features.
- **Near-free upgrade:** have the installer **bundle the frozen .NET 8 payload alongside the .NET 10 one** and
  pick by Revit **build number** (`< 25.5.0.57` / `< 26.5.0.55` → .NET 8). The .NET 8 artifact is built
  **once** (it is the final release) and never rebuilt ⇒ **zero dual maintenance**, and no user is left with an
  add-in that silently fails to load.
- **If you would rather not bundle it:** at minimum add a guard so the installer tells a pre-.5 user
  *"Paracore requires Revit 2025.5 or later — install the latest Revit update"* instead of failing silently.
- Keep the `Directory.Build.props` (see the recommendation below) so multi-target stays a one-line change if
  the pre-.5 tail turns out larger than expected.

⚠ The installer's runtime check must move **ASP.NET Core 8 → 10** to match.

## The blast radius — smaller than it looks (verified 2026-10-07)

Of the **11 git repos** in the workspace, only **two** carry Revit-runtime code: `paracore` and `paracore-pro`.
The Python repos (`paracore-mcp`, `paracore-forge`), the docs repo (`paracore-help`) and the auth server are
unaffected by the Revit runtime. `TrueBuild` / `TrueBuild.Pro` are separate Revit add-ins — their own decision.

The projects that must match Revit's runtime — the ones Revit or the add-in loads **in-process**:

| Repo | Project | Why it is locked |
|---|---|---|
| paracore | `CoreScript.Engine` | loaded by the add-in's ALC |
| paracore | `Paracore.Addin` | loaded by Revit |
| paracore | `Paracore.Shim` | creates the isolated ALC — **this is where the ALC problem lives** |
| paracore-pro | the same three | the same |

**Six projects, two repos.** Not fifteen.

- `Paracore.Server` is the **out-of-process sidecar** ("Connected to Paracore Sidecar") → not runtime-locked.
- The **gallery scripts and `paracore-examples` are compiled at runtime by the engine** → they follow the
  engine's runtime automatically; their `csproj` is for authoring only. No per-project work.
- The TFM is repeated across ~15 files only because there is **no `Directory.Build.props`**. Add one and the
  framework becomes a single edit.

## ⚠ The API divergence is ALREADY GONE

The earlier attempt's biggest compile-time item was `ElementId.IntegerValue` → `.Value` (~18 places).
On `main` today: **`IntegerValue` = 0 hits, `.Value` = 321.** That migration is already done — and `.Value`
exists in the 2025 API as well as 2027, so the source already sits on the **intersection** of both APIs.
⇒ Multi-targeting needs **no `#if`** for it. The API tax is ~zero.

## The installer is ALREADY version-aware

`paracore-addin.iss` already detects installed versions and branches per version:

```
Name: "Revit2025"; ...; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; ...; Check: IsRevitVersionInstalled('2026')
```

So **two installers are NOT required.** One installer, **two payload folders**, and a registry read of the
installed Revit **build number** to choose between them — the per-version Task structure already exists.
(The .NET 8 payload serves 2025.0–2025.4 / 2026.0–2026.4; the .NET 10 payload serves 2025.5+ / 2026.5+ / 2027.)

## Two ways to organise it — and the honest complexity bill

**(a) Hard switch on a branch.** `main` stays .NET 8 and is frozen as the legacy line; `release/net10` becomes
the new line. Simplest for the code — the ALC fix is written once, for .NET 10 only.

**(b) Multi-target one project.** `net8.0-windows;net10.0-windows`; the installer picks by Revit version. One
source, one build, two outputs — Autodesk's own model.

What multi-target actually costs, given the facts above:

| Item | Cost |
|---|---|
| `Directory.Build.props` with the TFM + conditional Revit API refs | **one file, written once** |
| Two publish outputs | build time up, for **6 projects** |
| `#if` for API differences | **~none** — `IntegerValue` is already gone |
| Installer dual payload + build-number check | structure already exists |
| **Testing every change on two runtimes** | ⚠ **the real cost** |
| **The ALC fix must not break .NET 8** | ⚠ the only real risk — and the same fix either way |

⇒ **The build is not the complex part. The ALC fix and the doubled testing are** — and those are identical in
both options. So the choice is not "complex vs simple"; it is **whether to carry a legacy line**.

## Recommendation: make it a flip, not a fork — and do the first pass as a hard switch

1. **Add `Directory.Build.props`** carrying the TFM and the Revit API package references, conditioned on
   `$(TargetFramework)`. Do this **before** touching the TFM. It costs nothing now and makes multi-target a
   **one-line change later**.
2. **Do the .NET 10 pass single-target (a).** The ALC problem is the hard part; debug it in the simplest
   possible environment — one TFM, one runtime. Validating .NET 8 *and* .NET 10 mid-migration would mean
   reproducing every runtime bug twice.
3. **After launch, measure.** If a real population is stuck on pre-.5 Revit, flip the props file to
   multi-target and ship the dual payload. If not, drop the .NET 8 line.

**The argument that may settle it:** you are going to market *now*. A customer installing Revit 2026 today gets
**2026.5+ = .NET 10**, and .NET 8 support ends **2026-11-10**. Your future user base is .NET 10 by default; the
.NET 8 population is a shrinking tail of people who do not update.

⇒ **Do not pay the dual-runtime complexity until there is evidence you need it. Make it cheap to adopt instead.**

## The problem surface — named by the abandoned attempt

From the `release/net10` commit messages and its `Docs/NET10-Migration-Plan.md`:

1. **⚠⚠ Cross-ALC — the central problem.** In .NET 10, `CSharpScript.RunAsync()` interacts differently with
   `AssemblyLoadContext`. Roslyn loads a **second copy** of `CoreScript.Engine.dll` into the Default ALC, so
   static fields, `AsyncLocal` and `ThreadStatic` become **per-ALC** — two copies, two states.
   - `InteractiveAssemblyLoader.RegisterDependency()` was already registered and stopped being effective.
   - `AppDomain.SetData` shares the reference, but the `as` cast fails (different type per ALC).
   - `dynamic` resolves simple members by name but **fails for extension methods** (`Table`, `BarGraph`).
   - Passing globals straight to `CSharpScript` caused a cross-ALC cast error.
2. **Pipeline tracking** — the per-ALC `AsyncLocal` state.
3. **LicenseContext** (`System.ComponentModel.LicenseManager`).
4. **WatchdogRegistry**.
5. **`isPro` flag** — ⚠ related: the `is_pro` proto drift reconciled on `main` on 2026-10-07 came from this line.
6. **Installer detection.**
7. **Table truncation removal** (output truncation).
8. **Revit 2027 API breaks:** `ElementId.IntegerValue` → `.Value` (~18 places); `(int Id, …)` → `(long Id, …)`;
   `IntegerValue != -1` → `!= ElementId.InvalidElementId`.
9. **Installer paths:** the earlier attempt changed Revit 2027 add-in paths from `{commonappdata}` → `{pf}`.
   ⚠ **Re-verify against the Revit 2027 docs before relying on this.**

## Current state on `main` (verified 2026-10-07)

- `global.json` (both repos): SDK `8.0.0`, `rollForward: latestFeature` → must become `10.0.0`.
- Every project targets `net8.0-windows` (~15 project files, including `paracore-examples` and `GalleryScripts`).
- Revit API via NuGet: `Nice3point.Revit.Api.RevitAPI` / `RevitAPIUI` at `2025.*`. The 2027 packages exist:
  **2027.3.0** on NuGet.
- **No `Directory.Build.props`** — the TFM is repeated per csproj. One props file carrying the TFM would make
  the next framework change a one-line edit.
- `scripts/install-engine.cmd` **hardcodes** both the build output (`net8.0-windows\win-x64`) and the target
  (`C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore`). Both need version-parameterising.
- Autodesk's 2027 note: install **SDK 10.0.100**, update `global.json`, address the **minor breaking changes
  introduced since .NET 8**; and if another .NET 10 runtime is present, **remove it** to avoid conflicts.

## Suggested order (one change per step; build after each)

1. `global.json` → SDK 10.
2. Add `Directory.Build.props` carrying the TFM — do this BEFORE flipping it, so step 3 is a one-line edit.
3. Flip the TFM. Build; expect compile errors.
4. Revit API `2025.*` → `2027.*`; fix `IntegerValue` and the `long Id` tuples.
5. Installer: Revit 2027 paths, the ASP.NET Core 10 check, the publish path.
6. **Install and run the REPL.** Expect the ALC failure — it is the known wall, not a surprise.
7. Solve the ALC problem deliberately (research first; no trial-and-error against a live Revit), then verify:
   REPL `Println` / `.Table()` / `.BarGraph()` / pipeline tracking, a gallery script, an MCP takeoff call, and
   an Excel export.
