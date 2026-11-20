# Paracore.Addin - Revit gRPC Server Add-in

`Paracore.Addin` is the critical bridge that enables external applications to execute C# logic directly inside the Revit process.

## Core Features

- **Shared Sidecar**: Installs and starts `Paracore.Server.exe`, the single gRPC endpoint on `localhost:50051`, alongside the add-in. The desktop app adopts this same process; toggling Revit OFF only closes Revit's subscription, never the process.
- **Thread-Safe Execution**: Marshals all script requests onto Revit's main UI thread using `ExternalEvent` handlers.
- **Dynamic Compilation**: Hosts the **CoreScript Engine** to compile and execute C# top-level statements without requiring Revit restarts.

## Build and Install

The add-in is part of a larger ecosystem and is built using a centralized PowerShell script from the root of the repository.

1. **Build**:
   From the repository root, run:
   ```powershell
   ./build-addin.ps1
   ```
   This script builds both the add-in and the engine, then packages the installer with Inno Setup.

2. **Install**:
   An installer (`installers/Paracore_Addin_v<version>.exe`) will be generated. Run it to deploy the add-in to Revit.

3. **Activate**:
   In Revit, go to the **Paracore** tab and click the **Paracore Server** icon to toggle it to the "**On**" state. This connects Revit to the shared sidecar and writes a `revit.json` lease. Clicking it "Off" removes that lease and disconnects Revit only — the desktop app keeps its connection.

---

*Making Revit automation accessible to the AEC industry.*