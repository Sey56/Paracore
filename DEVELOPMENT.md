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

1. Build and install the add-in, open Revit — verify the Paracore tab shows "On"
2. Start the server: `cd rap-server/server && uvicorn main:app --reload`
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
