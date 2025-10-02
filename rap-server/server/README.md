# rap-server - Local Backend Server

`rap-server` is the local backend for the Revit Automation Platform (RAP). It is a lightweight FastAPI application that acts as a crucial intermediary, connecting the `rap-web` user interface with the `RServer.Addin` running inside Revit.

## Core Responsibilities

-   **API Gateway:** Exposes a RESTful API over HTTP for the `rap-web` frontend, handling all incoming requests for script management and execution.
-   **Filesystem Operations:** Manages browsing the local filesystem to discover and list available C# scripts for the script gallery.
-   **gRPC Client:** Acts as the client for the gRPC server hosted by `RServer.Addin`. It translates the frontend's HTTP requests into gRPC calls to be executed inside Revit.
-   **Data Persistence:** Handles local data storage using an SQLite database for script run history and other metadata.
-   **Workspace Orchestration:** Initiates the creation of ephemeral VSCode workspaces by calling the appropriate gRPC endpoint on the `RServer.Addin`.
-   **Authentication:** Includes an authentication router (`auth_router`) to handle user authentication and authorization. For local development, it uses a hardcoded user ID.

## API Endpoints

The server's functionality is organized into several routers:

-   **`script_management_router`**: Handles creating, reading, and managing scripts. This includes listing scripts from folders, fetching script content, and retrieving metadata and parameters.
-   **`script_execution_router`**: Exposes the endpoint to run scripts. It communicates with the Revit add-in to execute the script and logs the run history in the database. It also processes `structured_output` for the "Enhanced Execution Summary" feature.
-   **`presets_router`**: Manages parameter presets for scripts.
-   **`runs_router`**: Provides access to the script execution history.
-   **`status_router`**: Checks the status of the Revit add-in.
-   **`workspace_router`**: Manages the creation and opening of VSCode workspaces for script editing.
-   **`publish_router`**: Handles publishing scripts to a remote repository.
-   **`auth_router`**: Manages user authentication.

## Architecture

`rap-server` sits in the middle of the local RAP stack. It listens for REST API calls from the `rap-web` frontend, processes them, and communicates with the `RServer.Addin` via gRPC to interact with Revit. This creates a clean separation of concerns, where the frontend doesn't need to know about gRPC, and the Revit add-in doesn't need to handle HTTP.

## Technology

-   **Python**: Primary programming language.
-   **FastAPI**: High-performance web framework for building the REST API.
-   **SQLite**: For lightweight, local data storage of script runs and other metadata.
-   **gRPC**: For efficient, low-latency communication with the `RServer.Addin`.

## Getting Started

To run the `rap-server` for development, it is typically started via an npm script in the `rap-web` project.

```bash
# In the rap-web directory
npm run start-backend
```

This will launch the Uvicorn server, making the API available at `http://localhost:8000`.
