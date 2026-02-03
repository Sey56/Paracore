# Contributing to Paracore

Thank you for your interest in making Revit automation more accessible! To ensure a smooth development experience, please follow these project-specific setup and build instructions.

## 🛠️ Development Setup

Paracore is a multi-component system. Follow these steps in order to set up your local development environment.

### 1. Revit Add-in & Core Engine (C#)
1.  **Prerequisite**: Create an `installers` folder at the root of the repository.
2.  **Build**: Open PowerShell and run the installer script:
    ```powershell
    ./Paracore-Installer.ps1
    ```
    This script builds the `Paracore.Addin` and the `CoreScript.Engine` (referenced as a dependency).
3.  **Install**: Find `Paracore_Addin.exe` in the `installers` folder and run it to install the add-in.
4.  **Activate**: Start Revit 2025+. In the **Paracore** ribbon tab, find the server icon (initially showing "Off"). Click it to start the listener; a TaskDialog will confirm the server is now **On**.

### 2. Desktop Application (React + Tauri)
The UI must be built before starting the development server to ensure all assets are correctly registered.
1.  Navigate to the web project: `cd rap-web`
2.  **Build First**: `npm run build`
3.  **Run Dev**: Once the build finishes without errors, start the Tauri app:
    ```bash
    npm run tauri dev
    ```

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
To develop or build the `corescript-vscode` extension, use **Git Bash**:
1.  Run the build script from the root:
    ```bash
    ./build_extension.sh
    ```
    This script automates building the VSIX, uninstalling the previous version from VS Code, and installing the fresh build.

---

## 📦 Production Builds

To generate the final production installer (MSI) for the entire ecosystem:
1.  Open PowerShell.
2.  Run the production entry script:
    ```powershell
    ./RAP-installer.ps1 -Release
    ```
    The resulting `Paracore` MSI will be generated in the `installers` folder.

---

## 🤝 Submission Process
1.  **Fork** the repository and create your feature branch.
2.  **Verify** your changes by checking the connection status in the Desktop App's **TopBar** (Connection Status: Green | Revit 2025 | Project).
3.  **Commit** with clear, descriptive messages.
4.  **Submit** a Pull Request against the `main` branch.

**Questions?** Reach out to [codarch46@gmail.com](mailto:codarch46@gmail.com)
