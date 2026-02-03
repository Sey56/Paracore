# Paracore Development Guide 🏗️⚡

## 🧠 Philosophy: why Paracore?
Paracore was built to eliminate the infrastructure overhead of Revit API development. By decoupling the UI from the execution engine, we provide a lightning-fast, iterative environment for professional automation.

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

---

*Focus on the logic. Let Paracore handle the rest.*
