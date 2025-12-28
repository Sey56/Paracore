# Paracore.Addin - Revit gRPC Server Add-in

`Paracore.Addin` is a Revit add-in that hosts the **Paracore Server** (a gRPC-based server) directly within the Revit environment. This server enables external applications (like the Paracore UI or VSCode) to communicate with Revit and execute C# scripts in-process.

## Core Features

-   **Paracore Server (gRPC):** Hosts a high-performance gRPC server (implemented in `CoreScriptServer.cs`) using Kestrel on `localhost:50051`. This server exposes the `CoreScriptRunner` service, enabling clients to check Revit's status, retrieve script metadata, and execute C# code.

-   **Revit UI Integration:**
    -   **Ribbon Control:** Adds a "Paracore" tab to the Revit ribbon with two toggle buttons:
        -   **"Paracore"** - Starts/stops the gRPC server (must be ON for script execution)
        -   **"Dashboard"** - Opens a dockable pane to monitor server status and execution history
    -   **Dockable Dashboard:** Provides a WPF-based dockable pane for monitoring.

-   **Thread-Safe Revit API Execution:** Guarantees safe interaction with the Revit API by marshalling all script execution requests onto Revit's main UI thread using Revit's `ExternalEvent` mechanism.

-   **CoreScript.Engine Integration:** Acts as the host for the `CoreScript.Engine`, which performs the actual compilation and execution of C# scripts using the Roslyn compiler.

-   **Context Provider:** Implements the `ICoreScriptContext` interface required by `CoreScript.Engine`. It provides live Revit API objects (`UIApplication`, `UIDocument`, `Document`) and captures all script output for relay back to the client.

-   **Singleton Execution:** Uses a `SemaphoreSlim` to ensure only one script execution request is processed at a time, preventing race conditions.

## Architecture & Communication Flow

`Paracore.Addin` is the critical bridge between external clients and the Revit API. Here's how the system works:

### The Three-Tier Architecture

1.  **Paracore UI (rap-web)** - Desktop application (React + Tauri)
2.  **rap-server** - Local Python FastAPI server (mediator on `localhost:8000`)
3.  **Paracore Server** - gRPC server inside Revit (this add-in, on `localhost:50051`)

### Request Lifecycle

1.  **Client Request:** The Paracore UI or VSCode sends an HTTP request to `rap-server`.

2.  **Mediation:** `rap-server` translates the HTTP request into a gRPC call and forwards it to the Paracore Server running inside Revit.

3.  **Service Reception:** The `CoreScriptRunnerService` (in `Paracore.Addin`) receives the gRPC request on a background thread.

4.  **Dispatch to Main Thread:** To safely interact with the Revit API, the service packages the script and parameters, then calls `ExternalEvent.Raise()` to signal Revit that work needs to be done on the main UI thread.

5.  **Safe API Context Execution:** Revit invokes the `ServerActionHandler` (an `IExternalEventHandler`) on the main UI thread:
    -   Creates a `ServerContext` to provide Revit objects and capture output
    -   Calls `CoreScript.Engine`'s `CodeRunner.Execute()` method
    -   The engine compiles and executes the C# script

6.  **Result Propagation:**
    -   The `ServerActionHandler` captures the `ExecutionResult`
    -   Results are passed back to the gRPC service using a `TaskCompletionSource`
    -   The service packages the results (output, errors, structured data) into a gRPC response
    -   `rap-server` receives the gRPC response and forwards it to the client

## Technologies Used

-   **.NET 8 & C#** - Core framework
-   **Revit API** - For all interactions with Revit
-   **gRPC / Kestrel** - High-performance server hosting
-   **WPF** - Dockable dashboard UI
-   **CoreScript.Engine** - Dynamic C# compilation and execution (Roslyn-based)
-   **Microsoft.Extensions.DependencyInjection** - Service management

## Usage

1.  Install the add-in using `Paracore_Revit_Installer.exe`
2.  Open Revit
3.  Go to the **Paracore** tab in the ribbon
4.  Click the **"Paracore"** button to start the server (it will turn green when active)
5.  The server is now ready to receive script execution requests from the Paracore UI or VSCode

> **Note:** The Paracore Server must be running (toggled ON) before you can execute scripts from any external client.