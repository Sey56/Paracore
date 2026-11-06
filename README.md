# Paracore: Dynamic C# Scripting for Revit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

Write C# that runs live inside Revit — no project files, no compilation, no boilerplate. Every Revit API namespace is pre-imported. Every element has smart extension methods.

## What's in this repo

| Component | What it does | Build |
|-----------|-------------|-------|
| **Paracore Addin** | Revit ribbon + gRPC execution engine | `./build-addin.ps1` |
| **Paracore Desktop App** | Script gallery, REPL playground, parameter UI generator | `./build-frontend.ps1` |
| **VS Code Extension** | Write C# in VS Code, execute in Revit, see output in VS Code | `./build-extension.ps1` |

Installers go to `installers/`. All four published installers — desktop app MSI, Revit add-in
EXE, VS Code extension VSIX and Paracore-Gen EXE — are on the
[v4.8.3 release page](https://github.com/Sey56/Paracore/releases/tag/v4.8.3).

**Requirements**: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

## Supported Revit versions

**Revit 2025, 2026 and 2027.** Paracore ships one `net8.0-windows` payload, compiled against the
Revit 2025 API. Revit 2027 hosts **.NET 10**, and .NET 10 loads .NET 8 assemblies — so no retarget
was needed. The 2027 work was an assembly-load-context fix in the shim plus a changed all-users
`.addin` path in the installer, not a framework migration. The installer detects installed Revit
versions from the registry and offers one checkbox per version.

See [the v4.8.3 release notes](Release-Notes-4.8.3.md) for the verified details.

## Quick start

```powershell
./build-addin.ps1                        # Build the Revit addin
./build-frontend.ps1                     # Build the desktop app installer
```

Run the installer from `installers/`, open Revit, toggle the Paracore server ON in the ribbon.

None of the build scripts take a `-Release` flag — `./build-frontend.ps1` is already the installer
build. For local development, `./dev.ps1` runs the API server and the desktop app together in one
terminal — see [Run (development)](DEVELOPMENT.md#run-development).

## Key features

- **Zero boilerplate** — no `.csproj`, no `using` statements, no `namespace`. Just C# top-level statements.
- **Smart parameter access** — `GetStr("Level")` works on ANY category (Walls, Beams, Columns, Rooms). The engine resolves the right parameter name per category.
- **Fluent LINQ chains** — `.WhereParam().GroupByParam().SumParam().Select().Table()` — pipeline tracking shows element counts at each step.
- **Auto-generated UI** — add a `Params` class and Paracore generates the dialog from it.
- **AI-ready** — works with the Paracore MCP (separate repo) for Claude Desktop / Cursor / VS Code integration.

## Paracore MCP

The Model Context Protocol server lives in a separate repo: [`paracore-gen`](https://github.com/Sey56/paracore-gen). Its installer is on the [v4.8.3 release page](https://github.com/Sey56/Paracore/releases/tag/v4.8.3); install it alongside this addin to control Revit from Claude Desktop, Cursor, or any MCP-compatible client.

```powershell
cd ../paracore-gen
./build-gen.ps1
```

## Documentation

- [Development Guide](DEVELOPMENT.md) — architecture, local setup
- [Contributing](CONTRIBUTING.md)
- [paracore-help](https://sey56.github.io/paracore-help/) — user docs

## License

MIT
