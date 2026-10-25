# Paracore v4.8.1

**Windows x64 · .NET 8 · Revit 2025 & 2026**

The release that makes a pack a product, puts IntelliSense in the REPL, and teaches the engine to
say when a write is bigger than it looks.

## Highlights

- **A pack can now be a product.** The new Pack SDK gives a pack its own parameter form, its own
  results window and its own ribbon tab — and lets it ship as a **precompiled assembly**, so no
  source and no compile reach the customer's machine: every run is already a cache hit.
- **IntelliSense in the REPL.** Completion, live diagnostics and hover, answered by the add-in's own
  Roslyn workspace over gRPC. No language-server process, no on-disk project.
- **The engine tells you when a write is bigger than it looks.** Setting `"Width"` on a window
  writes to the **type**. Measured: one `SetNum` call on a single window reported
  `created 0 · modified 8` — the four windows *and* their four host walls. `IsTypeParameter` now
  tells you before you do it.
- **Swaps report their delta.** Swapping four windows to a fixed type took all four from 1400 mm to
  1050 mm, and nothing said so. `SwapSymbol` / `NewType` now report the change.
- **Undo a stage, not a click.** `Batch` records what one stage created; `Checkpoints` +
  `RollbackTo` restore the model to a named mark — including elements a stage *moved or retyped*,
  which a create-only batch cannot cover.
- **One MCP core.** ~6,500 lines duplicated across five MCP repos — already drifted — now live once
  in `paracore/mcp/`, and every MCP imports them.
- **The agent is told what you chose.** The consent dialog can no longer be answered by anything but
  a person, and the agent now learns *which* answer it got — allowed, already allowed, or blocked —
  instead of a bare success it had to guess at. One Allow covers every agent in that Revit session,
  and a request that arrives before you answer no longer hangs: it stops and says so.

## Packs

`Paracore.PackSdk` is new. It hosts the whole life of a pack tool in one call: parameters →
configurator → payload → engine → results.

- **`PackHost.Run(...)`** — two entry points, differing only in where the tool body comes from:
  from **source** (the engine compiles and caches it; the gallery's path), or from a **precompiled
  assembly** the pack carries.
- **`ConfiguratorWindow`** — a WPF parameter form built from the script's own parameters, with
  `ParameterDiscovery` and `ParamVisibility` deciding what is shown and when.
- **`ParameterBridge`** — turns the form's values into the parameter JSON the engine reads. Nulls are
  omitted, not sent as `null`, so a script's own guard fires instead of it receiving a default that
  looks like a choice the user made.
- **`ResultsWindow` / `RunReport`** — a run's log and its `Table()` / `BarGraph()` output, rendered
  without knowing what an engine context is.
- **`PackScriptContext`** — ⚠ the only place a pack captures script output. A pack without it runs
  its tool **silently**.

Ribbon side: a pack declares `RibbonContribution` (tab, panel, item kind, order, children) and the
add-in builds it. Buttons dispatch through a fixed pool of command proxies in the shim, raised
**16 → 64** — so a pack never ships a Revit command class of its own.

## REPL & editor

The REPL playground is now a Monaco editor wired to the add-in's Roslyn workspace over gRPC —
completion, diagnostics and hover, with no language server and no project on disk.

The hard part is that the buffer must compile **exactly** the way execution does, and two of the
three inputs are invisible in the source text: the document must be created as
`SourceCodeKind.Script` (a regular document paints every buffer with CS8805), and the REPL's
namespaces arrive through `ScriptOptions.WithImports`, not through the text.

Also in the editor: a client-side C# formatter, and unsaved work guarded on every buffer-replacing
action.

## Engine

New capability, all of it measured against real failures:

| What | Why it exists |
|---|---|
| `FaceRefs` / `SideFaceRefs` / `ChainDim` | One planar face addressed by the plane it lies on, so a face-to-face dimension chain is harvested once instead of repeating the `ComputeReferences` walk. |
| `SwapSymbol` / `NewType` | A symbol swap is a one-line assignment that can change the element's **size**. Both now report the delta. |
| `IsTypeParameter` / `TypeInstanceCount` | Telling a type write apart from an instance write, and how many elements a type write will touch. |
| `Batch` / `StampBatch` / `ListBatch` / `DeleteBatch` | What one build stage created, which ids carry its stamp, and removing it as a unit. |
| `Mark` / `Checkpoints` / `RollbackTo` / `Transact` | A named checkpoint of the model, and a rollback to it. |

### ⚠ Breaking — `GetElements` no longer falls back to types

`GetElements("Doors")` on a project with **zero** doors used to answer with the door **types** —
`ElementTypes` that `.Count()` counts as instances, `.Delete()` removes every instance of, and
`.SetVal()` writes to the type of. Since a display string is a routing key, that silently repriced.
Measured 2026-10-10: **Windows, Furniture, Roofs and Columns** all leaked this way; Walls, Floors,
Ceilings and Rooms were safe only by accident, because a matching Revit class happens to exist and
routed them down the class path.

`GetElements(string)` and `GetElements<T>(string)` now return **instances**. A category with zero
instances returns an **empty list and reports the zero**. Types are reachable only by asking for
them. A script that relied on the leak now gets nothing back — which is the correct answer, and it
will be visible.

## Consent gate

The dialog that asks whether an AI agent may execute code was being **answered by the dialog
watcher**: it used the standard `OK | Cancel` buttons, `OK` is a label the watcher presses on
sight, so the gate approved itself and the prompt was decoration. It now offers two command links
— *Allow agent code in this session* / *Block agent code in this session* — whose captions the
watcher does not recognise, so it leaves the dialog alone and **only a human can answer it**.

Deny is the default, and dismissing it fails closed. A new gate,
`scripts/check-sessiongate-labels.py`, fails if a caption is ever renamed back to something the
watcher knows.

### The agent now learns what you chose

Fixing the dialog exposed the other half of the problem: after the operator clicked **Allow**, the
agent received a plain success and could not tell *"a person approved this session"* from *"there
was no gate at all"*. The only way to find out was to ask them.

`session_consent` is now reported on **every** `ExecuteRepl` and `ExecuteScript` response —
`granted`, `already_granted`, `denied` or `not_required` — so the tool result states, in words, who
allowed the run. A denial is terminal and legible: the agent is told the operator denied it, that
nothing was executed, and that it must not retry or work around it. The block holds until Revit
restarts.

### The gate is per session, not per MCP

The latch lives in the add-in, so one Allow covers **every** agent in that Revit session — gen,
model, family, forge. But each MCP process could only learn that from a response *it* happened to
receive, so a second server started out believing the session was ungated and would blame a consent
dialog for a timeout that was really a long automation.

`GetStatus` now reports `session_consent` (wire contract, field 10), and every MCP asks before it
decides how long to wait. The answer is a property of the session, so it is read from Revit rather
than cached per process — closing Revit and reopening it under a still-running MCP server resets it
correctly.

### A timeout that says which timeout it was

`dialog.Show()` has no timeout: it parks Revit's UI thread until a person clicks, and no deadline
can change that. A deadline's only job is to give the agent its voice back, so it can say *"there is
a dialog on your screen"* instead of hanging silently.

That left one question unavoidable — a timeout could mean *the gate is waiting for a person* or *the
script is simply long*, and the two need opposite responses. Because the gate settles exactly once
per session, the ambiguity can only exist **before** the first response. So an agent call made while
the session is ungated is capped at **60 s**; every call after it keeps its own deadline, and the
error text names the cause instead of listing both.

Two defects fell out of this work. `DefaultButton` was being set inside the `TaskDialog`
initializer, before the command links existed, so Revit threw `Corresponding button not found` and
the gate never appeared at all — it must be assigned after the last `AddCommandLink`, and the gate
script now checks that ordering. And `execute_script` had **no deadline whatsoever**, so a forge
call blocked on an unanswered dialog forever; it now takes one, and returns a message the caller can
act on rather than an uncaught gRPC error.

## MCP core

The eight REPL tools, the ten prompt sections, the nine shared method skills, the domain/skill
registry and the gRPC client were duplicated in **all five** MCP repos — ~6,500 lines, five times
over — and the copies had already drifted (one read *"How many per type?"* where the others read
*"per level"*). They now live once, in `paracore/mcp/`, and each MCP supplies only its `Domain`:
name, slug, intro, its own skills, optional prompt overrides, extra tools.

`paracore-gen` v2.1.0 is the first MCP released on it, and is **8,393 lines smaller** for it.

## Remote seam

`rap-server` gained `/run-script` and `/api/pick-object`, and the sidecar gained
`CoreScriptProxyService`. This is **Phase 0** of `Docs/CLOUD_PLAN.md` — the seam made configurable,
no cloud execution — and that plan is **paused by choice**. Nothing here is a cloud product; it is
the boundary being moved out one layer at a time, with each layer proven before the next.

## Desktop app

- Theming collapsed to **light + dark** (Eclipse). Toasts and Monaco follow the app, not the OS.
- Unsaved REPL work is guarded on every buffer-replacing action.

## Tooling & gates

- **`check-skill-snippets.py`** compiles every skill fence in the host its *shape* needs — a method
  body, a statement list, or a whole script — instead of always assuming a method body.
- **`check-memory-budget.py`** fails when the injected memory crosses its own stated budget.
- **`.githooks/pre-commit`** auto-syncs the wire-contract copies on commit.
- **`check-sessiongate-labels.py`** — see the consent gate above.
- The engine-doc authority moved to `paracore`; `paracore-gen` now carries a generated copy.

## Versioning

4.8.0 → **4.8.1**. `VERSION` remains the single authority for the engine, the add-in, the desktop
app and the VS Code extension.

Requires **Paracore-Gen v2.1.0** or later if you use an MCP client; the two are released together.
