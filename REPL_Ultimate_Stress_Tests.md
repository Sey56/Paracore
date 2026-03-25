# 🚀 Paracore REPL: The Ultimate Stress Tests
These 10 real-world scenarios are designed to push the boundaries of your Paracore REPL skills. They cover complex Revit pain points including QA/QC, naming standard enforcement, spatial validation, and data auditing. 

Your goal is to solve each of these using **only the Paracore fluent API extensions** (e.g., `GetElements`, `.WhereMatches`, `.Matches`, `.GetNum`, `.GetVal`, `.GetFamilyName()`, `.AlmostZero()`, etc.) and chain them into an elegant one-liner or a tight block that outputs a pristine `.Table()`.

---

### Exercise 1: The Fire Safety Auditor (Life Safety & Code Compliance)
**Task:** Identify all **Doors** that are either missing a "Fire Rating" (blank/null) or have a rating of "0 mins", but ONLY if the door's host wall has the word "Exterior" in its type name or the door's true `.GetFamilyName()` contains "Exterior". Output a table showing the Door ID, Family Name, and current Fire Rating.

### Exercise 2: The "Sloppy Modeler" Detector (Precision & Constructability)
**Task:** Find all **Walls** where the "Base Offset" parameter is strictly positive (`> 0.InputUnit("mm")`) BUT the offset value does not cleanly snap to a standard 5mm construction tolerance (e.g., the raw `.GetNum()` is not equal to itself when `.RoundTo("mm")` is evaluated). Table the Wall ID and the offending Base Offset.

### Exercise 3: Firm Naming Standard Enforcer (BIM Documentation Standards)
**Task:** Locate all **ViewSheets** where the "Sheet Number" does NOT start with accepted disciplinary prefixes (e.g., A-, S-, M-, E-) AND the "Sheet Name" does not contain any uppercase letters. Return a `.Table()` of these rogue sheets.

### Exercise 4: Spatial & Volume Integrity Check (Ghost/Unclosed Rooms)
**Task:** Filter all **Rooms** in the project to find those that are either "Unplaced" (`.GetVal("Area") == "Not Placed"`), have a computed mathematical volume that is `.AlmostZero()`, OR have a total Area strictly less than `50` sq ft (`.IsLessThan(50.InputUnit("sq_ft"))`). Explicitly exclude any rooms named "Shaft" or "Closet" from the penalty list. 

### Exercise 5: Cost Estimation / Sliver Geometry Filter (Accurate QTO)
**Task:** Gather all elements matching the fuzzy category/name "Foundation" (using `.WhereMatches("Foundation")`). Filter out the modeling errors/slivers by finding those whose total volume (`.GetNum("Volume")`) is less than `0.5` cubic meters. Sum the total volume of the *valid* foundations that remain and display the total in cubic meters (`.OutputUnit("m3")`).

### Exercise 6: Workset Discipline Outcasts (Model Performance & Collaboration)
**Task:** Query all MEP elements (e.g., combining `GetElements("Pipes")` and `GetElements("Ducts")`). Filter for any that have been accidentally placed on default architectural worksets like "Workset1" or "Shared Levels and Grids" (using `.GetStr("Workset")`). Table their IDs, Family Name, and current Workset.

### Exercise 7: Egress Requirements Pre-Check (Automated Code Checking)
**Task:** Query all loadable families that fuzzy-match "Window". Filter for those where the parsed physical width (`.GetNum("Width")`) is strictly less than 36 inches (`36.InputUnit("inch")`). Table the exact Type Name and the violating Width value in millimeters.

### Exercise 8: The CAD Import Witch Hunt (Model Bloat & Dirty Families)
**Task:** Scan for ANY loadable `FamilyInstance` across the model whose true `.GetFamilyName()` contains "Import", "CAD", or "dwg", OR any element where the string representation of its `.AllGeometry()` shows an abnormally high solid count (e.g., > 100 faces/solids) suggesting raw unpurged imports. Table the worst offenders.

### Exercise 9: Precision Mullion Audit (Fabrication Inaccuracies)
**Task:** Target "Curtain Wall Mullions". Find any mullion whose "Length" parameter is weirdly fractional. Compare the strict `.GetNum("Length")` against its mathmatically rounded `.RoundTo("mm")` value. If they are not equal, this flags mullions that were dragged arbitrarily instead of dimensioned accurately.

### Exercise 10: The TBD/TODO Punchlist Generator (Project Handoff Readiness)
**Task:** Query all **Views** and **Sheets** simultaneously. Extract any that have a custom UI value (`.GetVal`) in the "Comments" or "Sheet Issue Date" parameter that contains fuzzy strings like "TBD", "TODO", or "FIXME" (case-insensitive). Generate a master punchlist `.Table()`. 
