# rap-web (Paracore UI)

**rap-web** is the desktop user interface for **Paracore**, a dynamic C# scripting platform for Autodesk Revit. Built with React and Tauri, it provides a high-performance environment for manual automation, AI script generation, and agentic orchestration.

## Architecture

`rap-web` is a local-first application that talks to:

- **Local backend (`rap-server`)**: a Python FastAPI process for script discovery, persistence, REPL services and **host-neutral Python/IFC execution**. IFC support uses `ifcopenshell`; it needs no Revit host.
- **Shared sidecar (`Paracore.Server.exe`)**: ONE C# gRPC process on `localhost:50051`. It is installed with the **Revit add-in**, not with the desktop app. At boot the desktop app starts it from the add-in folder if necessary, or adopts it if Revit already started it. It answers Roslyn IntelliSense, diagnostics, hover, gallery metadata and script parameters with no Revit process.
- **Revit add-in (`Paracore.Addin`)**: the host that actually executes C# inside Revit. The ribbon toggle opens and closes Revit's subscription to the shared sidecar; it does not own the process.

Only one sidecar runs. Desktop and Revit write heartbeat leases (`desktop.json`, `revit.json`); the sidecar retires itself when the last app disconnects. The TopBar reflects this: `Offline` means the sidecar is alive but Revit is not connected, `Connected` means Revit is subscribed, and `Add-in required` means no installed sidecar was found.

Execution always requires an installed add-in and ribbon toggle ON. Editing, gallery browsing and IntelliSense work with Revit closed, but still require the add-in to be installed because that is where the sidecar lives.

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