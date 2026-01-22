# 🎓 Architectural Automation Learning Path

This section outlines a progressive series of scripts designed for learning C# and the Revit API within Paracore. These scripts build from simple data queries to advanced document orchestration.

## Series 1: Data Auditing (The "Search & Report" Basics)
Focus: Finding elements, reading parameters, and display data.

### [SIMPLE] Room Name Auditor
*   **Goal**: List all room names and numbers on a specific level.
*   **Learning**: `FilteredElementCollector`, Level filtering, and the `Table()` output.
*   **Utility**: Quickly verify room naming consistency across a floor.

### [MEDIUM] Parameter Health Check
*   **Goal**: Find all elements in a category (e.g., Walls) that have empty "Comments" or "Mark" parameters.
*   **Learning**: Checking parameter existence, null/empty string handling, and conditional `Table` styling.
*   **Utility**: Quality control before sheet issuance.

### [ADVANCED] Document Dashboard
*   **Goal**: A summary of all Wall types in the project, their total counts, and total lengths/areas.
*   **Learning**: Grouping data (LINQ), unit conversion (`UnitUtils`), and `ChartPie()` visualization.
*   **Utility**: Instant takeoff summary for the whole project.

## Series 2: Intelligent Modification (The "Edit" Basics)
Focus: Modifying existing elements and using Transactions.

### [SIMPLE] Uppercase Standardizer
*   **Goal**: Convert all Room or Sheet names to UPPERCASE.
*   **Learning**: Using `Transact()`, string manipulation (`.ToUpper()`).
*   **Utility**: Fixing inconsistent drafting styles instantly.

### [MEDIUM] Sequential Sheet Renumbering
*   **Goal**: Renumber a selection of sheets based on a user-provided prefix and start index.
*   **Learning**: Sorting collections, string formatting, and batch parameter updates.
*   **Utility**: Massive time saver during project setup or phase changes.

### [ADVANCED] Type Name Formatter
*   **Goal**: Automatically rename all Wall Types based on their actual thickness (e.g., "Wall - 200mm").
*   **Learning**: Reading internal type parameters, calculating names, and renaming `ElementType` objects.
*   **Utility**: Ensures project standards are met without manual typing.

---

# 🚀 Advanced Automation Scripts Brainstorm (General)

Here are 20+ demanding and useful automation ideas for Revit using Paracore's top-level statements platform:

## STRUCTURAL & ENGINEERING

### Steel Connection Plate Generator
*   **Input:** Select beams/columns + plate thickness/grade
*   **Features:**
    *   Creates parametric steel plates with boltholes at intersections
    *   Includes hole patterns based on AISC standards

### Automatic Rebar Detailing
*   **Action:** Select concrete elements → generate 3D rebar with bending schedules
*   **Configurable:** Bar size, spacing, cover distance
*   **Output:** Export bending schedules to CSV

### Load Transfer Visualization
*   **Action:** Trace load paths from roof to foundation
*   **Visuals:** Color-code elements by load intensity
*   **Output:** Generate load summary tables

### Seismic Brace Layout Automation
*   **Action:** Auto-place bracing in bays based on gridlines
*   **Calculations:** Calculate brace angles and connection points
*   **Output:** Generate shop drawings with annotations

## ARCHITECTURAL & COORDINATION

### Room Data Sheet Generator
*   **Action:** Extract all room data → create formatted PDF/Excel reports
*   **Include:** Area, finishes, FF&E, MEP fixtures
*   **Integration:** Auto-populate from linked models

### Clash Detection & Resolution
*   **Action:** Find MEP/Structural clashes in specific zones
*   **Resolution:** Propose automatic solutions (offset ducts, move pipes)
*   **Output:** Generate clash reports with screenshots

### Facade Panel Rationalization
*   **Action:** Analyze curtain wall → minimize panel types
*   **Optimization:** Optimize glass/mullion sizes for manufacturing
*   **Output:** Generate panel schedule with unique IDs

### Stair & Railing Compliance Check
*   **Action:** Verify IBC/ADA compliance automatically
*   **Check:** Riser height, tread depth, handrail height
*   **Output:** Flag violations with 3D markers

## MEP & SYSTEMS

### Duct/Pipe Sizing Calculator
*   **Input:** CFM/GPM → calculate optimal duct/pipe sizes
*   **Action:** Auto-resize existing systems with minimal changes
*   **Optimization:** Balance pressures across branches

### Lighting Analysis & Layout
*   **Calculations:** Calculate foot-candles based on fixture photometrics
*   **Action:** Auto-place fixtures to meet lighting requirements
*   **Output:** Generate lighting schedule with wattage/sqft

### Fire Protection System Layout
*   **Action:** Auto-place sprinkler heads based on hazard classification
*   **Calculations:** Calculate pipe sizes per NFPA 13
*   **Output:** Generate hydraulic calculation reports

### Electrical Circuit Balancing
*   **Action:** Balance loads across phases automatically
*   **Optimization:** Optimize circuit assignments
*   **Monitoring:** Flag overloaded panels

## DOCUMENTATION & QA/QC

### View & Sheet Automator
*   **Action:** Batch create views for all room/area types
*   **Placement:** Auto-place on sheets with title blocks
*   **Management:** Generate consistent view templates

### Parameter Data Synchronizer
*   **Action:** Sync parameters across linked models (Arch→Struct→MEP)
*   **Validation:** Validate data consistency
*   **Output:** Report discrepancies

### Automatic Dimensioning
*   **Action:** Smart dimension placement for construction documents
*   **Configurable:** Dimension strings, witness lines
*   **Optimization:** Avoid overlapping annotations

### Model Health Check
*   **Audit:** Find duplicate elements, incorrect phasing, over-constrained joins
*   **Action:** Fix common issues automatically
*   **Output:** Generate health report

## ANALYSIS & OPTIMIZATION

### Solar Analysis & Shading Device Generator
*   **Calculations:** Calculate solar exposure per facade
*   **Action:** Generate optimal shading device designs
*   **Outcome:** Calculate energy savings

### Material Takeoff & Costing
*   **Action:** Real-time cost calculation with live pricing API
*   **Analysis:** Compare material alternatives
*   **Output:** Generate cost variance reports

### Circulation & Egress Analysis
*   **Simulation:** Simulate occupant movement
*   **Validation:** Check egress path compliance
*   **Optimization:** Identify bottlenecks

### Carbon Footprint Calculator
*   **Calculations:** Calculate embodied carbon by material
*   **Analysis:** Compare design alternatives
*   **Output:** Generate sustainability reports

## FABRICATION & DIGITAL TWIN

### CNC/Pre-fab Drawing Generator
*   **Extraction:** Extract fabrication data from Revit elements
*   **Output:** Generate DXF files for CNC machines
*   **Detailing:** Add shop annotations automatically

### Point Cloud to Model
*   **Action:** Convert point cloud data to Revit elements
*   **Detection:** Auto-detect walls, floors, ceilings
*   **Validation:** Compare as-built vs design

### IoT Sensor Placement Optimizer
*   **Action:** Place sensors for optimal coverage (temp, CO2, occupancy)
*   **Calculations:** Calculate required sensor count
*   **Output:** Generate BMS integration schedule

---

## 🔝 PRIORITY IMPLEMENTATIONS

### #1 - Steel Connection Plate Generator
**Why it's demanding:**
*   Complex geometric calculations
*   Requires parametric modeling
*   Industry standards compliance
*   High utility for structural engineers

### #6 - Clash Detection & Resolution
**Why it's demanding:**
*   Multi-disciplinary coordination
*   Requires 3D geometry analysis
*   Automatic problem-solving logic
*   Critical for BIM coordination

---

**Recommendation:** I suggest starting with **#1 Steel Connection Plate Generator** as it showcases:
1.  Parametric geometry creation
2.  Structural standards
3.  Interactive selection
4.  Batch processing

*Should I proceed with writing the complete script for Steel Connection Plate Generator?*
