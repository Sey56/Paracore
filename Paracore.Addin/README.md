# RServer.Addin - Revit gRPC Server Add-in

`RServer.Addin` is a Revit add-in that acts as the essential in-process agent for the Revit Automation Platform (RAP). It hosts a gRPC server directly within the Revit environment, allowing external applications to communicate with and execute C# scripts inside Revit securely and efficiently.

## Core Features

-   **gRPC Server Hosting:** Hosts a high-performance gRPC server using Kestrel on `localhost:50051`. This server exposes the `CoreScriptRunner` service, enabling clients to check Revit's status, get script metadata, and execute code.

-   **Revit UI Integration:**
    -   **Ribbon Control:** Adds a "CoreScript" tab to the Revit ribbon with a toggle button to start and stop the gRPC server.
    -   **Dockable Dashboard:** Provides a dockable WPF pane to monitor server status and view execution history.

-   **Thread-Safe Revit API Execution:** Guarantees safe interaction with the Revit API by marshalling all script execution requests onto Revit's main UI thread. This is achieved using Revit's `ExternalEvent` mechanism, which is the only correct and stable way to handle calls into the API from external sources or background threads.

-   **Engine Integration:** Acts as the host for the `CoreScript.Engine`. It invokes the engine to perform the actual compilation and execution of the C# scripts.

-   **Context Provider:** Implements the `ICoreScriptContext` interface required by the `CoreScript.Engine`. It provides the engine with live Revit API objects (`UIApplication`, `UIDocument`, `Document`) and captures all script output (standard print messages and structured JSON data) for relay back to the client.

-   **Singleton Execution:** Uses a `SemaphoreSlim` to ensure that only one script execution request is processed at a time, preventing race conditions and ensuring stable execution.

## Architecture & Workflow

`RServer.Addin` is the critical bridge between the external RAP ecosystem and the internal Revit API. The request lifecycle is carefully designed to ensure thread safety and responsiveness.

1.  **Client Request:** An external client (like `rap-server`) sends a gRPC request (e.g., `ExecuteScript`) to the Kestrel server running inside Revit.

2.  **Service Reception:** The `CoreScriptRunnerService` receives the request on a background thread from the Kestrel thread pool.

3.  **Dispatch to Main Thread:** To interact with the Revit API safely, the service **does not** execute the script directly. Instead, it packages the script and parameters and hands them to the `ServerViewModel`, which then calls `ExternalEvent.Raise()`. This signals to Revit that there is work to be done on the main UI thread.

4.  **Safe API Context Execution:** Revit invokes the `ServerActionHandler` (an `IExternalEventHandler`) on the main UI thread. This handler now has a valid Revit API context.
    -   It retrieves the script details from the `ServerViewModel`.
    -   It creates a `ServerContext` object to provide the script with Revit objects and capture its output.
    -   It calls the `CoreScript.Engine`'s `CodeRunner.Execute()` method, passing the script and the context.

5.  **Result Propagation:**
    -   Once the `CoreScript.Engine` finishes execution, the `ServerActionHandler` captures the `ExecutionResult`.
    -   The result is passed back to the `CoreScriptRunnerService` on the background thread using a `TaskCompletionSource` that was being awaited.
    -   The `RScriptRunnerService` packages the results (output, errors, structured data) into a gRPC response and sends it back to the original client.

## Technologies Used

-   **.NET & C#:** The core framework for the add-in.
-   **Revit API:** For all interactions with Revit.
-   **gRPC / Kestrel:** For hosting the high-performance, cross-platform API.
-   **WPF:** For the dockable dashboard UI.
-   **Microsoft.Extensions.DependencyInjection:** For managing services and dependencies.