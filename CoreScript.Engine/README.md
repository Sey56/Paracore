# CoreScript.Engine - Dynamic C# Script Execution Engine

`CoreScript.Engine` is a powerful C# library designed for the dynamic compilation and execution of C# scripts at runtime. It is the core of the Revit Automation Platform (RAP), leveraging the Roslyn compiler to provide a secure, flexible, and robust environment for running user-defined code within a host application like Revit.

## Core Features

-   **Dynamic C# Compilation:** Compiles and executes C# code from strings on-the-fly using the `Microsoft.CodeAnalysis.CSharp.Scripting` API (Roslyn).

-   **Parameter Injection via Syntax Tree Rewriting:** Instead of passing variables, the engine directly injects parameters into the script's source code before compilation. It parses the C# code into a Roslyn syntax tree and uses a custom `CSharpSyntaxRewriter` to replace placeholder variable initializers with the provided parameter values. This allows for powerful, type-safe modifications at runtime.

-   **Sandboxed and Isolated Execution:** Each script is executed within its own collectible `AssemblyLoadContext`. This ensures that script assemblies are isolated from the host application and can be unloaded immediately after execution, preventing memory leaks and assembly conflicts.

-   **Rich and Static Execution Context:** Scripts are executed with a set of "global" functions and properties to interact with the host. This is achieved by creating an `ExecutionGlobals` instance for each run and injecting a `using static CoreScript.Engine.Globals.ScriptApi;` directive into the script. This provides a clean, static API, including:
    -   **Revit API Access:** `UIApp`, `UIDoc`, `Doc`
    -   **Input Parameters:** A `Parameters` dictionary containing the user-provided inputs.
    -   **Logging:** `Print(string message)`
    -   **Transactions:** `Transact(string name, Action<Document> action)`
    -   **Structured Output:** `Show(string type, object data)` for returning complex data (like tables or objects) to the host in a serialized JSON format.

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
    -   The modified syntax tree is converted back to a string, and a `using static CoreScript.Engine.Globals.ScriptApi;` directive is prepended.
    -   The engine creates a `CSharpScript` instance, configured with references to the .NET runtime and Revit API assemblies.
    -   An `ExecutionGlobals` object is created, containing the host's `IRScriptContext` and the input parameters.
    -   The script is executed asynchronously within a new, collectible `AssemblyLoadContext`. The `ScriptApi` provides static access to the `ExecutionGlobals` instance for that specific run.

4.  **Return Results:**
    -   Any return value from the script is captured.
    -   All messages sent via `Print()` and structured data from `Show()` are collected from the `IRScriptContext`.
    -   The `AssemblyLoadContext` is unloaded, and the results are returned to the host application in an `ExecutionResult` object.

## Build and Deployment

This project is not a standalone application. It is intended to be integrated into a .NET application that requires C# scripting capabilities. The `.csproj` file includes a custom `CopyToLibFolder` build target. This target copies the `CoreScript.Engine.dll` and all of its Roslyn dependencies into a shared `lib` folder in the parent directory. This ensures that any host application referencing the engine has access to all the necessary assemblies at runtime.

## Usage

The host application must implement the `IRScriptContext` interface to provide the necessary context (like Revit API objects and logging callbacks) for the engine to function. The `CodeRunner.Execute` method is the main entry point for running a script.
