## Paracore v4.8.1

Full notes: [Release-Notes-4.8.1.md](Release-Notes-4.8.1.md) · Previous: [4.8.0](Release-Notes-4.8.0.md)

### Packs become products

- **The Pack SDK is new** — a pack hosts its own parameter form, results window and ribbon tab, and can ship a **precompiled assembly**: no source, no compile on the customer's machine
- **Ribbon contributions** — a pack declares its tab, panel and buttons; the shim's command pool is raised **16 → 64**, so no pack ships a Revit command class

### REPL & editor

- **IntelliSense** — completion, live diagnostics and hover, from the add-in's own Roslyn workspace over gRPC; no language server, no project on disk
- **A client-side C# formatter**, and unsaved work guarded on every buffer-replacing action

### Engine

- **The type-write guard** — `IsTypeParameter` / `TypeInstanceCount` tell you a write lands on the **type**, not the instance (measured: one `SetNum` on one window modified 8 elements)
- **Swaps report their delta** — `SwapSymbol` / `NewType`
- **Faces and dimension chains** — `FaceRefs`, `SideFaceRefs`, `ChainDim`
- **Stage batches and checkpoints** — `Batch` / `StampBatch` / `DeleteBatch`, `Mark` / `RollbackTo` / `Transact`
- ⚠ **Breaking: `GetElements` no longer falls back to types** — a zero-instance category returns an empty list and reports the zero

### Consent gate

- The agent consent dialog was being auto-answered by the dialog watcher. It now uses captions the watcher does not recognise, so **only a human answers it**, deny is the default, and `scripts/check-sessiongate-labels.py` guards the labels
- **The agent is told what you chose** — `session_consent` (`granted` / `already_granted` / `denied` / `not_required`) now rides on every execution response, so a run says who allowed it; a denial is terminal and legible
- **Per session, not per MCP** — one Allow covers every agent in that Revit session, and `GetStatus` publishes it (wire field 10) so a second MCP server asks instead of guessing
- **A timeout that names itself** — a call made before the session is allowed is capped at **60 s**, and the error says whether it hit the consent dialog or a long script. `execute_script` gained a deadline too; forge previously waited forever

### MCP core

- The ~6,500 lines duplicated across five MCP repos now live once in `paracore/mcp/`; each MCP supplies only its `Domain`. **`paracore-gen` v2.1.0 is 8,393 lines smaller** for it

### Desktop app

- Theming collapsed to **light + dark** (Eclipse); toasts and Monaco follow the app, not the OS

### Docs & tooling

- `check-skill-snippets.py` compiles every skill fence in the host its shape needs; `check-memory-budget.py`; a `.githooks/pre-commit` that syncs the wire contract
- The engine-doc authority moved to `paracore`

### Versioning

- **4.8.0 → 4.8.1** — engine, add-in, desktop app and extension version as **one unit**; `VERSION` is the authority
- Ships with **Paracore-Gen v2.1.0**; the two are released together
