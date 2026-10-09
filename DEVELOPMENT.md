# Paracore Development Guide

## Architecture

Paracore has three components that run together:

```
Revit + Paracore.Addin (gRPC host, port 50051)
        ↑
rap-server (Python/FastAPI — script management, agent, API)
        ↑
rap-web (Tauri desktop app)
```

## Build

Every build script is PowerShell and runs from the repo root:

```powershell
./build-addin.ps1        # Revit add-in (.NET 8)
./build-frontend.ps1     # Desktop app installer
./build-extension.ps1    # VS Code extension
```

Requirements: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

| script | output | notes |
| --- | --- | --- |
| `build-addin.ps1` | `installers/Paracore_Addin_v<version>.exe` | add-in + engine; needs Inno Setup 6 |
| `build-frontend.ps1` | `installers/Paracore_<version>_x64.msi` | Tauri app + embedded Python sidecar |
| `build-extension.ps1` | `installers/corescript-<version>.vsix` | also reloads it in VS Code; `-SkipInstall` skips that |

⚠ **None of them take a `-Release` flag.** All three are parameterless. There is no release/dev
switch any more — `build-frontend.ps1` *is* the installer path, and it is the only one. Local
development never produces an installer; see the next section.

## Run (development)

### One command (server + desktop app together)

From the **repo root**, `dev.ps1` starts the API server and the Tauri desktop app in a single
terminal, and stops both when either one exits:

```powershell
.\dev.ps1
```

Under the hood it runs `npx concurrently` over two processes:

| process | command |
| --- | --- |
| `SERVER` | `rap-server/server/.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload` |
| `WEB` | `npm --prefix rap-web run tauri dev` |

**Prerequisites**

1. `rap-web/node_modules` — run `npm install` inside `rap-web`.
2. A Python venv at `rap-server/server/.venv`. `dev.ps1` exits with an error if it is missing. The
   project's own instruction (see the header of `requirements.txt`) is **`uv sync`**:

```powershell
cd rap-server/server
uv sync          # creates .venv from pyproject.toml + uv.lock
```

<details>
<summary>Without uv (plain pip)</summary>

```powershell
cd rap-server/server
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

</details>

`dev.ps1` calls `concurrently` through `npx`, so npx will offer to fetch it on first run.

> ⚠ **Known wart — the server gets started twice.** `rap-web/src-tauri/tauri.conf.json` sets
> `"beforeDevCommand": "npm run dev"`, and that npm script *itself* launches the server, so `tauri dev`
> spins up a second `uvicorn` on port 8000. Today this stays harmless only because `npm run dev` calls a
> bare `uvicorn`, which is not on `PATH` — the duplicate fails to start and Vite keeps going. If you ever
> put `uvicorn` on `PATH`, the two copies fight for the port and `concurrently --kill-others` can take the
> whole session down. To remove the duplication, give Tauri a Vite-only command — add `"dev:web": "vite"`
> to `rap-web/package.json` and point `beforeDevCommand` at `npm run dev:web`.

### Browser instead of the desktop shell

`npm run dev` in `rap-web` runs the server plus Vite in a browser instead of the Tauri window. It calls a
bare `uvicorn`, so activate the venv first:

```bash
cd rap-web
npm run dev
```

### Manual (two terminals)

1. Build and install the add-in, open Revit — verify the Paracore tab shows "On"
2. Start the server: `cd rap-server/server && .\.venv\Scripts\python -m uvicorn main:app --reload`
3. Start the UI: `cd rap-web && npm run tauri dev`

The TopBar shows green when all three are connected (e.g. "Paracore Connected | Revit 2025").

## gRPC & Protobuf

`protos/corescript.proto` is the **ONE authority** for the Revit wire contract. After changing it:

```bash
python scripts/gen-protos.py --check   # contract gate; exit 1 on any drift
python scripts/gen-protos.py --write   # copy the proto, regenerate only drifted stubs
```

Run it with a python that has both `grpcio-tools` and `protobuf` (the `rap-server` venv qualifies).

⚠ **Every other copy is GENERATED — edit the authority, never a copy:**

- `corescript-vscode/proto/corescript.proto` — a runtime copy, shipped inside the `.vsix` and loaded by `@grpc/proto-loader`. Compared byte-for-byte.
- `paracore-gen` / `paracore-forge` / `paracore-takeoff` — each checks in a generated `corescript_pb2*.py`. Compared by CONTRACT, so a `protoc` toolchain bump never churns nine files.

`Paracore.Addin` and `Paracore.Server` compile the authority directly through MSBuild, so they cannot drift. `rap-server` has no stub of its own — it resolves `grpc_client` and `corescript_pb2` from `paracore-gen` at runtime (see the `sys.path` resolution in `main.py`).

⚠ **A stale proto fails SILENTLY.** Protobuf reads a missing field as its default, so nothing throws — the caller simply behaves as if the answer were "no". That is why this is a gate, not a report. It is also why the VS Code copy sat three fields behind for three months without anyone noticing.

## Cross-Repo

This is the **public** repo (MIT) — the generic add-in, engine, desktop app, and VS Code extension.

⚠⚠ **`paracore-pro` no longer exists (deleted 2026-10-09, user ruling).** There is **no Pro add-in and no second engine tree.** The engine and add-in here are **always free and generic**, and they are the **single source of truth** for engine code — there is nothing to sync and nothing to copy down.

A **pack** — the Pro/free unit — lives in **its own tool's repo** (e.g. `paracore-takeoff/pack/`), never here and never in a shared tree. The specialist MCPs (`paracore-gen`, `paracore-forge`, `paracore-takeoff`) are separate sibling repos, each with its own exe and installer.
