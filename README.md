# Paracore: Dynamic C# Scripting for Revit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

Write C# that runs live inside Revit — no project files, no compilation step, no boilerplate. Revit API namespaces are pre-imported and elements have extension methods for common operations.

## Install

Download the installers from the [v4.8.3 release page](https://github.com/Sey56/Paracore/releases/tag/v4.8.3), run the desktop app MSI and the Revit add-in EXE, then open Revit and switch the Paracore server ON in the ribbon.

Supported Revit versions: **2025, 2026, 2027**. One installer covers all three; select the versions you have.

The optional VS Code extension and the Paracore-Gen MCP server have installers on the same release page.

## What's in this repo

| Component | What it does | Build |
|-----------|-------------|-------|
| **Paracore Addin** | Revit ribbon + gRPC execution engine | `./build-addin.ps1` |
| **Paracore Desktop App** | Script gallery, REPL playground, parameter UI generator | `./build-frontend.ps1` |
| **CoreScript VS Code Extension** | Write C# in VS Code, run it in Revit | `./build-extension.ps1` |

Build outputs go to `installers/`. Requirements: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

## Build from source

```powershell
./build-addin.ps1
./build-frontend.ps1
./build-extension.ps1
```

`./dev.ps1` runs the API server and the desktop app together for local development. See [DEVELOPMENT.md](DEVELOPMENT.md#run-development).

## Key features

- **Top-level C# statements** — no `.csproj`, `using` or `namespace`.
- **Parameter access by name** — `GetStr("Level")` works across categories; the engine resolves the parameter.
- **Fluent chains** — `.WhereParam().GroupByParam().SumParam().Select().Table()`.
- **Generated parameter dialogs** — add a `Params` class and the UI is built from it.

## Paracore-Gen

An optional MCP server that lets an AI assistant drive Revit from Claude Desktop, Cursor or VS Code. It lives in [paracore-gen](https://github.com/Sey56/paracore-gen). To build it locally:

```powershell
cd ../paracore-gen
./build-gen.ps1
```

## Documentation

- [User documentation](https://sey56.github.io/paracore-help/)
- [Development Guide](DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)
- [v4.8.3 release notes](Release-Notes-4.8.3.md)

## License

MIT
