# 🧪 Visual Query Builder Stress Tests

This document tracks the ultimate stress tests for the Visual Query Builder (VQB) to ensure the stability of the V4.1.0 release.

## 1. Nested Logic (Logical Integrity)
*   **Target Category**: Walls
*   **Top Level**: `AND`
    *   **Rule**: `Unconnected Height` > `3000`
    *   **Subgroup (OR)**:
        *   **Rule**: `Comments` == `Fire`
        *   **Rule**: `Comments` == `External`
*   **Goal**: Verify that hierarchical nesting generates correct `LogicalAndFilter` and `LogicalOrFilter` combinations.

## 2. Mixed Scope (Type vs. Instance)
*   **Target Category**: Doors
*   **Filter 1 (Instance)**: `Mark` starts with `D`
*   **Filter 2 (Type)**: `Fire Rating` == `60 Min`
*   **Goal**: Ensure the generator correctly switches between instance parameters and type parameters (using `el.GetTypeId()`).

## 3. Broad Loadable Filtering (Family Selection)
*   **Target Category**: Windows or Furniture
*   **Filter**: `Family` == `[Pick a Family Name]`
*   **Goal**: Confirm that `SYMBOL_FAMILY_NAME_PARAM` string-based filtering works for all loadable categories.

## 4. Numerical Precision (The 6.00 Fix)
*   **Target Category**: Walls or Floors
*   **Filter**: `Unconnected Height` (or Thickness) == `6.00`
*   **Goal**: Ensure `.00` decimals aren't stripped in the UI or the C# source.

## 5. Non-Geometric Elements (Spatial & API Special cases)
*   **Test A (Rooms)**: Filter Rooms by `Area` > `10`
*   **Test B (Sheets)**: Filter Sheets by `Sheet Number` contains `A`
*   **Goal**: Verify `SpatialElement` and `ViewSheet` specific collectors work correctly.

## 6. Iterative Replacement (File Integrity)
*   **Action**: Create a script, run it, modify rules, and click **"Replace Script"** 5 times rapidly.
*   **Goal**: Ensure no file-locking errors occur between Paracore and VS Code.

## 7. Empty Set Resilience
*   **Action**: Filter for a string that doesn't exist (e.g., `Comments` == `ZXYZXY`).
*   **Goal**: Verify the UI handles "0 Results" gracefully without hanging or crashing.
