# Paracore v4.8.0 Release Notes

**Platform:** Windows x64 · .NET 8 (`net8.0-windows`)

Every change below is the difference between the published `v4.7.0` tree and this release, read
off the repository — not off a commit list. See **Versioning** at the end for one caveat about the
tag history.

---

## One generic engine

### The Pro tree is gone

`paracore-pro` no longer exists. This repository is the single source of truth for the engine, the
Revit add-in, the desktop app and the VS Code extension — and it is **always free**. There is no
free/Pro build split, no `$proOnly` file list and no shared-code sync script. What stays commercial
are the specialised MCP servers, the largest being `paracore-takeoff`.

### Sentinels are now free

Sentinels (the watchdogs) are a background process inside Revit, not a commercial feature, so they
were promoted into the free engine:

- `CoreScript.Engine/Globals/WatchdogRegistry.cs`
- `CoreScript.Engine/Globals/ScriptApi.Sentinels.cs` — **no licence gate**
- `Paracore.Addin/App/ParacoreApp.Sentinels.cs` — the watchdog pump
- `Paracore.Addin/Handlers/ScriptExecutionHandler.Sentinels.cs`
- `Paracore.Addin/Services/InternalTaskRunner.Sentinels.cs`, `WatchdogContext.cs`

The old standalone `SentinelSource/` tree is removed, and the desktop app no longer hides Sentinels
from free users — the gallery, the New Sentinel buttons and the settings tab used to gate them
behind an enterprise check. `InternalTaskRunner` no longer pre-seeds a "requires the Paracore Pro
Add-in" failure for a hook to overwrite.

### Packs

A specialist feature now installs as a **pack**: a separate assembly kept *outside* the add-in
folder, because the add-in installer deletes that whole folder on every upgrade. The generic add-in
discovers packs at startup (`CoreScript.Engine/Packs/`) and gives each contribution a ribbon button;
the button is routed through the shim, so a pack is never loaded a second time beside the copy the
REPL actually reads. A plain install finds no packs, and its ribbon is what it always was.

---

## Engine

### REPL errors point at your code

A syntax error used to be reported at the coordinates of the **rewritten** script, not the one you
typed. The diagnostic mapper now re-anchors the submission and subtracts the injected wrapper
offset, so the reported line and column match your editor.

### The semantic guard fails open

`SemanticTrackingGuard` analysed scripts with a bare compilation that resolved no framework types,
so every Revit type answered `CS0012`, nothing resolved, and it wrapped calls it must not wrap — a
legal `StringBuilder.Append` became `TrackEnumerable<T>(IEnumerable<T>)` and failed with `CS0411`.
`ScriptReferenceProvider` now supplies the framework facades, and the guard **fails open** (guarded
by an `IEnumerable<T>` self-test) instead of falling through to wrapping.

`TransactionLoopGuard` is new.

---

## Add-in

- Loads packs at startup and adds one ribbon button per pack contribution.
- Hosts the promoted Sentinels pump.

---

## Desktop app

### REPL font scaling
`Ctrl`/`Cmd` + `+` / `-` / `0`, or the stepper in the REPL toolbar. 11–32 px, default 14 px,
persisted between sessions.

### Panel orientation
Switch the main panels between stacked and side-by-side from the top bar, or with `Ctrl+Shift+O`.

### Honest run duration
A run's elapsed time is now measured around the request and appended to the console history as a
trailing "took Ns" entry, so it stays attached to the run it describes. It was previously drawn as a
floating label below the whole log, which drifted onto the next run's output.

### Per-script file-dialog filters
`ScriptParameter.filter` is carried through to the Save dialog, so a script declaring
`[OutputFile("pdf")]` gets a PDF filter instead of the hard-coded CSV one. A script that declares no
filter keeps the old CSV default.

---

## VS Code extension

- The extension build is now PowerShell (`build-extension.ps1`), non-interactive, and requires a
  LICENSE file to be present.
- The bundled AI instructions move to the shared `ai/vscode/` tree.

---

## Docs & tooling

- **One authority for the agent-facing docs.** `paracore/ai/` is split by scope (`shared/`,
  `desktop/`, `vscode/`) and delivered by progressive disclosure. Always-loaded context drops from
  **52,167 to 3,356 characters (−94 %)**; the API reference moved out of the prompt prefix into an
  on-demand skill reference. Two gates assert it: `_ext_method_audit.py` (every script-facing
  extension method must be documented) and `_ai_tree_check.py` (every rule must survive a move).
  The desktop app serves the same tree from `rap-server/server/api/ai_workspace/`.
- **Generated documentation.** `scripts/gen-ext-methods.py`, `gen-engine-docs.py`, `gen-protos.py`
  and `gen-ai-workspace.py` generate the API index, the engine docs, the wire stubs and the AI tree
  from source, each with a `--check` mode.
- **One proto authority.** `protos/corescript.proto` is the single source; `scripts/gen-protos.py`
  verifies every copy. The VS Code copy had been stale by three fields. `sync_protos.py` is retired.
- **`dev.ps1`** — one command for the development loop.
- **A canonical `.gitignore`.** Build output that had been committed is now ignored
  (`rap-web/target/`, extension bundles, logs).
- **`PROJECT_SPEC.md`** — the repo contract, pointing at the ecosystem master spec.

---

## Versioning

4.7.0 → **4.8.0**. The engine, add-in, desktop app and VS Code extension version as one unit, and
`VERSION` is the single authority. `scripts/Set-Version.ps1` writes every stored surface and offers a
`-Check` mode that exits non-zero on drift.

⚠ **Note on the tag history.** The published `v4.7.0` tag sits on a line that is *not* an ancestor of
this one — the repository was restructured and re-committed after that tag was cut. `v4.8.0`
therefore does not descend from `v4.7.0`, and a `git log v4.7.0..v4.8.0` over-reports (some of those
commits are already inside the 4.7.0 tree). These notes describe the **trees**, which is what ships.
