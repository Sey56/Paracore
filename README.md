# Paracore: Dynamic C# Scripting for Revit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

Write C# that runs live inside Revit — no project files, no compilation, no boilerplate. Every Revit API namespace is pre-imported. Every element has smart extension methods.

## What's in this repo

| Component | What it does | Build |
|-----------|-------------|-------|
| **Paracore Addin** | Revit ribbon + gRPC execution engine | `./build-addin.ps1` |
| **Paracore Desktop App** | Script gallery, REPL playground, parameter UI generator | `./build-frontend.ps1 -Release` |
| **VS Code Extension** | Write C# in VS Code, execute in Revit, see output in VS Code | `./build_extension.sh` |

Installers go to `installers/`.

**Requirements**: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

## Quick start

```powershell
./build-addin.ps1                        # Build the Revit addin
./build-frontend.ps1 -Release            # Build the desktop app
```

Run the installer from `installers/`, open Revit, toggle the Paracore server ON in the ribbon.

## Key features

- **Zero boilerplate** — no `.csproj`, no `using` statements, no `namespace`. Just C# top-level statements.
- **Smart parameter access** — `GetStr("Level")` works on ANY category (Walls, Beams, Columns, Rooms). The engine resolves the right parameter name per category.
- **Fluent LINQ chains** — `.WhereParam().GroupByParam().SumParam().Select().Table()` — pipeline tracking shows element counts at each step.
- **Auto-generated UI** — add a `Params` class and Paracore generates the dialog from it.
- **AI-ready** — works with the Paracore MCP (separate repo) for Claude Desktop / Cursor / VS Code integration.

## Paracore MCP

The Model Context Protocol server lives in a separate repo: [`paracore-mcp`](https://github.com/datadrivenconstruction/paracore-mcp). Install it alongside this addin to control Revit from Claude Desktop, Cursor, or any MCP-compatible client.

```powershell
cd ../paracore-mcp
./build-mcp.ps1
```

## Documentation

- [Development Guide](DEVELOPMENT.md) — architecture, local setup
- [Contributing](CONTRIBUTING.md)
- [paracore-help](https://sey56.github.io/paracore-help/) — user docs

## License

MIT
