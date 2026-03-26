# Paracore 4.2.1 (Patch Release)

## Overview
This patch focuses on strictly enforcing the `.NET 8` assembly boundary to eliminate cross-plugin runtime collisions in Revit 2025, while finalizing the Agent V4 "Pure Chained" REPL architecture based on user feedback.

## Key Fixes & Improvements

### Component Resiliency (DLL Hell Fix)
* **.NET 8 SDK Pinning:** The `global.json` and all workspace generators (VS Code Extension & Python Server) have been strictly locked to the `.NET 8.0.x` feature band. This prevents `.NET 9` SDKs from silently upgrading assemblies during installation.
* **Addin Assembly Collision:** Downgraded `Microsoft.Extensions.DependencyInjection` references in both `RServer.Addin` and `CoreScript.Engine` back to `v8.0.1`. This perfectly aligns with Revit 2025's native `.NET 8` AppDomain, completely resolving the exact `Version=8.0.0.0` missing assembly crash experienced by users with existing 3rd-party addins.

### "Pure Chained" API Finalization
* Standardized all data extraction extensions into uniform Nouns by removing legacy `Get` prefixes:
  * `GetFamilyName()` -> `FamilyName()`
  * `GetNativeProperties()` -> `ReflectionProperties()`
* Completely eradicated legacy global diagnostic wrappers (e.g. `Peek(el)`, `ListParams(el)`) from the entire API interface and help manuals.
* Clarified IntelliSense and XML hover tooltips for `.Matches()` and `.WhereMatches()` to explicitly define their fuzzy substring behavior against Type Names and Family Names.

### Documentation & Guides
* **Cheat Sheets Synchronized:** Updated `PARACORE_CHEATSHEET.md`, `PARACORE_CHEATSHEET.html`, and `DATA_ACCESSORS_CHEAT_SHEET.md` matrices to exclusively showcase pure fluent syntax (`.Peek()`, `.Delete()`, `.Table()`).
* **Ultimate Stress Tests:** Overhauled `REPL_Ultimate_Stress_Tests.md` and `.html` to reflect the new API structures and verified queries against the latest engine logic.
* **Help Submodule Synchronization:** Restored fundamental references, synced step-by-step videos, and updated global visual helpers across the `paracore-help` Docusaurus repository.
