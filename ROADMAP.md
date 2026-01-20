# Paracore Development Roadmap
*A prioritized list of "Simple but Powerful" features to implement.*

> [!IMPORTANT]
> **Guiding Principle:** "Never repeat a feature that Revit can already do."  
> Paracore exists to automate the *impossible* or the *tedious*, not to reinvent native buttons.

## High Priority (Immediate Next Steps)
1.  **Automation Playlists (Script Chaining) [Status: Refining]**
    *   **Concept:** Create a named "Playlist" that executes a sequence of scripts in order (e.g., Audit -> Purge -> Save).
    *   **Status:** Core feature and UI implemented. Pending final polish and "Batch Processor" integration.

2.  **Batch Processor (Multi-File Execution) [Status: NEXT]**
    *   **Concept:** Select a script (or Playlist) + a folder of files. Paracore processes each file automatically.
    *   **Why:** #1 automation request across the industry.
    *   **Dependency:** Requires `CoreScript.Engine` to handle "headless" file opening/closing logic safer.

3.  **Expanded Annotation Type Support (v2.2.0)**
    *   **Concept:** Expand Strategy 1 hardcoded shortcuts to cover all major annotation types (Tags, SpotDimensions, etc.).
    *   **Why:** Revit's category-based type discovery (`WhereElementIsElementType`) often fails for annotations.

4.  **Data Snapshots & Diffing**
    *   **Concept:** "Save Snapshot" of a Table result. Later, "Compare with Snapshot" to see what changed.
    *   **Why:** Adds historical intelligence to scripts (e.g., tracking warning counts or area changes).

5.  **Interactive Dialogs (Human-in-the-Loop)**
    *   *Concept:* `Input.Ask("Question?", ["Yes", "No"])` mid-script.
    *   *Why:* Allows conditional execution (e.g., "Delete 500 walls?").

6.  **Dashboard Widgets**
    *   **Concept:** Pin script outputs (Charts/Values) to a main Dashboard tab.
    *   **Why:** Provides instant project health visibility.

## Future Horizons (Research & Trends)
*Capabilities identified from top-rated industry tools (pyRevit, Ideate, DiRoots).*

7.  **Model Health Dashboard**
    *   **Concept:** Dedicated tab for standard metrics: Warnings, CAD imports, File Size.
    *   **Paracore Edge:** Background "Health Check" script running on startup.

8.  **Two-Way Excel/Data Sync**
    *   **Concept:** Export Table -> Edit in Excel -> Re-import to update Parameters.
    *   **Why:** Leveraging Excel for bulk data entry is a user favorite.

9.  **Smart Documentation Tools**
    *   **Concept:** Automated Sheet Creation, View Placement, Renumbering.
    *   **Fit:** Ideal use case for "Automation Playlists".

10. **Family Content Manager**
    *   **Concept:** Visual browser with thumbnails for company .rfa library.
    *   **Why:** Modern replacement for Revit's "Load Family".
