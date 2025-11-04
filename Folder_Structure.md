🗂️ Practical Script Organization for Paracore Agent

1. Element Creation & Management ⚡
📁 01_Element_Creation/
├── 📁 Walls/
├── 📁 Floors_Slabs/
├── 📁 Roofs_Ceiling/
├── 📁 Doors_Windows/
├── 📁 Structural/
└── 📁 MEP_Elements/

2. Geometry & Modeling 📐
📁 02_Geometry_Modeling/
├── 📁 Generative_Design/
├── 📁 Curve_Surface/
├── 📁 Solid_Operations/
└── 📁 Mesh_Generation/

3. Views & Documentation 📊
📁 03_Views_Documentation/
├── 📁 View_Creation/
├── 📁 Sheet_Management/
├── 📁 Annotation/
└── 📁 Schedules/

4. Data & Parameters 🗃️
📁 04_Data_Parameters/
├── 📁 Parameter_Management/
├── 📁 Data_Export_Import/
├── 📁 Shared_Parameters/
└── 📁 Calculations/

5. Analysis & Validation 🔍
📁 05_Analysis_Validation/
├── 📁 Model_Checking/
├── 📁 Clash_Detection/
├── 📁 Quantity_Takeoff/
└── 📁 Standards_Compliance/

6. Selection & Filtering 🎯
📁 06_Selection_Filtering/
├── 📁 Element_Collectors/
├── 📁 Category_Filters/
├── 📁 Parameter_Filters/
└── 📁 Spatial_Queries/

7. Modification & Editing ✏️
📁 07_Modification_Editing/
├── 📁 Geometry_Editing/
├── 📁 Parameter_Updates/
├── 📁 Type_Management/
└── 📁 Batch_Processing/

8. Utilities & Tools 🛠️
📁 08_Utilities_Tools/
├── 📁 Unit_Conversion/
├── 📁 Coordinate_Systems/
├── 📁 Transaction_Helpers/
└── 📁 Error_Handling/


📋 Essential Script Metadata
/*
DocumentType: Project | ConceptualMass | Family
Categories: Architectural, Generative, Facade
SkillLevel: Intermediate
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine

Description:
Creates parametric facade patterns with customizable openings using mathematical functions.
Perfect for conceptual design and massing studies.

UsageExamples:
- "Create a facade with sine wave pattern on Level 2"
- "Generate checkerboard wall openings with 50% density"
- "Make random window pattern 10m wide and 8m high"
*/

🎯 How This Works for the Agent
User says: "I want to create a parametric facade with sine wave pattern on Level 2"

Agent searches:

Looks in 02_Geometry_Modeling/Generative_Design/

Scans descriptions for "facade", "parametric", "sine", "pattern"

Finds Facade_Generator.cs with matching description

Agent presents script with current parameters:

text
Found: Parametric Facade Generator
Description: Creates parametric facade patterns...

Current Parameters:
- levelName: Level 1
- patternType: Sine
- horizontalDivisions: 8
- etc...

Do you want to:
[1] Run with current parameters
[2] Modify parameters first
[3] See other facade scripts
User chooses option 2 and says: "Change level to Level 2 and increase divisions to 12"

Agent updates parameters and shows HITL approval

Script runs and returns results

🔄 Multi-Step Operations
When user wants complex workflows:

User: "I want to create a building mass, then generate facade, then create floors"

Agent finds 3 separate scripts:

01_Element_Creation/Mass_Creation.cs

02_Geometry_Modeling/Generative_Design/Facade_Generator.cs

01_Element_Creation/Floors_Slabs/Floor_Creation.cs

Agent presents them in logical order for user approval

User can reorder or modify parameters for each step

Agent executes sequentially with user confirmation at each step

✅ Key Benefits
No complex metadata - just clear descriptions and categorization

Agent does the hard work of finding and combining scripts

User maintains control - approves every step

Scripts remain independent - can be used solo or in workflows

Scalable - easy to add new scripts to appropriate folders

Intuitive - organized how Revit users actually think

This keeps the power with your agent while making script management simple for users! The folder structure provides enough context for the agent to find relevant scripts without over-engineering the metadata.