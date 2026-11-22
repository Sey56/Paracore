# Paracore v4.9.0 — technical release notes

**Windows x64 · one .NET 8 payload · Revit 2025, 2026 & 2027**

The release that opens Paracore to Dynamo. A selected gallery script can now be exported from the
desktop app as a **Dynamo Method node** or as a **standalone Dynamo Graph**. Editing the script
no longer needs Revit: Roslyn IntelliSense, diagnostics, hover, gallery metadata and parameter
extraction are answered locally by the desktop app through a shared sidecar that lives with the
Revit add-in.

> **Supersedes the published v4.8.4 (2026-11-15).** Everything in
> [v4.8.4](Release-Notes-4.8.4.md) is included. This note covers the code baseline
> `41a2d763` (the last 4.8.4 release-candidate fix) through the current 4.9.0 tree.

> **Two products, one release page.** Four installers have historically been published here, but
> they belong to two independent version lines. **Part A — Paracore 4.9.0** covers the engine,
> Revit add-in and desktop app. **Part B — Paracore-Gen 2.1.3** is unchanged in this release.
> Sandboxing, the consent gate, workspace confinement and the dialog watcher are Part B concerns,
> not add-in features.

---

## 0. Downloads in this release

Only two assets change in 4.9.0:

| asset | version | note |
|---|---|---|
| `Paracore_Addin_v4.9.0.exe` | 4.9.0 | engine, add-in and the shared `Paracore.Server.exe` sidecar |
| `Paracore_4.9.0_x64.msi` | 4.9.0 | desktop app and its local `rap-server` |

The VS Code extension and the Paracore-Gen MCP server are **not rebuilt for this release**; the
previously published `corescript-4.8.4.vsix` and `Paracore-Gen-v2.1.3.exe` remain the current
assets. No public API was removed from Paracore.

---

## 1. Paracore to Dynamo — the headline feature

The gallery toolbar now carries an **Export Dynamo** button. Select a gallery script, open the
export dialog, choose one of two kinds and run a dry run before writing anything.

### 1.1 Methods

Exports the script's public static methods as a **ZeroTouch DLL package**
(`Paracore_MethodNodes`). The generated node appears in Dynamo's library and is wired by the
user like any other node.

- Live proof: `AddTwoNumbers` → `ParacoreMath.AddTwoNums(int x, int y)`. The node was loaded in
  Dynamo 3.3, fed `10` and `6`, and returned `16`. Its library tooltip shows the method signature
  and the description taken from the source.
- The package references plain .NET only — no add-in, engine, shim, gRPC or desktop assembly.
- Source must contain a `public static` class and scalar parameters; otherwise the export refuses
  and names the missing shape.

### 1.2 Graph

Exports the **selected** gallery script's pure-.NET logic into a standalone `.dyn`: parameter
inputs from `public class Params` feed one CodeBlock, whose produced values feed Watch nodes.

- The logic is **inlined** into the CodeBlock. The exporter never emits a call to a
  Paracore-generated DLL, so the `.dyn` is an ordinary Dynamo graph with no runtime Paracore
  dependency. Paracore is needed at export time only.
- Live proofs: `AddTwoNumbers` (2 inputs → CodeBlock → Watch, result shown) and
  `PanelLayoutAudit` (5 inputs → CodeBlock → 6 Watches) were exported, opened and run in Dynamo.
- Rule: scripts that touch Revit or engine helpers (for example `GetElements<`, `Autodesk.*`,
  `Transact(`) cannot become a native CodeBlock. The refusal names the exact token and tells the
  operator to author a pure .NET script with a `Params` class, or keep the script in Paracore.
- A previous defect where Graph ignored the selection and always emitted a canned panel-audit
  graph was fixed; the selected script's source now reaches the engine's graph reader.

### 1.3 Standalone ZeroTouch proof (earlier in this release window)

`Paracore.DynamoNative/ShortWallCommentsNode.cs` is a hand-written C# node that references only
RevitAPI and the .NET framework. It lists walls under a threshold, previews the write with a dry
run that rolls back, and requires an in-node APPLY before a real comment write. End-to-end proof:
54 walls under 2000 mm, dry run plus committed write. It remains as the F2.2 acceptance artifact;
the built-in exporter above is the general mechanism for gallery scripts.

### 1.4 Errors you can act on

- Host-bound source: refusal names the offending token and states that **both** export kinds
  require pure .NET, so the old "try Methods instead" advice was removed.
- Overwriting an installed package: when Revit has the DLL loaded, Windows returns a file-lock
  error. The message now says the file is locked by Revit and to close Revit before retrying,
  instead of printing a raw `PermissionError`.
- Dry run reports the contract SHA, artifact sizes and a field-level diff before anything is
  written.

---

## 2. Editing without Revit

- **Desktop-only Roslyn authority.** Completions, diagnostics and hover are answered from
  `RevitAPI.dll` metadata on disk. The old relay through the Revit add-in was removed, along with
  the `PARACORE_INTELLISENSE_MODE` switch and the live-Revit catalog path.
- **Offline parameter catalog.** `ReplMetadataCatalog`, `IReplCompletionCatalog` and
  `ReplCatalogRouter` serve parameter names without a Revit document.
- **Category-name completion.** Typing `GetElements("` now proposes the category strings
  themselves (`Walls`, `Doors`, `Rooms`, …). Previously the quoted argument had no completion.
- **Category-scoped parameter completion.** Typing `.WhereParam("` after a category query now
  proposes that category's parameters using Revit's declared names — for walls, for example,
  `Unconnected Height` rather than a guessed `Height`. Raw Revit API and Paracore DSL completion
  both work in the same expression.
- **Offline gallery metadata.** `LocalMetadataService` answers gallery metadata from files.
- Verified operator state: all IntelliSense (raw Revit namespaces, category names, parameter
  names, globals and extension methods) works with Revit closed; execution still requires Revit
  and the add-in.

---

## 3. One shared sidecar

- A single `Paracore.Server.exe` is started by the first app and adopted by the second. Lease
  files live in `%APPDATA%/paracore-data/sidecar-owners` (`desktop.json`, `revit.json`).
- The sidecar self-retires when no lease is refreshed within 30 s. The ribbon toggle adopts or
  starts the process and subscribes Revit, rather than owning it; turning it off removes the
  Revit lease without killing a process another app still uses.
- TopBar shows `Offline`, `Connected` or `Add-in required`.
- The sidecar is installed with the **add-in only**. The desktop app no longer bundles a second
  copy; startup resolves an override, then a dev build, then the installed add-in.
- Offline proofs: Python lease harness 13/13, built-exe watcher 4/4. Live operator cycle:
  Offline → Connected → Offline with IntelliSense intact.

---

## 4. Packaging and startup

- **Released installer sizes:** the desktop app is **33 MB**, down from **45.7 MB** in the
  previous release. The Revit add-in installer is unchanged. These are the only two assets that
  change in 4.9.0; the VSIX and Paracore-Gen installers keep their published versions.
- The sidecar now ships with the add-in only, not with the desktop app. WiX cleanup removes a
  stale installed sidecar folder on upgrade.
- Startup no longer waits on the network: the JWT public key is read from the bundled copy first
  and fetched remotely only as a fallback (measured ~4 s removed from first paint).
- Sidecar startup moved off the HTTP event loop; the gallery paints a fast preview from source
  headers while authoritative Roslyn metadata is fetched in a worker thread and cached by
  content.
- Proto and the gRPC wire client were updated for the shared-sidecar model. The wire change is
  additive: two response fields for the REPL editor's replacement span. Older MCP clients ignore
  them, so Paracore-Gen 2.1.3 remains compatible.

---

## 5. Editor, gallery and parameters

- Script inspector: Monaco REPL editor, structured output viewer, floating code viewer and
  parameter tabs.
- Gallery: action bar with a distinct Export Dynamo icon, script-card hooks, loading state and
  cached parameters.
- REPL: IntelliSense integration with the local Roslyn completions; console context and the
  execution runner were updated.
- **Analytics table cache fix.** The table kept a stale cell after a change was undone in Revit:
  editing `Top Constraint` from `Level 2` to `Level 3` in the table, undoing in Revit, then
  re-running the script still showed `Level 3`. Each **Run** now clears the table before it is
  rebuilt, so it reads the model again and shows `Level 2`.
- Improved parameter extraction and options computation in the local backend.
- Agent runs using `mcp_agent` as source honor `__agent_self_confirm__` instead of raising the
  Revit `[Confirm]` dialog; manual and Dynamo sources still prompt the human. Reports
  `confirmation=agent_self_confirmed` for those runs.

---

## 6. Commit inventory

Baseline: `41a2d763` (the last 4.8.4 release-candidate fix). Three documentation commits written
after the 4.8.4 version bump (`806e2d00`, `af6855cf`, `9f9cb9a8`) are metadata-only and belong to
4.8.4, not to this release.

| commit | date | change |
|---|---|---|
| `7edd9ec5` | 11-20 | Agent self-confirm for `mcp_agent` source; manual/Dynamo still prompt. |
| `d02ba575` | 11-20 | Standalone ZeroTouch `ShortWallComments` node and `DynamoLibraryCompiler`. |
| `393019a5` | 11-20 | Shared first-owner-wins sidecar with heartbeat leases and self-retirement. |
| `fff62c98` | 11-20 | Desktop-only Roslyn authority; retired the IntelliSense relay. |
| `13886384` | 11-20 | Removed unused AI/MCP packages from the desktop app. |
| `de72a1d7` | 11-20 | Sidecar ships with the add-in only, not with the desktop app. |
| `029255f9` | 11-20 | Proto and gRPC client updated for the shared sidecar. |
| `d211a9a5` | 11-20 | Improved parameter extraction and options computation. |
| `0112d862` | 11-20 | READMEs updated for the shared-sidecar architecture. |
| `cf1cf202` | 11-20 | Gallery, inspector, REPL and sidebar improvements. |

In addition, the built-in Dynamo export (engine export services, graph script reader, export
router and modal), the startup/performance work and the clearer export errors are present in the
working tree at release build time.

---

## 7. Verification evidence

- Dynamo 3.3, live: Methods package loads and `AddTwoNums(10, 6)` returns `16`; Graph export of
  the same script opens, wires inputs to the CodeBlock and shows the result in a Watch.
- Dynamo 3.3, live: Graph export of `PanelLayoutAudit` opens and runs.
- Offline export probe: Methods success; Graph success (4 nodes / 3 connectors for
  AddTwoNumbers); host-bound and no-Params scripts refused with messages naming the cause.
- Installed builds: add-in and engine installed for Revit 2025 and 2027; symbol checks match the
  Release publish. Frontend rebuilt and installed.
- Workspace map gate F5 cleared by pushing the 10 local `paracore-ecosystem` documentation commits.

---

## 8. Known limits

- Graph export is pure .NET only: it cannot emit Revit action nodes or Paracore DSL calls. Its
  outputs are values you wire into Dynamo's own Revit nodes.
- Methods export compiles against framework assemblies only; it cannot call `Autodesk.Revit.DB`.
- A package DLL loaded in Revit must be released by closing Revit before it can be overwritten.
- Paracore-Gen and the VS Code extension keep their previous published versions.

---

## 9. Versioning

`VERSION` and all 16 stored surfaces are at `4.9.0`; `scripts/Set-Version.ps1 -Check` passes.
The version shown in the UI is derived from `package.json` at runtime, not stored in the UI code.
Manual surfaces updated here: the root README download link, this note, `RELEASE_NOTES.md` and
`paracore-help/docs/release-notes.md`.
