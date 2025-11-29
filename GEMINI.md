# RAP Ecosystem: Core Architectural Pillars

> **CRITICAL CONTEXT FOR AI AGENTS**: Read this before proposing changes to Script Discovery or Execution.

## 1. The "Script Source" Concept
The fundamental unit of organization is the **Script Source**.
- **Definition**: A folder that contains *executable scripts*.
- **Location**: It corresponds strictly to the **Sub-Category** level in the folder structure.
- **Contents**:
    - `MyScript.cs` (Single-File Script)
    - `MyComplexScript/` (Multi-File Script folder containing `.cs` files)
- **Rule**: We **NEVER** scan recursively inside a Script Source. The Engine handles the contents (single or multi-file) automatically.

## 2. The Folder Hierarchy (Strict)
The structure is fixed and has specific "Levels":
1.  **Library Root** (`agent-scripts/`)
    - *Role*: Container for Categories.
    - *Contains*: Category Folders (`01_Element_Creation`, `02_Geometry_Modeling`).
2.  **Category** (`01_Element_Creation/`)
    - *Role*: Organizational grouping.
    - *Contains*: **Script Sources** (`Walls`, `Floors`).
3.  **Sub-Category / Script Source** (`Walls/`)
    - *Role*: The actual location of scripts.
    - *Contains*: `.cs` files and Multi-File Script folders.

## 3. Smart Script Discovery (Flexible Entry Points)
The Agent and Backend use a **Targeted Search** approach, NOT a blind recursive scan.

### Agent Logic (Intent Matrix)
The Agent maps user intent to specific paths:
- *"Modify Wall Parameters"* -> `MODIFY` + `WALLS`
- **Search Paths**: `["07_Modification_Editing", "01_Element_Creation/Walls"]`

### Backend Logic (Flexible Entry)
The Backend (`CoreScriptRunnerService`) analyzes the input path depth:
- **Input: Category** (`01_Element_Creation`) -> Scans all its **Script Sources** (Walls, Floors...).
- **Input: Script Source** (`01_Element_Creation/Walls`) -> Scans it **directly**.
- **Input: Root** -> Scans **everything**.

## 4. Engine Execution
- The Engine accepts a **List of JSON-serialized ScriptFiles**.
- It uses `SemanticCombinator` to intelligently merge files based on the **Top-Level Statement** file and its references.
- It does *not* care about the file structure on disk, only the provided list.

## 5. Script Design Philosophy
- **Modification**: Use **"Super-Tools"** (e.g., `Modify_Wall.cs` with optional parameters) instead of micro-scripts.
- **Filtering**: Use **"Generic Utilities"** (e.g., `Filter_Elements.cs` accepting a list of Categories).
