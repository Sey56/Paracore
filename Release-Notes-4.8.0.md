# Paracore v4.8.0

> **STATUS: HISTORICAL** — a plan / research / audit record. It describes what was being considered at the time, **not what is true now**. For current behaviour read the owning repo's `PROJECT_SPEC.md` or the master spec. (Marked 2026-10-27.)


**Windows x64 · .NET 8 · Revit 2025 & 2026**

One product, always free: the engine, the Revit add-in, the desktop app and the VS Code extension
version together. `VERSION` is the single authority.

## Highlights

- **One generic engine.** `paracore-pro` is gone — there is no free/Pro build split, no `$proOnly`
  file list and no shared-code sync script. One engine, one add-in, always free. What stays
  commercial are the specialist MCP servers.
- **Sentinels are free.** The watchdog process lives in the free engine now, and the desktop app no
  longer hides it behind an enterprise check.
- **Packs.** A specialist feature installs as a *pack* — an assembly kept outside the add-in folder
  (which the installer wipes on every upgrade), discovered at startup, one ribbon button each. A
  plain install finds none, and its ribbon is unchanged.
- **REPL errors point at your code.** A syntax error used to be reported at the coordinates of the
  *rewritten* script. It now reports the line and column you actually typed.
- **The semantic guard fails open.** A guard that wrapped calls it must not wrap is fixed and
  self-tested; `TransactionLoopGuard` is new.

## Desktop app

- **REPL font scaling** — `Ctrl` + `+` / `-` / `0`, or the toolbar stepper. 11–32 px, remembered.
- **Panel orientation** — stacked or side-by-side, from the top bar or `Ctrl+Shift+O`.
- **Honest run duration** — a run's "took Ns" is attached to the run it describes, instead of
  drifting onto the next run's output.
- **Per-script Save-dialog filters** — a script declaring `[OutputFile("pdf")]` gets a PDF filter.

## VS Code extension

- The build is PowerShell (`build-extension.ps1`), non-interactive, and requires a LICENSE file.
- The bundled AI instructions move to the shared `ai/vscode/` tree.

## Docs & tooling

- **One authority for the agent-facing docs** — `paracore/ai/` split by scope and delivered by
  progressive disclosure. Always-loaded context drops from **52,167 to 3,356 characters (−94 %)**,
  and two gates assert it.
- **Generated documentation** — the API index, the engine docs, the wire stubs and the AI tree are
  generated from source, each with a `--check` mode.
- **One proto authority** — `protos/corescript.proto`; every copy is verified against it.
- **A canonical `.gitignore`** — build output that had been committed is now ignored.

## Versioning

4.7.0 → **4.8.0**.

⚠ The published `v4.7.0` tag is **not an ancestor** of this release: the repository was
restructured and re-committed after that tag was cut. `v4.8.0` is a new line that does not descend
from `v4.7.0`, so a `git log v4.7.0..v4.8.0` over-reports. These notes describe the **trees**,
which is what ships.
