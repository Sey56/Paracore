# About Paracore & The Revit Automation Platform (RAP) 🤖⚙️

The Revit Automation Platform (RAP) is an ecosystem ✨ that supercharges how AEC professionals automate tasks in Autodesk Revit. While traditional add-in development can be slow and cumbersome, RAP introduces a dynamic, interactive scripting environment that provides immediate feedback.

This doesn't just replace the old way of working; it augments it. For developers 👩‍💻, RAP is a powerful prototyping tool. The ability to write and test C# code that executes instantly in Revit with the click of a button ▶️ makes the development of complex add-ins faster and more predictable. For the entire team 🤝, it unlocks the power of the full Revit API in an accessible, script-based workflow.

The ecosystem provides multiple ways to interact with Revit, catering to different users and workflows:
- **Paracore** (`rap-web`): 🖥️ A feature-rich desktop application for end-users and script managers.
- **CoreScript for VSCode** (`corescript-vscode`): 💻 A lightweight extension for developers who want to write and execute scripts directly from their code editor.
- **The Paracore Agent**: 🤖 A conversational AI, integrated into Paracore, that uses natural language to drive automation.

At its core, the platform allows C# scripts to be executed directly in Revit from outside applications, offering unparalleled flexibility and speed 🚀.

## The RAP Ecosystem Components 🧩

The platform is comprised of several key components working in concert:

*   **`Paracore`** (`rap-web`): 🖥️ The primary user-facing desktop application. Built with React and Tauri, it provides a polished UI to browse, manage, and execute a library of automation scripts. Users can edit script parameters, save presets, use Git for collaboration, and view rich, structured output from their scripts.

*   **`CoreScript for VSCode`** (`corescript-vscode`): 💻 A VSCode extension that allows developers to execute C# scripts in Revit directly from the editor with a simple command (`Ctrl+Shift+R`). It offers a lightweight, code-focused workflow with full IntelliSense, making it ideal for rapid prototyping and testing of automation logic.

*   **`rap-server`**: 🌐 A local backend server that acts as the central orchestrator. It communicates with both the Paracore frontend and the Revit add-in, handling file system access, workspace management, and agent logic.

*   **`RServer.Addin`**: 🔌 A crucial add-in that runs inside Revit. It hosts a secure gRPC server, exposing the Revit API to the entire RAP ecosystem. It is the single point of execution, receiving commands from both Paracore and the VSCode extension and ensuring they are run safely in Revit's main UI thread.

*   **`CoreScript.Engine`**: 🧠 The powerful heart of the system. This .NET library, used by `RServer.Addin`, dynamically compiles and executes C# scripts at runtime using the Roslyn compiler. It intelligently injects parameters and provides a sandboxed environment for each script run.

## What Makes the RAP Ecosystem Unique? ✨

1.  **Multiple Workflows, One Engine:** 🔄 Whether using the rich UI of Paracore or the directness of the VSCode extension, all scripts are executed by the same robust `CoreScript.Engine` via the same `RServer.Addin`. This guarantees that a script written and tested in VSCode will work identically in Paracore, ensuring 100% compatibility.

2.  **Live C# Scripting with Full IntelliSense:** ⚡ The most significant innovation is the ability to write and edit C# scripts in a modern IDE with full, rich IntelliSense for the Revit API, and execute them instantly in Revit without any recompilation or manual deployment.

3.  **Separation of Logic and Execution:** 🎯 Developers can create powerful scripts, and non-programmers can easily execute them through Paracore without ever seeing the code. The `ScriptInspector` in Paracore automatically generates a user-friendly form for all script parameters, democratizing automation.

4.  **Rich, Structured Data Output:** 📊 Unlike simple console logging, RAP allows scripts to return complex data structures. Paracore renders tables in a dedicated "Table" tab, providing a clean, organized view of the data that can be exported to CSV for further analysis. This provides far more insight than plain text.

## The Paracore Agent: A Smarter Way to Automate 🤖💬

Building on this powerful foundation, Paracore includes the **Paracore Agent**—a conversational AI that streamlines the path to automation. The agent's strength lies in understanding a user's *intent* and finding the right tool for the job.

The workflow is simple and powerful:

1.  **State Your Goal:** 🤔 The user tells the agent *what* they want to do, not necessarily *how*. Instead of a long, complex prompt, they can simply say:
    > "I need to create a wall."
    or
    > "Show me how to modify wall heights."

2.  **The Agent Finds the Script:** 🔎 The agent searches the entire script library and selects the most appropriate one for the task (e.g., `Create_Wall.cs`).

3.  **The User Configures the Details:** 🔧 The agent then presents this script in Paracore's **Script Inspector**. This is where the real power lies. The user can now navigate to the "Parameters" tab and use a structured UI to configure dozens of complex parameters—like `Level`, `Height`, `Length`, `Wall Type`, `Top Constraint`, and more—far more easily and robustly than typing them into a chat prompt.

4.  **Execute with Confidence:** ✅ Once the parameters are set in the UI, the user tells the agent to proceed with a command like "run it." The agent then syncs the latest parameters from the UI, applies any final overrides from the chat (e.g., "...but change the level name to Level 2"), and presents a final confirmation showing all parameters before execution. This ensures the user has ultimate control and clarity.

This unique human-in-the-loop approach combines the simplicity of natural language for action identification with the power and precision of a graphical UI for detailed parameter control, making even the most complex automations accessible and manageable.
