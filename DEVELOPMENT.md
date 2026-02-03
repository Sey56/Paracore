# Paracore Development Guide 🏗️⚡

## 🧠 Philosophy: Why Paracore?
Paracore was born from an architect's journey to solve the day-to-day bottlenecks of Revit automation. Starting with personal productivity tools, it evolved into a deliberate engineering project to build a robust, deterministic host for **AI Agents**.

To bridge the gap between AI and the Revit API, we architected the system for safety and speed:
1.  **Engineered for AI**: We built a dynamic, isolated execution engine so an AI agent can select, parameterize, and run scripts without the risks of manual compilation.
2.  **Solves for the Developer**: The same features that make the environment safe for AI—like hot-reloading, auto-UI generation, and isolated contexts—provide an immense productivity boost for human developers.
3.  **Cross-Ecosystem Connection**: By moving the platform logic outside of Revit's UI constraints (using React/Tauri), we unlock the power of modern software tools for the AEC industry.

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
