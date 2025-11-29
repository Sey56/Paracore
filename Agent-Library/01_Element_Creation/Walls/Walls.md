# Wall Automation - Complete Guide

> **Purpose**: This document lists ALL automation possibilities for walls in Revit, divided into:
> - ✅ **Wall-Specific Operations** (scripts in THIS source)
> - 🔀 **Generic Operations** (scripts in OTHER categories that accept walls as input)

---

## ✅ Wall-Specific Operations (Scripts in `Walls/`)

### Script 1: `Create_Wall.cs`
**Purpose**: Comprehensive wall creation with all placement methods
- Create straight walls between two points
- Create curved/arc walls
- Create walls by picking room boundaries
- Create walls from imported CAD lines
- Create stacked walls (multi-layer vertical assemblies)
- Create curtain walls with custom grids
- Create walls at specific levels with height offsets
- Batch create walls from coordinate data (CSV/Excel)

### Script 2: `Modify_Wall_Properties.cs`
**Purpose**: Modify wall-specific properties
- Modify wall height (top/base offset, unconnected height)
- Adjust wall location line (centerline, finish face, core centerline, core face)
- Set wall structural usage (bearing, non-bearing, shear)
- Set wall function (interior, exterior, foundation, retaining, soffit)
- Flip wall orientation
- Update room bounding properties
- Attach/detach walls to roofs/floors
- Join/unjoin walls

### Script 3: `Wall_Geometry_Editor.cs`
**Purpose**: Edit wall geometry and profiles
- Edit wall profile (add reveals, sweeps, custom profiles)
- Create wall sweeps (horizontal features)
- Create wall reveals (recesses)
- Add embedded wall families
- Split walls at intersections or specific points
- Extend walls to meet other walls/elements
- Trim walls to specific boundaries

### Script 4: `Wall_Layer_Manager.cs`
**Purpose**: Manage wall layer composition
- Modify wall layer thickness
- Swap materials in wall layers
- Add/remove wall layers
- Reorder wall layers
- Update layer functions (structure, substrate, finish, thermal/air layer, membrane)
- Modify wall wrapping at inserts and ends

### Script 5: `Wall_Opening_Manager.cs`
**Purpose**: Create and manage wall openings and hosted elements
- Create wall openings (rectangular, arched, custom shapes)
- Modify opening sizes and positions
- Place doors in walls at regular intervals
- Place windows with specific spacing rules
- Align hosted elements (doors/windows) vertically or horizontally
- Auto-place MEP penetrations/sleeves in walls

### Script 6: `Curtain_Wall_Manager.cs`
**Purpose**: Comprehensive curtain wall operations
- Create curtain wall grids (horizontal/vertical)
- Modify grid spacing and justification
- Swap curtain panels
- Modify mullion types
- Create custom curtain wall patterns

---

## 🔀 Generic Operations (Use Scripts from Other Categories)

### Parameter Management → `04_Data_Parameters/Parameter_Management/`
- Batch update wall parameters (fire rating, comments, mark, etc.)
- Set phase created/demolished
- Modify workset assignment
- Update shared parameters across multiple walls
- Read/write custom parameter values

### Selection & Filtering → `06_Selection_Filtering/`
- Find walls by specific criteria (type, level, parameters)
- Select walls in active view
- Select walls by bounding box
- Filter walls by parameter values
- Spatial queries (walls in room, walls on level)

### Analysis & Reporting → `05_Analysis_Validation/Quantity_Takeoff/`
- Calculate total wall area by type
- Calculate wall volume/mass
- Measure wall lengths
- Count walls by type/level
- Material quantities from wall layers

### Schedules → `03_Views_Documentation/Schedules/`
- Generate wall schedule data
- Create custom wall schedules
- Export schedule data to Excel/CSV
- Update schedule formatting

### Quality Checks → `05_Analysis_Validation/Model_Checking/`
- Check for duplicate walls (overlapping geometry)
- Validate wall constraints (top/base constraints)
- Find unconnected walls
- Identify walls with zero length
- Check wall type naming conventions
- Verify wall structural properties
- Find walls with missing parameters

### Data Export/Import → `04_Data_Parameters/Data_Export_Import/`
- Export wall data to Excel/CSV
- Import wall data from external sources
- Synchronize wall parameters with external databases
- Batch update from spreadsheets

### Type Management → `08_Family_Creation/Family_Types_Manager/`
- Create new wall types from existing
- Duplicate wall types with modifications
- Transfer wall types between projects
- Update wall type properties (fire rating, thermal properties, cost)
- Rename wall types
- Delete unused wall types

### Coordination → `09_Worksharing_Collaboration/`
- Copy wall types from linked models
- Match wall properties to linked elements
- Update walls based on linked CAD geometry
- Manage wall ownership in workshared models

### Geometric Transformations → `07_Modification_Editing/Geometry_Editing/`
- Move walls by offset distance
- Rotate walls around a point
- Mirror walls across a plane
- Array walls with specific spacing
- Copy walls to different levels

---

## Summary

**6 Wall-Specific Scripts** in this source (`01_Element_Creation/Walls/`):
1. `Create_Wall.cs`
2. `Modify_Wall_Properties.cs`
3. `Wall_Geometry_Editor.cs`
4. `Wall_Layer_Manager.cs`
5. `Wall_Opening_Manager.cs`
6. `Curtain_Wall_Manager.cs`

**Generic operations** handled by scripts in other categories that accept "Walls" as a category parameter.
