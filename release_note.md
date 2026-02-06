# Paracore v3.0.2 — The "Type-Safe First" Milestone

This release marks a fundamental evolution in the Paracore engine, moving away from "fuzzy" string-based extraction toward a professional, type-safe **Hydration-First** architecture.

## 🏛️ Major Architectural Shift

### 💎 Type-Safe Hydration (The New Standard)
Paracore now speaks the native language of the Revit API. You can now define your parameters using real Revit types, and the engine handles the rest automatically.
- **Direct Object Access**: Use `public Wall MyWall` or `public List<Room> MyRooms` directly in your `Params` class. No more manual `Doc.GetElement()` lookups or casting.
- **Zero-Boilerplate Discovery**: The engine uses C# reflection to discover elements. If your type is `Level`, the dropdown will automatically populate with levels.
- **Breaking Change**: Legacy string-based element extraction via `[RevitElements]` attributes has been removed in favor of this literal, robust system.

### ⚡ Reactive Custom Filtering
The "Compute" button is now **Reactive**. Your `_Options` and `_Filter` providers now have access to the current state of other UI parameters.
- **Context-Aware Dropdowns**: Changing a threshold slider can now dynamically filter the elements in a different dropdown in real-time.
- **Unit-Aware Hardening**: Parameters passed to `_Options` providers are automatically converted to Revit Internal Units (sqft, feet, etc.), matching the behavior of the main script.

## 🎨 UI & UX Refinements

### 🪄 Stateless Compute Action
- **Stale Value Prevention**: Clicking the "Compute" button now automatically clears any cached selection and reverts the parameter to its script default. This ensures a clean slate when switching between different Revit documents.

### 🏷️ Professional Identity Formatting
- **Smart Labels**: Element identities in dropdowns are now context-aware. 
    - **Unique Elements** (Levels, Materials, Sheets) are displayed cleanly by name.
    - **Instance Elements** (Walls, Rooms, etc.) automatically include their **[ID]** to ensure uniqueness and precise selection.
- **Sheet Standards**: ViewSheets now follow the professional `[Number] Name` format.

## 🛠️ Engine Hardening
- **JSON Precision**: Added custom `ElementId` converters to ensure IDs are serialized as clean numbers in Tables and Charts, restoring interactive "Select in Revit" functionality.
- **Global Synchronization**: Aligned all execution paths (IntelliSense, Main Engine, and Options Executor) to use the exact same master list of 25+ namespaces and libraries.
- **Code Leak Prevention**: Hardened the parameter extractor to prevent raw C# source code from appearing in UI labels.

---
**Status: Production Ready. v3.0.2-gold** 🏮🏛️🚀

# Paracore v3.0.0 — The "Professional Automation" Update
...
