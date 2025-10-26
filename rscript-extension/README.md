# rscript-extension - Revit Automation Platform (RAP) VS Code Extension

This project is a Visual Studio Code extension designed to provide a seamless development environment for writing, testing, and executing C# scripts directly within the Revit Automation Platform (RAP) ecosystem.

## Project Context: Revit Automation Platform (RAP)

The `rscript-extension` is a key component of the larger Revit Automation Platform (RAP), a system built to empower users with dynamic C# script execution for Revit workflows. RAP comprises several interconnected projects:

-   **`rap-web`:** The web-based user interface for interacting with the platform.
-   **`rap-web/server`:** A Python FastAPI backend that acts as an intermediary between `rap-web` and the Revit environment.
-   **`rscript-extension` (This project):** The Visual Studio Code extension for direct script development and execution from VS Code to Revit.
-   **`RScript.Engine`:** A C# library responsible for the dynamic compilation and execution of C# scripts using Roslyn.
-   **`RServer.Addin`:** A Revit Add-in that hosts a gRPC server, enabling communication between external applications (like this extension and `rap-web/server`) and the Revit environment.

## Features

-   **Workspace Scaffolding**: Initializes a new C# scripting workspace with the necessary project files and folder structure, accelerating development setup.
-   **Script Execution**: Enables direct execution of the currently open C# script by sending it to a running instance of Revit via the `RServer.Addin`.
-   **Output Display**: Displays the output and any errors from the script execution directly within the VS Code output channel, providing immediate feedback.

## Usage

1.  **Initialize Workspace**: Open a new folder in VS Code and run the `RScript: Initialize Workspace` command from the command palette. This sets up the basic project structure.
2.  **Write Script**: Write your C# script in the created `.cs` files. The extension provides a convenient environment for script development.
3.  **Run Script**: With a C# script open and a Revit instance running `RServer.Addin`, run the `RScript: Send Script to Revit` command to execute it directly in Revit.

## Architecture

This extension functions as a gRPC client. It establishes a direct connection with the `RServer.Addin` running within Revit, bypassing the `rap-web/server` for a more immediate development and testing workflow. This direct communication provides a convenient and efficient way for developers to write and test scripts without leaving the VS Code environment.
