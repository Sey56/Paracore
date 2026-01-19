# Paracore Zero-to-Automation: Beginner Series Roadmap

This roadmap is designed to take a Revit user with zero coding experience to a confident automator using Paracore. The focus is on "Small Wins, Frequent Rewards" — every tutorial results in a working tool.

## Phase 1: The Observer (Month 1)
**Goal:** Get comfortable with the Paracore Interface, C# variables, and selecting things. No model changes yet.

### Week 1: The Console & The Selection
*   **Tutorial 1: "Hello Revit" (The Feedback Loop)**
    *   **Concept:** The Console is your best friend.
    *   **Paracore Feature:** `Println()`
    *   **C#:** Strings (`"Text"`) and Integers.
    *   **Task:** Print the name of the current active view and the user name.
    *   **Snippet:** `Println($"Hello {UIApp.Application.Username}, you are in {Doc.ActiveView.Name}");`

*   **Tutorial 2: "What did I select?"**
    *   **Concept:** Interacting with the UI Selection.
    *   **Paracore Feature:** `UIDoc` global.
    *   **Revit API:** `ElementId` and `Element`.
    *   **Task:** Select an element in Revit, run script, print its Category and ID.

### Week 2: Collections & The "Show" Table
*   **Tutorial 3: "Counting Walls" (The Collector)**
    *   **Concept:** Finding things without selecting them.
    *   **Revit API:** `FilteredElementCollector`, `BuiltInCategory`.
    *   **C#:** `var`, `List`, and `.Count`.
    *   **Task:** Count how many walls are in the project vs. the active view.

*   **Tutorial 4: "X-Ray Vision" (Data Tables)**
    *   **Concept:** Visualizing data.
    *   **Paracore Feature:** `Show("table", data)`.
    *   **C#:** Anonymous objects (`new { Name = ... }`) and `foreach` loops.
    *   **Task:** List all Rooms in a table showing Name, Number, and Area.

### Week 3: Introduction to Parameters (The UI)
*   **Tutorial 5: "The Magic Slider"**
    *   **Concept:** Controlling the script from the UI.
    *   **Paracore Feature:** `class Params`, properties, and `[Range]`.
    *   **C#:** The `double` type.
    *   **Task:** Create a script that just prints a number, but control that number with a slider in the Paracore UI.

*   **Tutorial 6: "The Dropdown"**
    *   **Concept:** Selecting Revit elements via UI (Context).
    *   **Paracore Feature:** `[RevitElements(TargetType="Level")]`.
    *   **C#:** `string` properties.
    *   **Task:** Select a Level from a dropdown and count how many doors are on that specific level.

### Week 4: Units & Measurements
*   **Tutorial 7: "Speaking Metric & Imperial"**
    *   **Concept:** Internal Units (Feet) vs. Display Units.
    *   **Paracore Feature:** `[Unit("m")]` and `[Unit("mm")]`.
    *   **Revit API:** `UnitUtils` (brief mention, mostly how Paracore handles it).
    *   **Task:** Calculate the total length of selected walls and display it in meters.

*   **Tutorial 8: "Filters & Logic"**
    *   **Concept:** Making decisions.
    *   **C#:** `if / else` statements.
    *   **Paracore Feature:** Boolean parameters (Checkboxes).
    *   **Task:** Loop through walls. If length > 5 meters, print "Long Wall". Else, print "Short Wall".

---

## Phase 2: The Modifier (Month 2)
**Goal:** We start changing the model. This introduces the `Transact` wrapper.

### Week 5: The Transaction
*   **Tutorial 9: "The Name Changer"**
    *   **Concept:** Modifying Parameters.
    *   **Paracore Feature:** `Transact()`.
    *   **Revit API:** `Parameter.Set()`.
    *   **Task:** Add a suffix to the comments of all selected elements.

*   **Tutorial 10: "Case Standardizer Lite"**
    *   **Concept:** String manipulation.
    *   **C#:** `.ToUpper()`, `.ToLower()`.
    *   **Task:** Force all selected Room names to UPPERCASE.

### Week 6: Renumbering (Logic + Modification)
*   **Tutorial 11: "Simple Renumbering"**
    *   **Concept:** Counters and loops.
    *   **C#:** `i++`.
    *   **Task:** Renumber selected doors 1, 2, 3... based on selection order.

*   **Tutorial 12: "Prefix & Suffix"**
    *   **Concept:** Combining user input with model data.
    *   **Paracore Feature:** Combining `Params` strings with Element parameters.
    *   **Task:** Renumber doors with a user-defined prefix (e.g., "L1-101").

---

## Phase 3: The Creator (Month 3)
**Goal:** Creating new elements.

### Week 7: Geometry Basics
*   **Tutorial 13: "Drawing a Line"**
    *   **Concept:** Revit Geometry.
    *   **Revit API:** `XYZ` points, `Line.CreateBound`.
    *   **Task:** Create a Model Line between two XYZ coordinates defined in the script.

*   **Tutorial 14: "The Box"**
    *   **Concept:** Loops for geometry.
    *   **Task:** Create 4 Model Lines representing a room boundary.

### Week 8: System Families
*   **Tutorial 15: "My First Wall"**
    *   **Concept:** Creating System Families.
    *   **Revit API:** `Wall.Create`.
    *   **Paracore Feature:** `[RevitElements(TargetType="WallType")]`.
    *   **Task:** Create a single wall using a user-selected Wall Type and Level.

*   **Tutorial 16: "Placing a Family"**
    *   **Concept:** Family Instances.
    *   **Revit API:** `NewFamilyInstance`.
    *   **Paracore Feature:** `[RevitElements(TargetType="FamilySymbol")]`.
    *   **Task:** Place a desk at the origin (0,0,0).

---

## Community Strategy

*   **Snippet Saturdays:** Weekly 10-line utility scripts.
*   **Fix It Fridays:** Bug spotting challenges.
*   **Params Cheat Sheet:** A single-page visual guide for `[Unit]`, `[Range]`, and `[RevitElements]`.
