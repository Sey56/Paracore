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

```powershell
./build-addin.ps1               # Revit add-in (.NET 8)
./build-frontend.ps1 -Release   # Desktop app (Tauri + Python sidecar)
```

```bash
./build_extension.sh            # VS Code extension (Git Bash)
```

Requirements: .NET 8 SDK, Node.js, Python 3.12, Inno Setup 6.

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

The service definition is `protos/corescript.proto`. After changing it:

```bash
cd rap-server/server
python sync_protos.py   # regenerates Python stubs + copies .proto to VS Code extension
```

Both `rap-server` and `corescript-vscode` share the same gRPC contract.

## Cross-Repo

This is the **public** repo (MIT) — the free add-in, desktop app, and VS Code extension.

The **private** `paracore-pro` repo contains commercial extensions (TakeOff, Rebar, MEP) and specialized MCP servers. Both add-ins share the same gRPC proto, ClientId, and install folder — swapping between them is just file overwrite.

Bug fixes to base engine/add-in should be made here first, then copied to `paracore-pro`. Commercial features are developed in `paracore-pro` only.
