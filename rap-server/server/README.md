# rap-server - Local Backend Server

`rap-server` is the local backend for Paracore. It is a lightweight FastAPI application that acts as a crucial intermediary, connecting the `rap-web` user interface with the `Paracore.Addin` running inside Revit.

## Core Responsibilities

-   **API Gateway:** Exposes a RESTful API over HTTP for the `rap-web` frontend, handling all incoming requests for script management and execution.
-   **Filesystem Operations:** Manages browsing the local filesystem to discover and list available C# scripts for the script gallery.
-   **gRPC Client:** Talks to the **shared** `Paracore.Server.exe` sidecar on `localhost:50051`. That binary is installed with the Revit add-in; `sidecar_manager` starts it from there if absent or adopts it if already running, and keeps a `desktop.json` lease so the process survives Revit toggles.
-   **Offline Roslyn Services:** The sidecar answers completions, diagnostics, hover and gallery/script metadata locally using RevitAPI assemblies as metadata, with no Revit process. This is why editing works with Revit closed but still needs the add-in installed.
-   **Data Persistence:** Handles local data storage using an SQLite database for script run history and other metadata.
-   **IDE Sync Orchestration:** Initiates the creation of ephemeral VSCode workspaces by calling the appropriate gRPC endpoint on the `Paracore.Addin`.
-   **Authentication:** Includes an authentication router (`auth_router`) to handle user authentication and authorization. Supports both cloud-based authentication (via `rap-auth-server`) and local offline mode for single-user usage.

## API Endpoints

The server's functionality is organized into several routers:

-   **`script_management_router`**: Handles creating, reading, and managing scripts. This includes listing scripts from folders, fetching script content, and retrieving metadata and parameters.
-   **`script_execution_router`**: Exposes the endpoint to run scripts. It communicates with the Revit add-in to execute the script and logs the run history in the database. It also processes `structured_output` for the "Enhanced Execution Summary" feature.
-   **`presets_router`**: Manages parameter presets for scripts.
-   **`runs_router`**: Provides access to the script execution history.
-   **`status_router`**: Checks the status of the Revit add-in.
-   **`team_source_router`**: Manages the creation and opening of VSCode workspaces for script editing.
-   **`manifest_router`**: Handles script manifest generation and retrieval, scanning script directories to build a collection of script metadata.
-   **`user_settings_router`**: Manages user-specific settings, such as the path to agent scripts and other configuration preferences.
-   **`agent_router`**: Powers the Paracore Agent, handling conversational interactions and orchestration of Revit automation tasks.
-   **`generation_router`**: Provides endpoints for AI-powered script generation using LLMs.
-   **`auth_router`**: Manages user authentication and team management.

## Architecture

`rap-server` sits in the middle of the local Paracore stack. It listens for REST API calls from the `rap-web` frontend and routes them to the right engine:

- **Revit/C# work** goes over gRPC to the shared sidecar, which relays to the connected add-in only when execution is requested.
- **Python and IFC work** stays local and host-neutral (`ifc_tools/`, `python_ifc_executor.py`). It reads/writes IFC files and runs governed Python scripts with no Revit process and no add-in requirement.

The frontend never speaks gRPC directly, and the add-in never handles HTTP. The sidecar is shared, not owned: desktop and Revit both hold leases, and the last disconnect lets it retire. `GET /api/sidecar-status` reports whether the desktop started it, whether it is answering, and its PID; `GET /api/status` also reports `sidecarInstalled` so the UI can say `Add-in required` rather than a misleading transient `Disconnected`.

## Technology

-   **Python**: Primary programming language.
-   **FastAPI**: High-performance web framework for building the REST API.
-   **SQLite**: For lightweight, local data storage of script runs and other metadata.
-   **gRPC**: For efficient, low-latency communication with the `Paracore.Addin`.

To run the `rap-server` for development:

1. **Activate the virtual environment:**
   ```powershell
   .\.venv\Scripts\activate
   ```

2. **Start the server with Uvicorn:**
   ```bash
   uvicorn main:app --reload
   ```

This will launch the Uvicorn server, making the API available at `http://localhost:8000`.
