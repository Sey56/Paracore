# CoreScript.Engine - Dynamic C# Script Execution Engine

`CoreScript.Engine` is a powerful C# library designed for the dynamic compilation and execution of C# scripts at runtime. It is the core of the Revit Automation Platform (RAP), leveraging the Roslyn compiler to provide a secure, flexible, and robust environment for running user-defined code within the Autodesk Revit application.

## Core Features

-   **Dynamic C# Compilation:** Compiles and executes C# code from strings on-the-fly using the `Microsoft.CodeAnalysis.CSharp.Scripting` API (Roslyn).

-   **Parameter Injection via Syntax Tree Rewriting:** Instead of passing variables, the engine directly injects parameters into the script's source code before compilation. It parses the C# code into a Roslyn syntax tree and uses a custom `CSharpSyntaxRewriter` to replace placeholder variable initializers with the provided parameter values. This allows for powerful, type-safe modifications at runtime.

-   **Sandboxed and Isolated Execution:** Each script is executed within its own collectible `AssemblyLoadContext`. This ensures that script assemblies are isolated from the host application and can be unloaded immediately after execution, preventing memory leaks and assembly conflicts.

-   **Rich and Static Execution Context:** Scripts are executed within a rich, static context provided by the `ExecutionGlobals` class. This is achieved by creating an `ExecutionGlobals` instance for each run and injecting a `using static CoreScript.Engine.Globals.ScriptApi;` directive into the script. This provides a clean, static API, including:
    -   **Revit API Access:** `UIApp`, `UIDoc`, `Doc` (properties for accessing the current Revit application, UI document, and document)
    -   **Input Parameters:** `Parameters` (a `Dictionary<string, object>` containing user-provided inputs)
    -   **Logging:** `Print(string message)` and `Println(string message)` (methods for outputting messages to the host, with `Println` adding a newline)
    -   **Transactions:** `Transact(string name, Action<Document> action)` and `Transact(string name, Action action)` (methods for wrapping Revit API modifications within a transaction)
    -   **Structured Output:** `Output.Show(string type, object data)` (a method accessed via the `Output` property, used for returning complex, structured data in a serialized JSON format to the host)

-   **Multi-File Script Support:** The engine's `SemanticCombinator` can combine multiple C# source files into a single logical script, allowing users to organize their code into classes and helpers while maintaining a single execution flow.

-   **Comprehensive Error Handling:** The engine catches and logs detailed compilation and runtime exceptions, providing clear feedback to the user and host application.

## Architecture & Workflow

`CoreScript.Engine` is designed to be consumed as a library by a host application (e.g., `RServer.Addin`). The typical execution workflow is as follows:

1.  **Receive Code and Parameters:** The host application provides the engine's `CodeRunner` with the C# script content (as a JSON string of file contents) and a set of parameters (also in JSON).

2.  **Combine and Rewrite:**
    -   The `SemanticCombinator` merges all script files into a single string.
    -   The `CodeRunner` parses this combined script into a Roslyn syntax tree.
    -   The `ParameterRewriter` traverses this tree, finds variable declarations matching the incoming parameter names, and replaces their initial values with the new values.

3.  **Compile and Execute:**
    -   The modified syntax tree is. converted back to a string, and a `using static CoreScript.Engine.Globals.ScriptApi;` directive is prepended.
    -   The engine creates a `CSharpScript` instance, configured with references to the .NET runtime and Revit API assemblies.
    -   An `ExecutionGlobals` object is created, containing the host's `ICoreScriptContext` and the input parameters.
    -   The script is executed asynchronously within a new, collectible `AssemblyLoadContext`. The `ScriptApi` provides static access to the `ExecutionGlobals` instance for that specific run.

4.  **Return Results:**
    -   Any return value from the script is captured.
    -   All messages sent via `Print()` and structured data from `Show()` are collected from the `ICoreScriptContext`.
    -   The `AssemblyLoadContext` is unloaded, and the results are returned to the host application in an `ExecutionResult` object.

## Build and Deployment

`CoreScript.Engine` is a .NET library specifically designed for integration into Autodesk Revit applications. It provides dynamic script processing and execution capabilities tailored for the Revit API. It is not a standalone application.

It is directly referenced by the `RServer.Addin` project. During the build process of `RServer.Addin`, the `dotnet publish` command automatically includes `CoreScript.Engine.dll` and all its necessary dependencies (including Roslyn components) into the `RServer.Addin`'s publish output directory. This ensures that `RServer.Addin` has access to all required assemblies at runtime.

The `RServer-Installer.ps1` script then utilizes these published files from `RServer.Addin` to create the final `RServer_Installer.exe` using Inno Setup, which deploys the add-in to the appropriate Revit Addins folder.
