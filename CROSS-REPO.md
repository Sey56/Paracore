# Cross-Repo Reference

This is `paracore` (public, MIT). Companion repo: `paracore-pro` (private).

## Quick Reference

| | paracore (public) | paracore-pro (private) |
|---|---|---|
| **License** | MIT | Commercial |
| **Desktop app** | rap-web, corescript-vscode | Not included — users install from here |
| **Add-in** | Free, base extensions only | Commercial, with TakeOff/Rebar/MEP extensions |
| **MCP servers** | None | Generalist (free) + specialized (paid) |
| **CoreScript.Engine** | Base extensions | Base + commercial extensions |
| **gRPC proto** | Same | Same — MUST stay compatible |

## What Must Stay in Sync

- **`protos/corescript.proto`** — the gRPC contract. Changes here must be copied to both repos.
- **CoreScript.Engine base** — the core engine (CodeRunner, ScriptCompiler, diagnostics, pipeline). Bug fixes flow: here → `paracore-pro`. New base features flow the same direction.
- **Paracore.Addin base** — the Revit add-in (gRPC handlers, UI, session gate). Same flow as above.
- **`REPL_GUIDE.md`, `EXTENSION_METHODS.md`** — reference docs. Changes in either repo must sync to the other.

## What Diverges

- Commercial extension methods — ONLY in `paracore-pro/CoreScript.Engine/Globals/`
- Specialized MCP servers — ONLY in `paracore-pro/rap-server/server/`
- `rap-web/`, `corescript-vscode/`, `paracore-help/` — ONLY here in public

## Working in This Repo

When fixing a bug in the add-in or engine:
1. Fix here first
2. Copy the fix to `paracore-pro`
3. Both add-ins remain compatible with the same gRPC proto

When adding a desktop app feature (rap-web, VS Code extension):
1. Add it here — `paracore-pro` doesn't have these

When adding a new MCP or commercial extension:
1. That work happens in `paracore-pro` — NEVER here

## Users

A user of the free product installs:
1. Paracore desktop app (from here)
2. Paracore Addin (from here — free, base-only)

A user of the commercial product installs:
1. Paracore desktop app (from here — free)
2. Paracore Addin (from `paracore-pro` — with commercial extensions)
3. Specialized MCPs (from `paracore-pro` — paid)

The desktop app and either add-in communicate via the same gRPC protocol (port 50051).
Only one add-in can be installed at a time — pro replaces free, free replaces pro.
Each installer cleans up the other's manifest and folder automatically.
