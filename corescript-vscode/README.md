# CoreScript - VS Code Extension for Revit

This Visual Studio Code extension provides a seamless development environment for writing, testing, and executing C# scripts directly in Revit. It's designed for developers who want to create and automate Revit workflows using C# scripting.

## Features

-   **Workspace Scaffolding**: Initializes a new C# scripting workspace with the necessary project files and folder structure, accelerating development setup.
-   **Full IntelliSense**: Get real-time code completion and IntelliSense for the Revit API and custom global variables.
-   **Direct Script Execution**: Enables direct execution of the currently open C# script by sending it to a running instance of Revit.
-   **Immediate Feedback**: Displays the output and any errors from the script execution directly within the VS Code output channel.

## A Powerful, Standalone Scripting Tool

CoreScript is a powerful automation tool that allows you to write and execute C# scripts directly against the Revit API. It offers a complete, standalone solution for automating Revit tasks, with the key advantage of immediate execution and feedback without leaving your code editor.

### Key Benefits:

*   **Full Revit API Access:** Utilize the full power of the Revit API to create sophisticated automation workflows.
*   **Immediate Execution:** Run your scripts and see the results instantly in the VS Code output channel, enabling a rapid and interactive development cycle.
*   **No Overhead:** Focus purely on your automation logic. CoreScript removes the need for boilerplate code (`IExternalApplication`, `IExternalCommand`), `.addin` manifests, and manual DLL management.

While CoreScript is a powerful tool on its own, it also serves as an excellent companion for traditional add-in development. You can:

*   **Prototype and Iterate Rapidly:** Use CoreScript as a live scripting environment to quickly prototype and perfect your core logic before integrating it into a larger add-in with a custom UI.
*   **Streamline Your Workflow:** Test and debug your code in an agile environment, ensuring it works as expected before you package it into a final add-in.

Whether you're looking for a fast and direct way to automate Revit tasks or a way to accelerate your existing add-in development process, CoreScript provides the tools you need to be more productive.

## Requirements

Before using this extension, you must have the `RServer.Addin` for Revit installed.

1.  Run the `RServer_Installer.exe` to install the add-in.
2.  Launch Revit.
3.  Go to the "Paracore" tab in the Revit ribbon.
4.  Click the "RServer" toggle button to start the server.

## Usage

1.  **Create Workspace**: Create an empty folder (e.g., `TestWorkspace`) and run VS Code in it.
2.  **Initialize**: Open the Command Palette and select **CoreScript: Initialize Workspace** (or press `Ctrl+Shift+S`).
    *   This will scaffold the workspace with necessary files for Revit API IntelliSense and custom globals.
    *   **Important**: Wait for the workspace to be fully generated. It is complete when the `obj` and `bin` folders are created.
3.  **Write Scripts**: Navigate to the `Scripts` folder. The entry point is `Main.cs`. You can create additional scripts in this folder and reference them in `Main.cs`.
4.  **Run**: To execute your script, use the command **CoreScript: Run in Revit** (or press `Ctrl+Shift+R`).

## Execution Output

Results from your script execution are displayed in the **VS Code Output** channel.

*   **Print Statements**: Any `Print()` or `Println()` calls in your script will appear here.
*   **Status Messages**: Even if your script has no output, the engine provides a status message for every execution.

### Success

```text
✅ Code executed successfully | Tuesday 16, December 2025 | 03:45:22 PM
```

### Failure

If an error occurs, the output will show the failure status and the exception details:

```text
❌ Script execution failed | Tuesday 16, December 2025 | 04:15:39 PM
[ERROR] Autodesk.Revit.Exceptions.ArgumentNullException: The input argument "curve" of...
```

## Architecture

This extension functions as a gRPC client that establishes a direct connection with the `RServer.Addin` running within Revit. This provides a convenient and efficient workflow for developers to write and test scripts without leaving the VS Code environment.