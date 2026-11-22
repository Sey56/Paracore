# Paracore: Dynamic C# Scripting for Revit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Revit 2025+](https://img.shields.io/badge/Revit-2025%2B-blue)](https://www.autodesk.com/products/revit/)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen)](https://sey56.github.io/paracore-help/)

Write C# that runs live inside Revit — no project files, no compilation step, no boilerplate. Revit API namespaces are pre-imported and elements have extension methods for common operations.

## Architecture at a glance

| Piece | What it is | Where it lives |
|---|---|---|
| **Desktop app** | React/Tauri UI + Python `rap-server`. REPL, gallery, parameter UI and Dynamo export. | `rap-web`, `rap-server` |
| **Revit add-in** | Ribbon client + the engine that compiles and executes C# **inside Revit**. It also installs the shared sidecar binary. | `Paracore.Addin` |
| **Shared sidecar** | ONE `Paracore.Server.exe` on `localhost:50051`. First app starts it, the other adopts it; both keep heartbeat leases, and it retires when the last user leaves. | installed with the **add-in** only |

The sidecar is Revit-facing, so it ships with the add-in — not with the desktop app. The desktop app starts or adopts that same process for Roslyn IntelliSense, gallery metadata and script parameters, so editing works with **Revit closed**. Execution still requires Revit, an installed add-in, and the Paracore ribbon server toggled **ON**.

The Python backend stays in the desktop app deliberately: it serves the gallery, REPL metadata and export helpers locally. A future host-neutral gateway gets its own authoring-environment component rather than being folded into this sidecar.

## Install

Download the installers from the [v4.9.0 release page](https://github.com/Sey56/Paracore/releases/tag/v4.9.0), run the desktop app MSI and the Revit add-in EXE, then open Revit and switch the Paracore server ON in the ribbon.

Supported Revit versions: **2025, 2026, 2027**. One installer covers all three; select the versions you have.

The VS Code extension and Paracore-Gen MCP server keep their previously published installers; 4.9.0 ships only the desktop app and the Revit add-in.

## What's in this repo

| Component | What it does | Build |
|-----------|-------------|-------|
| **Paracore Addin** | Revit ribbon client, in-process execution engine, and the installed shared sidecar | `./build-addin.ps1` |
| **Paracore Desktop App** | Script gallery, REPL playground, parameter UI generator, Dynamo export, local Python backend | `./build-frontend.ps1` |
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

An optional MCP server that lets an AI assistant drive Revit from Claude Desktop, Cursor or VS Code. It generates and runs C# from the user's conversation — there is no fixed set of task tools. It lives in [paracore-gen](https://github.com/Sey56/paracore-gen). To build it locally:

```powershell
cd ../paracore-gen
./build-gen.ps1
```

## Documentation

- [User documentation](https://sey56.github.io/paracore-help/)
- [Development Guide](DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)
- [v4.9.0 release notes](Release-Notes-4.9.0.md)
- [v4.8.4 release notes](Release-Notes-4.8.4.md)

## License

MIT
