# Paracore.Addin - Revit gRPC Server Add-in

`Paracore.Addin` is the critical bridge that enables external applications to execute C# logic directly inside the Revit process.

## Core Features

- **Paracore Server (gRPC)**: Hosts a high-performance server inside Revit, enabling real-time communication with the Paracore Desktop App and VS Code.
- **Thread-Safe Execution**: Marshals all script requests onto Revit's main UI thread using `ExternalEvent` handlers.
- **Dynamic Compilation**: Hosts the **CoreScript Engine** to compile and execute C# top-level statements without requiring Revit restarts.

## Build and Install

The add-in is part of a larger ecosystem and is built using a centralized PowerShell script from the root of the repository.

1. **Build**:
   From the repository root, run:
   ```powershell
   ./Paracore-Installer.ps1
   ```
   This script builds both the add-in and the engine.

2. **Install**:
   An installer (`Paracore_Addin.exe`) will be generated in the `installers` folder. Run it to deploy the add-in to Revit.

3. **Activate**:
   In Revit, go to the **Paracore** tab and click the **Paracore Server** icon to toggle it to the "**On**" state.

---

*Making Revit automation accessible to the AEC industry.*