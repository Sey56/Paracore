# Paracore 4.3.0 (Isolation Release)

## Overview
Version 4.3.0 introduces the **Shim Pattern** — a fundamental architectural change that achieves true assembly isolation for the Paracore Revit Add-in. This permanently eliminates DLL conflicts with pyRevit and all other Revit add-ins, regardless of installation order or dependency versions.

## 🛡️ Add-in Isolation: The Shim Pattern (Architectural)
* **Zero-Conflict Coexistence:** Paracore now loads inside an isolated `AssemblyLoadContext` bubble. All dependencies (Roslyn, gRPC, Protobuf, CodeAnalysis, ImageSharp, etc.) are completely invisible to other add-ins. pyRevit, Dynamo plugins, and any future add-ins can load their own versions of the same DLLs without interference.
* **Paracore.Shim Entry Point:** A new ultra-lightweight DLL (`Paracore.Shim.dll`, ~10KB) with zero NuGet dependencies acts as the Revit entry point. It creates the isolation bubble and loads the real `Paracore.Addin.dll` inside it via reflection. This ensures no conflicting types are ever placed in Revit's shared namespace.
* **Proxy Command Architecture:** Ribbon button clicks are routed through thin proxy commands in the dependency-free shim, which delegate to the real commands inside the isolated context. This preserves full Revit UI integration while maintaining strict isolation boundaries.
* **Framework-Aware Resolution:** The isolated load context intelligently skips `Microsoft.Extensions.*` and `Microsoft.AspNetCore.*` assemblies, allowing them to resolve from the .NET shared framework where the full ASP.NET Core hosting stack lives. All other dependencies (Grpc, Protobuf, CodeAnalysis, etc.) load strictly from the Paracore bundle folder.

## 🔧 Roslyn Scripting Engine Compatibility
* **InteractiveAssemblyLoader Integration:** Both the Script Compiler and REPL Session Manager now register all isolated-context assemblies with Roslyn's `InteractiveAssemblyLoader`. This prevents the scripting engine from loading duplicate copies of `CoreScript.Engine` into its own internal `LoadContext`, eliminating cross-ALC type identity errors.
* **ALC-Aware Binary Execution:** The cached script execution path (`SharedAssemblyLoadContext`) now resolves dependencies from the parent isolated context first, then falls back to the Default context for system assemblies. This ensures the assembly cache works correctly within the isolation bubble.
* **REPL Cross-ALC Fix:** Removed the `globals:` parameter from REPL script execution, which was causing `InvalidCastException` when Roslyn tried to cast `ExecutionGlobals` across ALC boundaries. The execution context is now accessed exclusively through the `ScriptApi` static API, which operates within a single, consistent ALC.

## 🎯 Single Source of Truth Deployment
* **Consistent Behavior Everywhere:** Previous versions could silently succeed on developer machines but fail on user machines because the add-in would "fall back" to locally-installed SDK libraries when bundled DLLs were missing. The Shim Pattern's isolated load context eliminates this entirely — if a DLL is missing from the bundle, it fails identically on every machine, developer or end-user.
* **No More "Works on My Machine":** The isolation bubble loads dependencies exclusively from the Paracore installation folder (`C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore`). It will never silently grab DLLs from a .NET SDK, NuGet cache, or other system paths. This guarantees that what works during development works identically in deployment.
* **Reliable End-User Installation:** Users without a development environment (no Visual Studio, no .NET SDK) now get the exact same experience as developers. The add-in is fully self-contained within its installation folder.

## 📦 Installer Updates
* **Shim Build Step:** The `Paracore-Installer.ps1` now builds the `Paracore.Shim` project and copies the resulting DLL to the publish directory alongside all other Paracore components.
* **Updated .addin Manifest:** The Revit add-in manifest now points to `Paracore.Shim.dll` and `Paracore.Shim.ParacoreShim` as the entry point, ensuring Revit loads the dependency-free shim first.

## ✅ Verified Compatibility
* Revit 2025 startup with Paracore + pyRevit loaded simultaneously
* Server toggle, Dashboard toggle
* Script execution (first-run compilation + cached binary re-runs)
* REPL single-line and multi-line commands
* Sentinels / .ptool / .wtool binary workflows
* No DLL conflicts regardless of add-in load order
