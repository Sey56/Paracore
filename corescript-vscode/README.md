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

1.  **Initialize Workspace**: Open a new folder in VS Code and run the `CoreScript: Initialize Workspace` command (`Ctrl+Shift+S`) from the command palette. This sets up the basic project structure.
2.  **Write Script**: Write your C# script in the created `.cs` files.
3.  **Run Script**: With a C# script open and a Revit instance running with the RServer active, run the `CoreScript: Send Script` command (`Ctrl+Shift+R`) to execute it directly in Revit.

## Architecture

This extension functions as a gRPC client that establishes a direct connection with the `RServer.Addin` running within Revit. This provides a convenient and efficient workflow for developers to write and test scripts without leaving the VS Code environment.