# Paracore 4.3.0 (The Isolation Release)

Version 4.3.0 is a monumental architectural shift and overhaul for the better! We have completely solved the two biggest deployment and compatibility struggles our users faced.

## 1. Zero-Prerequisite Deployment (Paracore.Server Sidecar)
Previously, the add-in might work perfectly on a developer's machine but show "missing DLLs" and fail on an end-user's computer. We have eliminated this problem permanently. By introducing the **Paracore.Server sidecar** directly into the add-in bundle, the Paracore add-in is now exactly the same in both dev and user environments. It installs and works instantly without requiring users to install manual SDKs or runtimes.

## 2. Absolute Add-in Isolation (Paracore.Shim)
Previously, installing both Paracore and pyRevit in the same Revit environment would result in severe `Microsoft.CodeAnalysis` DLL version conflicts, leading to initialization and script execution failures regardless of add-in load order. We have permanently resolved this architectural vulnerability by implementing the **Paracore.Shim** pattern. 

The new lightweight shim acts as the sole Revit entry point, dynamically bootstrapping the core Paracore engine into a dedicated, isolated `AssemblyLoadContext` (ALC). This strict memory boundary entirely encapsulates our internal dependencies (such as Roslyn, gRPC, and Protobuf), preventing them from leaking into or colliding with Revit's default AppDomain. As a result, Paracore will no longer conflict with any other installed add-in, achieving total coexistence with complex third-party extensions like pyRevit.
