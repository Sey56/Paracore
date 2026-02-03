# Paracore Development Guide 🏗️⚡

## 🧠 Philosophy: Why Paracore?
Paracore is the result of an architect's passion for Revit and the desire to push its automation boundaries further. What began as a personal journey to solve everyday design challenges has evolved into a specialized platform for the next generation of BIM tools.

Engineered for the Future:
1.  **Expanding the Possible**: Built to sit alongside Revit's native power, providing a dynamic environment that makes sophisticated automation more reachable.
2.  **AI-Ready Foundation**: Designed as a deterministic host for AI Agents, allowing them to safely and intelligently interact with your Revit projects.
3.  **Creative Fluidity**: The same features that empower AI—like isolated execution and live parameter mapping—allow human developers to build and test ideas with unprecedented speed.

## 🧱 Workflow: The Three Pillars

### 1. Revit as the Host (The Listener)
The Revit Add-in acts as the gRPC host. It must be running and in the "**On**" state for the desktop app to function.
- **Build**: `./Paracore-Installer.ps1`
- **Verification**: Check the Paracore Tab in Revit.

### 2. The Sidecar (The Intelligence)
The `rap-server` sidecar handles script discovery and data persistence. Its lifecycle is managed by the desktop app in production, but it must be run manually during development.
- **Setup**: Use `uv` for all dependency management in `rap-server/server`.
- **Run**: `uvicorn main:app --reload` (after activating venv).

### 3. The Desktop App (The Command Center)
The Tauri UI consumes the backend API and orchestrates Revit commands.
- **Requirement**: Always run `npm run build` before `npm run tauri dev` to ensure the environment is healthy.
- **Connection Status**: Watch the **TopBar**. A green status (e.g., `Paracore Connected | Revit 2025`) indicates a healthy end-to-end link.

## 🧩 Extension Development
The VS Code extension is a critical part of the authoring flow. Use `./build_extension.sh` in **Git Bash** to keep your local extension synced with your code changes.

## 📦 Distribution
Use `./RAP-installer.ps1 -Release` to generate the final MSI. This bundles the UI and Sidecar into a single, user-friendly package.

## 📡 gRPC & Protobuf Synchronization
Paracore uses gRPC for high-performance communication with Revit. The service definition is maintained in `corescript.proto`.
- **Source of Truth**: `protos/corescript.proto`
- **Synchronization**: If you modify the protocol (e.g., adding fields for `rap-server` or the Revit add-in), you must manually copy the file to the VS Code extension's directory:
  - Copy `protos/corescript.proto` to `corescript-vscode/proto/corescript.proto`.
- **Reasoning**: Both `rap-server` and the VS Code extension communicate with the same `Paracore.Addin` gRPC server. Keeping these files identical ensures the extension remains compatible with the core engine.

---

*Focus on the logic. Let Paracore handle the rest.*
