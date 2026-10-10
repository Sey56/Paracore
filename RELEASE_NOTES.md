## Paracore v4.8.0

Full notes: [Release-Notes-4.8.0.md](Release-Notes-4.8.0.md) · Previous: [4.7.0](Release-Notes-4.7.0.md)

### One generic engine

- **`paracore-pro` is gone** — this repo is the single source of truth for the engine, the add-in, the desktop app and the VS Code extension, and it is **always free**
- **Sentinels are now free** — promoted into the generic engine; the old `SentinelSource/` tree is removed and the desktop app no longer gates them
- **Packs** — a specialist feature installs as a separate assembly *outside* the add-in folder, discovered at startup and given its own ribbon button

### Engine

- **REPL errors point at your code** — diagnostics re-anchored to the line you typed
- **The semantic guard fails open** — framework facades resolve, so no more false `CS0411` wrapping
- **`TransactionLoopGuard`** is new

### Add-in

- Loads packs at startup; hosts the promoted Sentinels pump

### Desktop app

- **REPL font scaling** — `Ctrl`/`Cmd` + `+` / `-` / `0`, 11–32 px, persisted
- **Panel orientation** — stacked or side-by-side (`Ctrl+Shift+O`)
- **Honest run duration** — the "took Ns" entry stays with the run it describes
- **Per-script file-dialog filters** — a script declaring `[OutputFile("pdf")]` gets a PDF filter
- **Sentinels are no longer hidden** from free users

### VS Code extension

- Build ported to PowerShell (`build-extension.ps1`); bundled AI instructions move to `ai/vscode/`

### Docs & tooling

- **One authority for the agent-facing docs** (`ai/`) delivered by progressive disclosure — always-loaded context drops 94 %
- **Generated docs and proto gates** — `gen-ext-methods.py`, `gen-engine-docs.py`, `gen-protos.py`, `gen-ai-workspace.py`
- **`dev.ps1`**, a canonical `.gitignore`, and `PROJECT_SPEC.md`

### Versioning

- **4.7.0 → 4.8.0** — engine, add-in, desktop app and extension version as **one unit**; `VERSION` is the authority and `scripts/Set-Version.ps1 -Check` is the gate
- ⚠ `v4.8.0` does not descend from the published `v4.7.0` tag — see the note in the full notes
