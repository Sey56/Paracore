# Contributing to Paracore

Thank you for your interest in making Revit automation more accessible! To ensure a smooth development experience, please follow these project-specific setup and build instructions.

## 🛠️ Development Setup

Paracore is a multi-component system. Follow these steps in order to set up your local development environment.

### 1. Revit Add-in & Core Engine (C#)
1.  **Prerequisite**: An `installers` folder at the root of the repository (the build scripts create it if it is missing).
2.  **Build**: Open PowerShell at the repo root and run:
    ```powershell
    ./build-addin.ps1
    ```
    This builds the `Paracore.Addin` and the `CoreScript.Engine` it depends on, then packages the installer with Inno Setup.
3.  **Install**: Run `installers/Paracore_Addin_v<version>.exe` to install the add-in.
4.  **Activate**: Start Revit 2025+. In the **Paracore** ribbon tab, find the server icon (initially showing "Off"). Click it to start the listener; a TaskDialog will confirm the server is now **On**.

### 2. Desktop Application (React + Tauri)
The desktop app and the API server are normally started together from the repo root:

```powershell
./dev.ps1
```

`dev.ps1` runs `uvicorn` and `npm --prefix rap-web run tauri dev` under `npx concurrently`, and stops both when either one exits — see [Run (development)](DEVELOPMENT.md#run-development).

To drive it by hand instead:
1.  Navigate to the web project: `cd rap-web`
2.  **Run Dev**: `npm run tauri dev`
3.  **Browser instead of the Tauri window**: `npm run dev`

No pre-build is required. `tauri dev` starts the Vite dev server on its own, and the production
frontend build (`npm run build`) is wired in as Tauri's `beforeBuildCommand`, so
`./build-frontend.ps1` runs it for you.

### 3. Local Backend Sidecar (Python)
The backend uses `uv` for high-performance package management.
1.  Navigate to the server project: `cd rap-server/server`
2.  **Activate Environment**: `./.venv/Scripts/activate`
3.  **Manage Dependencies**: Use `uv` strictly (e.g., `uv add <module>`). 
4.  **Run**:
    ```bash
    uvicorn main:app --reload
    ```

### 4. VS Code Extension (Optional)
To build and install the `corescript-vscode` extension:
1.  Run the build script from the root, in PowerShell:
    ```powershell
    ./build-extension.ps1
    ```
    This script packages the VSIX (running the production webpack bundle first), copies it to `installers/`, then uninstalls the previous version from VS Code and installs the fresh build. Add `-SkipInstall` to package and copy without touching VS Code.

---

## 📦 Production Builds

There is no umbrella "release" script, and no `-Release` flag. Each component has one
parameterless build script, run from the repo root in PowerShell:

```powershell
./build-addin.ps1        # -> installers/Paracore_Addin_v<version>.exe
./build-frontend.ps1     # -> installers/Paracore_<version>_x64.msi
./build-extension.ps1    # -> installers/corescript-<version>.vsix
```

The resulting installers all land in the `installers` folder.

---

## 🤝 Submission Process
1.  **Fork** the repository and create your feature branch.
2.  **Verify** your changes by checking the connection status in the Desktop App's **TopBar** (Connection Status: Green | Revit 2025 | Project).
3.  **Commit** with clear, descriptive messages.
4.  **Submit** a Pull Request against the `main` branch.

**Questions?** Reach out to [codarch46@gmail.com](mailto:codarch46@gmail.com)
