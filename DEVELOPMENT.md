# Development Guide

This guide explains how to set up and develop Paracore locally. The project uses a non-traditional development workflow optimized for rapid iteration by an architect-developer.

## Prerequisites

- **Revit 2025+** (for testing the add-in)
- **.NET 8 SDK** (for C# projects)
- **Node.js 18+** and **npm** (for the web UI)
- **Python 3.12+** (for the backend server)
- **uv** (Python package manager - [install here](https://github.com/astral-sh/uv))
- **Rust** (for Tauri desktop app)
- **Git Bash** (for building the VS Code extension)
- **PowerShell 7+** (for installer scripts)
- **Inno Setup** (for creating Windows installers - [download here](https://jrsoftware.org/isdl.php))

> **Note:** The AI Script Generation and Agentic Automation features are **proof-of-concept**. They are client-side implementations where users provide their own API keys. See [CLOUD_FEATURES.md](CLOUD_FEATURES.md) for details.

## Project Structure

```
Paracore/
├── rap-server/          # Python backend (FastAPI)
├── rap-web/             # React + TypeScript + Tauri desktop app
├── Paracore.Addin/      # C# Revit add-in
├── CoreScript.Engine/   # C# scripting engine
├── corescript-vscode/   # VS Code extension
└── rap-auth-server/     # Cloud authentication service (optional)
```

---

## Development Workflow

### 1. Running the Backend Server (rap-server)

The backend server mediates between the rap-web UI and the Revit add-in.

```bash
# Navigate to the server directory
cd rap-server/server

# Activate the uv virtual environment
./.venv/Scripts/activate

# Run the server with auto-reload
uvicorn main:app --reload
```

**Server will be available at:** `http://127.0.0.1:8000`

#### Setting up the environment (first time):

```bash
cd rap-server/server
uv sync
```

> **Note:** Use `uv add` instead of `uv pip install` to ensure dependencies are registered in `pyproject.toml`.

---

### 2. Running rap-web (Paracore UI)

The desktop application built with React, TypeScript, and Tauri.

```bash
# Navigate to the web directory
cd rap-web

# Run in development mode
npm run tauri dev
```

This starts the Tauri app with hot-reload enabled.

---

### 3. Building the Revit Add-in Installer

The Revit add-in hosts the gRPC server inside Revit.

```bash
# From the Paracore root directory
./Paracore-installer.ps1
```

**Output:** `installers/Paracore_Revit_Installer.exe`

**Install it in Revit**, then start the Paracore server (sometimes called RServer in documentation).

---

### 4. Building the Full Paracore Installer (Release)

This compiles the complete Paracore desktop application package, which manages the lifecycle of the rap-server.

```bash
# From the Paracore root directory
./RAP-installer.ps1 -Release
```

This builds:
- The React + TypeScript + Tauri app
- Bundles the rap-server (Python backend)
- Creates a standalone installer

---

### 5. Building the VS Code Extension (corescript-vscode)

The VS Code extension enables script execution directly from VS Code without installing the Paracore UI.

```bash
# From the Paracore root directory (using Git Bash)
./build_extension.sh
```

This script:
- Builds the extension
- Packages it as a `.vsix`
- Uninstalls the old version from VS Code (if present)
- Reinstalls the new version

---

## Testing the Full Stack

1. **Install the Revit Add-in** (using `Paracore-installer.ps1`)
2. **Start Revit** and verify the Paracore add-in is loaded
3. **Run the backend server** (`uvicorn main:app --reload`)
4. **Run the rap-web UI** (`npm run tauri dev`)
5. **Test automation** by creating and executing a script

---

## Cloud Features (Optional)

### rap-auth-server

### rap-auth-server

The cloud authentication service enables:
- **User Authentication** (Google OAuth2)
- **Team Management** (Inviting members, assigning roles)
- **Workspace Registration** (Defining Git repositories for teams)

> **Note:** AI Script Generation and Agentic Automation are **not** hosted by rap-auth-server. They are client-side features where the user provides their own API keys (e.g., Google Gemini) or connects to other providers. They do not require the cloud auth server to function in a local context, but team-based features do.

**Setup:**

1. Deploy `rap-auth-server` to Railway or similar hosting
2. Set environment variables (see `rap-auth-server/server/.env.example`)
3. Configure Google OAuth credentials
4. Generate JWT keys: `python generate_keys.py`

**Current Status:**
- ✅ **Core Automation:** Complete and production-ready
- ⚠️ **AI Script Generation:** Works with free Gemini API only
- ⚠️ **Agentic Automation:** Functional but needs further development (uses LangGraph, HITL modal, script selection)

---

## Development Philosophy

This project follows an **architect-driven development approach**:

- **Rapid iteration** over formal testing
- **AI-assisted coding** (using tools like Gemini)
- **Practical workflows** optimized for AEC professionals
- **Minimal boilerplate** and ceremony

**What's NOT included (yet):**
- Unit tests
- CI/CD pipelines
- Formal code reviews
- Strict coding standards

**Contributions are welcome!** If you're a professional developer, feel free to fork and add these practices.

---

## Common Development Tasks

### Adding a Python Dependency

```bash
cd rap-server/server
./.venv/Scripts/activate
uv add package-name
```

### Updating the React UI

```bash
cd rap-web
npm install new-package
# Edit files in src/
# Changes auto-reload with `npm run tauri dev`
```

### Modifying the C# Engine

```bash
# Edit files in CoreScript.Engine/ or Paracore.Addin/
# Rebuild the add-in installer
./Paracore-installer.ps1
# Reinstall in Revit
```

### Debugging the Agent

The agent code is in `rap-server/server/agent/`:
- `graph.py` - LangGraph workflow
- `tools.py` - Available tools (script discovery, execution)
- `state.py` - Agent state schema

---

## Troubleshooting

### "Module not found" in Python
- Make sure you're in the activated virtual environment
- Use `uv add` instead of `pip install`

### Tauri build fails
- Check Rust is installed: `rustc --version`
- Clear cache: `cd rap-web/src-tauri && cargo clean`

### Revit add-in not loading
- Check Revit version compatibility (.NET 8)
- Verify `.addin` manifest is in the correct folder
- Check Revit's add-in manager for errors

---

## Next Steps for Contributors

If you want to improve the development workflow:

1. **Add unit tests** (pytest for Python, Jest for TypeScript, xUnit for C#)
2. **Set up CI/CD** (GitHub Actions for automated builds)
3. **Add linting** (ESLint, Pylint, Roslyn analyzers)
4. **Improve error handling** (better logging, user-friendly error messages)
5. **Optimize build scripts** (faster compilation, smaller bundles)

---

**Questions?** Open an issue on GitHub or email: codarch46@gmail.com
