# Ultimate Stress Test for Paracore AI

**Prompt:**
Create a script that performs a comprehensive 'Door & Wall Data Exchange' utility.

### 1. Input Parameters (The Params Class):
* **TargetLevel**: The `Level` to audit (Mandatory).
* **ReferencePoint**: A point picked from the Revit viewport using the `[Select(SelectionType.Point)]` attribute.
* **TargetWallTypes**: A `List<WallType>` (Multi-select) to filter the walls.
* **MinThickness**: A threshold in **mm** (`[Unit("mm")]`)—only process walls thicker than this.
* **AuditMode**: A `[Segmented]` string control with options: "Geometry Only", "Data Sync", or "Full Report". (Use a `_Options` provider).
* **CsvInput**: An `[InputFile("csv")]` parameter to read mapping data.
* **ReportOutput**: An `[OutputFile("csv")]` parameter to save the results.
* **BrandColor**: A `[Color]` picker for the UI.
* **ExecuteUpdate**: A `[Confirm("RUN DATA SYNC")]` toggle required to enable the modification logic.

### 2. Audit & Sync Logic:
* **Filtering**: Collect all **Walls** on the `TargetLevel` that match the `TargetWallTypes` and exceed the `MinThickness`.
* **Spatial Check**: For every **Door** hosted in those walls, calculate its distance to the `ReferencePoint`.
* **Data Integration**: 
    * Read the `CsvInput` file. It contains lines formatted as `Mark,NewComment`. 
    * If a Door's `Mark` matches a row in the CSV, prepare to update its `Comments` parameter.
* **Transaction**: If `ExecuteUpdate` is true, wrap the parameter updates in a single `Transact("Sync Door Data", ...)` block.

### 3. Visualization & Output:
* **Console**: Log the number of walls processed, total doors found, and successful CSV matches.
* **Table Tab**: Render a table with columns: `Door ID`, `Mark`, `Host Wall Type`, and `Distance to Reference`.
* **Summary Tab**: 
    * Display a **PieChart** of the distribution of Door Family names.
    * Display a **BarChart** of Wall lengths (grouped by Wall Type).
* **File I/O**: Write a single summary line to the `ReportOutput` file containing the Level Name and the total doors processed.

### STRICT PARACORE RULES:
- Follow the **Top-Level order** (Usings -> Logic -> Helpers -> Params Class Last).
- Use **`ElementId.Value`** (long) for all ID reporting.
- **NO `async/await`**.
- Strictly adhere to **Unit Reality**: comparing mm inputs to internal Feet requires the engine's auto-hydration.
- Do not create any auxiliary files; write everything in the provided file.
