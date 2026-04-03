# corescript-vscode - VS Code Extension for Revit

This Visual Studio Code extension provides a seamless development environment for writing, testing, and executing **C# Top-level scripts** (C# Revit API scripts with custom global helpers) directly in Revit. It's designed for developers who want to quickly automate Revit workflows using pure C#.

## Features

-   **Workspace Scaffolding**: Initializes a new C# scripting workspace with the necessary project files and folder structure, accelerating development setup.
-   **Full IntelliSense**: Get real-time code completion and IntelliSense for the Revit API and custom global variables.
-   **Direct Script Execution**: Enables direct execution of the currently open C# script by sending it to a running instance of Revit.
-   **Immediate Feedback**: Displays the output and any errors from the script execution directly within the VS Code output channel.

## A Powerful, Agile Scripting Environment

Instead of being a separate language, this extension simply brings **C# Top-level scripting** to Revit. With custom global helpers (like `Print`, `Println`, `Show`, `Transact`, `Doc`, etc.), it simplifies Revit API automation. The **corescript-vscode** extension allows you to write and execute robust C# scripts directly against the Revit API, offering an agile solution for automating Revit tasks with immediate execution and feedback.

### Key Benefits:

*   **Full Revit API Access:** Utilize the full power of the Revit API to create sophisticated automation workflows using pure C#.
*   **Immediate Execution:** Run your C# scripts and see the results instantly in the VS Code output channel, enabling a rapid and interactive development cycle.
*   **No Overhead:** Focus purely on your automation logic. The engine removes the need for boilerplate code (`IExternalApplication`, `IExternalCommand`), `.addin` manifests, and manual DLL management.

While **corescript-vscode** is a powerful tool on its own, it also serves as an excellent companion for traditional add-in development. You can:

*   **Prototype and Iterate Rapidly:** Use the extension as a live scripting environment to quickly prototype and perfect your core logic before integrating it into a larger add-in with a custom UI.
*   **Streamline Your Workflow:** Test and debug your code in an agile environment, ensuring it works as expected before you package it into a final add-in.

Whether you're looking for a fast and direct way to automate Revit tasks or a way to accelerate your existing add-in development process, **corescript-vscode** provides the tools you need to be more productive.

## Requirements

Before using this extension, you must have the `Paracore.Addin` installed in Revit.

1.  Run the Paracore Installer to install the add-in.
2.  Launch Revit.
3.  Go to the "Paracore" tab in the Revit ribbon.
4.  Click the Server toggle button (it will initially say "Off"). Once toggled, it will show "ON", indicating the background server is ready to receive commands from this extension.

## Usage

1.  **Create Workspace**: Create an empty folder (e.g., `TestWorkspace`), then open it in VS Code (e.g., right-click the folder and select "Open with Code").
2.  **Initialize**: Press `Ctrl+Shift+S` (or use the Command Palette: **CoreScript: Initialize Workspace**) to set up the workspace.
    *   This will scaffold the workspace with necessary files for Revit API IntelliSense and custom globals.
    *   **Important**: Wait for the workspace to be fully generated. It is complete when the `obj` and `bin` folders are created.
3.  **Write Scripts**: Navigate to the new `Scripts` folder. The entry point is `Main.cs`. You can write code directly here, or create other `.cs` files inside the `Scripts` folder and reference them in `Main.cs`.
4.  **Run**: To execute your script, press `Ctrl+Shift+R`. All outputs will stream directly to the VS Code Output tab.

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

This extension functions as a gRPC client that establishes a direct connection with the `Paracore.Addin` running within Revit. This provides a convenient and efficient workflow for developers to write and test C# scripts without leaving the VS Code environment.