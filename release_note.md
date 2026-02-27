# Paracore v4.0.0 — The "Source of Truth" Update

V4.0.0 marks a major evolution in Paracore, moving from a temporary workspace model to a professional, permanent, and unified architecture.

## 🏛️ One Source of Truth: Automated Workflow
We have eliminated the complexity of manual script organization and file synchronization.
*   **Zero-Manual-Management**: You no longer need to worry about complex folder structures. Just provide an empty folder as a "Script Source," and Paracore handles everything—initialization, scaffolding, and organization—automatically and transparently.
*   **In-Place Scaffolding**: Clicking "Edit Script" now generates a full C# development environment (`csproj`, `sln`, `Globals`) directly within your script's folder. There are no temporary files; your development environment and your execution target are the same.
*   **Unified Script Concept**: We've simplified authorship. Every automation is simply a **Script**. Whether it's a single file or a modular project with multiple files in a `Scripts/` folder, Paracore manages it with the same robust logic.
*   **Immediate Execution**: Since there is now a single source of truth for your code, changes made in VS Code are immediately available for execution in Revit—no background sync or file-watchers required.

## 🌊 Major New Features
*   **Visual Query Builder**: A professional logic engine for filtering Revit elements using complex AND/OR hierarchies without writing any code.
*   **Sentinels (Watchdogs)**: Professional background monitoring with a dedicated Control Window and real-time Revit reporting.
*   **Forge (Binary Compilation)**: Package your logic into sealed `.ptool` (Tools) or `.wtool` (Sentinels). For Sentinels, compilation ensures background monitoring is **extremely fast and ultra-efficient**, optimized for intensive data gathering tasks.

## 💡 Pro Tip: Explore the Gold Standard
The best way to see the V4 architecture in action is to download the [Paracore-Examples](https://github.com/Sey56/Paracore-Examples) repository. Simply load the folder into Paracore to explore dozens of production-ready automations instantly.

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
