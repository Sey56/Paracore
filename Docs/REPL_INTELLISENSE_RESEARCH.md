# REPL IntelliSense — Research and Plan

**Status:** research complete, implementation in progress (branch `feature/repl-intellisense`).
**Question:** can the REPL playground be a proper code editor — IntelliSense, code completion,
red squiggles — for **C# + the Revit API**?
**Answer:** yes. It is a solved, mature engineering task, not a research frontier. The route was
chosen (Route A below) and implementation is underway.

> ⚠ This file exists because the original research was only ever written into the chat transcript
> and the project memory log, and could not be found again. Anything that matters goes in a file.

---

## 1. The "browser" part is a red herring

The editor UI and the language intelligence have been **separate things** for a decade. They are
joined by a protocol — **LSP (Language Server Protocol)** — not by sharing a process. The editor
sends JSON-RPC requests (*what completes here? what does this symbol mean? what is wrong on this
line?*) to a language server that owns all the real analysis.

So "IntelliSense in a browser" reduces to: **put an LSP client in the webview, and a C# language
server somewhere it can reach.** Nothing about running inside a webview limits quality. What
determines quality is *which* C# language server you run — and the server for C# is **Roslyn**,
which this product already ships.

## 2. What the industry ships today

| Thing | Editor | C# intelligence |
|---|---|---|
| VS Code / vscode.dev | Monaco | `Microsoft.CodeAnalysis.LanguageServer` (Roslyn); OmniSharp is the legacy fallback |
| Browser bridges | — | `monaco-languageclient` (TypeFox, v7, on `@codingame/monaco-vscode-api`); CodeMirror 6 has `@codemirror/lsp-client` |
| Theia / code-server / openvscode-server | full VS Code in a browser | the same Roslyn LS |
| Zed | its own | ships `roslyn-language-server` (+ `csharp-ls`, OmniSharp) |
| Blazor WASM + Roslyn | browser | proves Roslyn itself runs *inside* the browser |

## 3. The three routes, and the decision

| Route | What runs where | Fit for Paracore |
|---|---|---|
| **A · Monaco + Roslyn LS over LSP** | Editor in the webview; the language server is a local .NET process | **CHOSEN** — Paracore is Tauri, so it already hosts native processes |
| B · Roslyn in WebAssembly (Blazor) | everything, including the compiler, in the browser | rejected — heavy; the Revit API assemblies do not belong in a sandbox |
| C · embed a VS Code / Theia server | a full IDE served into the webview | rejected — overkill; duplicates the existing "Edit Script → VS Code" handoff |

**Route A was selected (user ruling, 2026-10-11).** Two facts make it cheaper for Paracore than
for most projects:

1. **Tauri, not a web page.** A native process host already exists, so **no WebAssembly is
   needed** — a small local .NET language server can be bridged to the webview directly.
2. **A Roslyn pipeline already exists.** The engine compiles scripts with `Microsoft.CodeAnalysis`.
   A language server is the same assembly family — an extension of something owned, not a new
   platform.

### The three genuinely fiddly problems (all solved the same way)

| Problem | Fix |
|---|---|
| Completion needs `Element`, `Document`, `Parameter`, … | point the workspace at **RevitAPI.dll + RevitAPIUI.dll** from the local Revit install folder |
| Scripts see implicit `doc` / `uidoc` / the extension methods | inject a **generated globals document** (script mode → a globals *type*, like the engine's `ExecutionGlobals`) |
| The engine compiles *snippets*, a stock server expects an *MSBuild project* | use a Roslyn **`AdhocWorkspace`** — no project on disk |

## 4. "Does IntelliSense force the REPL to become a heavy workspace?" — No

The word **"workspace"** is overloaded, and that is where the fear comes from:

- an **on-disk MSBuild workspace** (`.sln` + `.csproj` + `obj/` + `bin/` + restore) ⇒ **NOT needed**
  for the REPL;
- a Roslyn **`AdhocWorkspace`** ⇒ an **in-memory** compilation model. A "Project" is a reference
  list plus in-memory documents; a "Document" is just a string. **Nothing is written to disk.**

**VS Code *needs* an on-disk project** (the Roslyn language server drives one) — that is exactly
why gallery scripts get scaffolded. **The in-app REPL editor does not** — we own both sides, so an
`AdhocWorkspace` is enough. The two features are therefore **not** the same cost.

⚠ The REPL is parsed in **script mode**, not as a `Params`-style gallery script:
`usings → top-level statements → classes`. **There is no `Params` class in the REPL** — that belongs
only to the gallery's editable-parameter path. Script mode also means **no synthetic class-wrapping**
is needed; the document shape is the one the user actually writes.

## 5. Cost — measured on the development machine (2026-10-11)

- The desktop app is **128 MB** at `C:\Program Files\Paracore` (117 MB of that is the Python
  sidecar; 11 MB is `Paracore.exe`). **No .NET runtime is bundled.**
- **The .NET runtimes are already on every target machine** — `C:\Program Files\dotnet\shared\`
  has 8.0.x → 10.0.x. **Revit installed them.** So a language server can be framework-dependent and
  add **zero** runtime megabytes (saves the ~60–70 MB this would otherwise cost).
- **Most of Roslyn is already shipped** in the add-in: `Microsoft.CodeAnalysis.dll` (2.9 MB),
  `…CSharp.dll` (6.6 MB), `…Workspaces.dll` (4.1 MB), `…CSharp.Workspaces.dll` (0.9 MB).
  **~14.7 MB of the C# stack is already paid for.**
- **The only missing piece is the Features layer** — `Microsoft.CodeAnalysis.Features` +
  `…CSharp.Features`, where `CompletionService`, hover and diagnostics live. **~12–16 MB.**

**Verdict:** **+~33 MB** if the language server ships inside the app (128 → ~161 MB); **0 MB on the
app** if it runs in-process inside the add-in (the add-in grows ~15 MB, a separate install).

⚠⚠ **THE COST-CONTROL RULE:** do **not** ship Microsoft's official
`Microsoft.CodeAnalysis.LanguageServer`. It drags in MSBuild + NuGet + the project system
(~80–150 MB) — all machinery for loading `.csproj` files the REPL deliberately does not have.
**Write a thin LSP host** on the Workspaces + Features layer already owned. That one decision is
the difference between ~33 MB and ~150 MB.

Free trims taken on this branch: drop `Microsoft.CodeAnalysis.VisualBasic*` (~5.6 MB of dead weight
in a C#-only product) and the localized satellite resource folders
(`<SatelliteResourceLanguages>en</SatelliteResourceLanguages>`).

## 6. Architecture actually being built

Two levels, both disk-free. **Level 1 is being built first** (cheapest, reuses the engine's exact
script context, and proves completion quality before the 33 MB is spent); **level 2 is the chosen
end state (Route A)** and wraps the same core.

1. **In-process completion (built now).** `CoreScript.Engine/Core/ReplCompletionProvider.cs` —
   a cached `AdhocWorkspace` with the Revit + engine references, a preamble byte-identical to
   `ReplSessionManager`'s, and `CompletionService.GetCompletionsAsync`. Exposed over the existing
   gRPC chain (add-in → sidecar → rap-server → webview). Needs Revit open — which it always is for
   the REPL to run at all.
2. **Thin LSP host (Route A end state).** A small .NET process over the same `AdhocWorkspace` core,
   talking LSP to a Monaco client. Gains hover / signature help / go-to-definition "for free" from
   the client side, and works with Revit closed. ⚠ Not Microsoft's `LanguageServer` package.

**The provider is not throwaway**: an LSP host wraps the *same* `ReplCompletionProvider` core and
translates `ReplCompletion` → LSP `CompletionItem`.

## 7. Remaining work (the vertical slice)

The Roslyn core exists; nothing else is wired. Completion must mirror the existing REPL execution
chain: `ConsoleContext` → `/api/repl` → `execution_service` → `grpc_client` → gRPC →
`CoreScriptProxyService` → `AddinBridge` relay → `CoreScriptClient` dispatch → `InternalTaskRunner`
→ `ReplHandler` → engine.

| Layer | Work |
|---|---|
| proto (`protos/corescript.proto`) | add `GetReplCompletions` rpc + messages; regen via `scripts/gen-protos.py --write` |
| add-in | `ReplHandler.GetReplCompletions` + `InternalTaskRunner` method + `CoreScriptClient` dispatch case |
| sidecar server | `CoreScriptProxyService` relay override |
| paracore-gen | `grpc_client.get_repl_completions` |
| rap-server | `/api/repl/completions` route + service function |
| rap-web | Monaco editor replacing the textarea; completion provider + markers |

**Capability status:** completion = implemented (engine-side, unproven at runtime). **Hover = not
started. Diagnostics (red squiggles) = not started** — they need `Compilation.GetDiagnostics`.

## 8. Known open items

- The Roslyn **MEF host** must compose the `Features` assembly or `CompletionService` is null; the
  provider degrades to an empty list (logged), never throws. **Unproven at runtime** until an
  in-Revit run — the standing rule is *prove it in the REPL, then port*.
- The engine **wraps** the snippet before compiling; the completion model wraps the buffer
  *identically* and maps the caret offset back through the prefix length (simple arithmetic, but
  it is the thing to get right).
- Monaco adds a real dependency to `rap-web` (Vite + Tauri), including worker bundling.
