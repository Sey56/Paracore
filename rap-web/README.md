# rap-web (Paracore UI)

**rap-web** is the desktop user interface for **Paracore**, a dynamic C# scripting platform for Autodesk Revit. Built with React and Tauri, it provides a high-performance environment for manual automation, AI script generation, and agentic orchestration.

## Architecture

`rap-web` is a local-first application that interacts with:
- **Local Backend Sidecar (`rap-server`)**: A local Python process (FastAPI) that handles script discovery and persistence.
- **Revit Add-in (`Paracore.Addin`)**: The host inside Revit that executes your C# logic in-process via gRPC.

## Development Setup

To run the UI in your local development environment, you **must build the web assets first** before starting the Tauri server.

1.  **Build Assets**:
    ```bash
    npm run build
    ```

2.  **Start Tauri Dev Server**:
    Once the build finishes successfully:
    ```bash
    npm run tauri dev
    ```

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS.
- **Desktop Host**: Tauri (Rust).
- **Communication**: Axios (REST to Sidecar).
- **State Management**: React Context API.

---

*Focus on the logic. Let Paracore handle the rest.*