# Paracore v4.0.0 — Achieving Model Quality at the Source

V4.0.0 transforms Paracore into a professional validation factory, shifting from a reactive script runner to an entire ecosystem enabling "Quality-at-the-Source" workflows.

## 🛡️ Sentinels: Enabling Quality Assurance at the Source
Sentinels are the heartbeat of this release, providing the framework to move model validation to the early design stages.
*   **Preventative Monitoring**: Build Watchdogs that identify compliance breaches in real-time, catching errors before they reach external coordination platforms.
*   **Empowering Clean Models**: Paracore provides the complete environment to create, execute, and manage these live validation tools, eliminating large-scale rework and ensuring quality from day one.

## 🧠 Visual Query Builder: Automated Logic Generation
The Visual Query Builder simplifies complex element targeting through automated C# logic generation.
*   **No-Manual-Code Filtering**: Configure professional AND/OR hierarchies through a specialized UI that generates optimized filter logic automatically.
*   **Precision Targeting**: Target elements with surgical precision based on categories, parameters, and types without writing a single line of manual code.

## 🏛️ One Source of Truth: Unified Architecture
We have unified the development and execution environments into a permanent, professional project structure.
*   **Zero-Manual-Management**: Paracore automates the entire C# lifecycle—from initialization to professional scaffolding—transparently at the source.
*   **Integrated Scaffolding**: Editing a script builds a permanent development environment (`csproj`, `sln`) directly within your project tree, ensuring zero synchronization lag.

## ⚡ Performance & Examples
*   **Forge (Binary Distribution)**: Package your logic into sealed `.ptool` (Automation) or `.wtool` (Sentinel) binaries for professional distribution. For Sentinels, Forge compilation supercharges performance—ensuring that live background validation remains ultra-efficient and highly optimized.
*   **Modernized Library**: The [Paracore-Examples](https://github.com/Sey56/Paracore-Examples) repository has been fully upgraded to the V4 Standard, featuring starter templates for building your own custom automations and Sentinels.



---

# Paracore v3.0.2 — The Shift to Hydration

This release marks a fundamental shift in the Paracore engine, moving away from string-based lookups toward a professional, type-safe **Hydration-First** architecture.

## 🏛️ Major Architectural Shift

### 💎 Type-Safe Hydration (The New Standard)
Paracore now speaks the native language of the Revit API. You can define your parameters using real Revit types, and the engine handles the rest automatically using reflection.
- **Direct Object Access**: Use `public Wall MyWall` or `public List<Room> MyRooms` directly in your `Params` class. This eliminates the need for manual `Doc.GetElement()` lookups or casting within your script logic.
- **Reflection-Based Discovery**: The engine uses C# reflection to discover elements. If your property type is a system class like `Level` or `WallType`, the dropdown will automatically populate without additional attributes.
- **⚠️ Breaking Change**: Legacy string-based element extraction (where `[RevitElements]` was used on `string` properties) is replaced by Type-Safe Hydration. While the `[RevitElements]` attribute is still required for loadable components (e.g., `Doors`) to specify the target category, the parameter must now be defined as a Revit class (e.g., `FamilyInstance`) rather than a string.

### ⚡ Reactive Custom Filtering
The "Compute" action logic is now **Reactive**. Your `_Options` providers now have access to the current state of other UI parameters.
- **Context-Aware Dropdowns**: Dynamically filter element lists in real-time based on the state of other parameters (like sliders or toggles).
- **Unit-Aware Hardening**: Parameters passed to `_Options` providers are automatically converted to Revit Internal Units, ensuring consistency with the main script execution.

## 🎨 UI & UX Improvements

### 🪄 Stateless Compute Action
- **Stale Value Prevention**: Clicking "Compute" now clears previous selections and reverts parameters to their defaults. This ensures a clean slate when switching between different Revit documents, preventing reference errors.
- **Document Context Awareness**: A new safety mechanism detects if your active computed parameters belong to a different project than the active document, prompting a refresh via an amber warning UI.

### 🏷️ Professional Identity Formatting
- **Smart Labels**: Element identities in dropdowns are now context-aware. Instance elements (Walls, Rooms) automatically include their **[ID]** to ensure uniqueness, while unique types (Levels, Materials) are displayed cleanly by name.
- **Sheet Standards**: ViewSheets now follow the `[Number] Name` format.

## 🛠️ Engine Hardening
- **Global Synchronization**: Aligned all execution paths (IntelliSense, Main Engine, and Options Executor) to use the same stabilized list of 20+ namespaces and libraries.
- **Code Leak Prevention**: Hardened the parameter extractor to prevent internal C# logic from appearing in user-facing UI labels.

---

## 💬 Feedback
Got questions or found a bug? You can reach us here:

*   **YouTube**: [Paras Codarch Channel](https://www.youtube.com/@Codarch46)
*   **Email**: `codarch46@gmail.com`
*   **GitHub**: [Project Repository](https://github.com/Sey56/paracore)

# Paracore v3.0.0 — The "Professional Automation" Update
Paracore v3.0.0 introduced the C# Core Engine and the foundation of the modern React frontend, establishing the gRPC communication layer between the local server and Revit.
