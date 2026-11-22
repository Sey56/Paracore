## Paracore v4.9.0 — Paracore to Dynamo, and editing without Revit

Full notes: [Release-Notes-4.9.0.md](Release-Notes-4.9.0.md)

The release that opens Paracore to Dynamo. The gallery's **Export Dynamo** button turns the
selected gallery script into either a **Method node** you place in your own graph, or a
**standalone `.dyn` Graph** you open directly. Both were proven live in Dynamo 3.3:
`AddTwoNumbers` exports as a library node returning `16` for inputs `10` and `6`, and as a graph
with sliders feeding a CodeBlock and a Watch. `PanelLayoutAudit` also exports as a working graph.
Exported packages and graphs have no Paracore runtime dependency.

Everything else in this release makes authoring independent of Revit: Roslyn completion,
diagnostics, hover, gallery metadata and parameters are answered locally through **one shared
sidecar** installed with the add-in. Writing code, browsing the gallery and getting IntelliSense
work with Revit closed; execution still needs Revit and the add-in. Category names inside
`GetElements("…")` and that category's real Revit parameter names inside `.WhereParam("…")` are
now suggested as you type. The Analytics table is cleared on each Run, so undoing a parameter
change in Revit is reflected the next time the table renders. The desktop installer is now
33 MB, down from 45.7 MB in the previous release; the add-in installer is unchanged.

> **Only two new assets in 4.9.0:** `Paracore_Addin_v4.9.0.exe` and `Paracore_4.9.0_x64.msi`.
> The VS Code extension and Paracore-Gen keep their previously published versions; MCP/agent
> safety behaviour belongs to Paracore-Gen, not to the add-in.

---

## Paracore v4.8.4 — exact categories, exact numbers, honest errors, self-hosted UI

Full notes: [Release-Notes-4.8.4.md](Release-Notes-4.8.4.md) ·
[All four installers](https://github.com/Sey56/Paracore/releases/tag/v4.8.4)

An accuracy and reliability **update** — not a breaking change; no public API was removed.
Category-filtered queries now return only the category you asked for instead of leaking tags,
heads, mullions and sibling categories into the result. A valid parameter name that the current
category does not declare (for example `"Base Offset"` on Doors) now says so instead of silently
reading as `0`. Numbers are exact unless you pass `decimals`. The desktop app now bundles the
fonts and icons used by its UI. Ships with **Paracore-Gen v2.1.3**.

> **Two products, one release page.** The [technical notes](Release-Notes-4.8.4.md) and the
> [v4.8.4 release page](https://github.com/Sey56/Paracore/releases/tag/v4.8.4) separate
> **Part A — Paracore 4.8.4** (engine, Revit add-in, desktop app and VS Code extension) from
> **Part B — Paracore-Gen 2.1.3** (the MCP server, its wire client and the shared `mcp_core`
> library). Sandboxing / capability refusal, the consent gate, workspace confinement, the read-only
> guard, dangerous-pattern scans, bulk-write advisories and the dialog watcher are **Part B /
> MCP concerns**, not add-in features. The earlier v4.8.3 page did not make that distinction.

Local-testing fixes also land in 4.8.4: the configurator's numeric entries are selectable with a
visible highlight and have step-snapping spinner arrows again; the preset toolbar shows its
tooltips again; the presets dropdown uses a normal down-caret instead of a refresh icon; and the
VS Code extension prints a compile error once instead of twice.

The [technical notes](Release-Notes-4.8.4.md) carry a complete inventory of all 34 shipped code
commits across the three repositories, including every release-candidate fix, with measured
before/after examples. The two later product-split documentation commits in `paracore` and
`paracore-gen` are metadata-only and are described in the notes themselves.

---

## Paracore v4.8.3 — Revit 2027, one download

Full notes: [Release-Notes-4.8.3.md](Release-Notes-4.8.3.md) ·
[All four installers](https://github.com/Sey56/Paracore/releases/tag/v4.8.3)

Adds Revit 2025 / 2026 / 2027 support, closes the script-capability holes, and publishes the
desktop app MSI, the Revit add-in EXE, the VS Code extension VSIX and the Paracore-Gen EXE on one
release page. The MCP framework is no longer maintained in this repository.

---

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
- **A timeout that names itself** — a call made before the session is allowed is capped at **60 s**, and the error says whether it hit the consent dialog or a long script. `execute_script` gained a deadline too; one MCP caller previously waited forever

### MCP core

- The ~6,500 lines duplicated across five MCP repos were consolidated into `paracore/mcp/` (the layout **at the time** — the shared framework has since moved to its own repository); each MCP supplies only its `Domain`. **`paracore-gen` v2.1.0 is 8,393 lines smaller** for it

### Desktop app

- Theming collapsed to **light + dark** (Eclipse); toasts and Monaco follow the app, not the OS

### Docs & tooling

- `check-skill-snippets.py` compiles every skill fence in the host its shape needs; `check-memory-budget.py`; a `.githooks/pre-commit` that syncs the wire contract
- The engine-doc authority moved to `paracore`

### Versioning

- **4.8.0 → 4.8.1** — engine, add-in, desktop app and extension version as **one unit**; `VERSION` is the authority
- Ships with **Paracore-Gen v2.1.0**; the two are released together
