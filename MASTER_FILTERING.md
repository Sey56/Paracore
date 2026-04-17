# 🎯 Paracore REPL: Master Filtering Exercises

Welcome to the **Master Filtering** track! The best way to learn the Paracore engine is to "think in streams." Use these 10 challenges to master `GetStr`, `GetNum`, `WhereParam`, and fluent chaining.

> [!TIP]
> **The Workflow**: 
> 1. Copy a challenge into the **Workshop** tab.
> 2. Write your solution.
> 3. press `Ctrl + Enter` to run.
> 4. Use `Table()` at the end of your chain to see the results.

---

### 🟢 Level 1: Basic String & Param Matching

**Challenge 1: The Level Audit**
Find all **Walls** in the project that are constrained to **"Level 1"** (or any level name in your model) and display them in a table.
*   *Hint: Use `.WhereParam("Base Constraint", "Level Name")`.*

**Challenge 2: The Logic Chain**
Find all **Rooms** that have the name **"OFFICE"** AND the department **"ADMIN"**. 
*   *Hint: You can chain `.WhereParam()` twice!*

---

### 🟡 Level 2: Numeric & Unit-Aware Filtering

**Challenge 3: The Short Wall Warning**
Identify all **Walls** shorter than **1500mm**. 
*   *Hint: Use `.Where(wl => wl.GetNum("Length", "mm") < 1500)`.*

**Challenge 4: The Heavy Floor Audit**
Find all **Floors** that have a volume greater than **10 cubic meters** (`m3`).
*   *Hint: Remember that `.GetNum("Volume", "m3")` returns a simple `double`.*

---

### 🟠 Level 3: Precision & Fuzziness

**Challenge 5: The "Almost Exactly" Filter**
Revit geometry is noisy (e.g. `1499.9999997`). Find every wall that is **exactly 3000mm** long, ignoring the floating-point noise.
*   *Hint: Use `3000.InputUnit("mm")` and `.IsAlmostEqualTo()`.*

**Challenge 6: The Ghost Hunter**
Find any **Rooms** that have a positive area, but that area is effectively **zero** (e.g., less than `0.01 sqm`).
*   *Hint: Use `.AlmostZero()` or `.IsLess()` with a tiny `InputUnit`.*

---

### 🔴 Level 4: Complex Intelligence

**Challenge 7: The "Contains" Inspector**
Find all elements (any category) where the **"Comments"** parameter contains the word **"Audit"** (not an exact match).
*   *Hint: Use `.Where(e => e.GetStr("Comments").Contains("Audit"))`.*

**Challenge 8: Total Project Load**
Calculate the **Total Area** (in `m2`) of all **Floors** on a specific level and print the result using `Println`.
*   *Hint: Use `.SumParam("Area", "m2")`.*

---

### 🟣 Level 5: The Master Orchestrator

**Challenge 9: The UI Synchronizer**
Find all **Doors** that are **wider than 900mm**, list them in a table, and then **Select** them in the Revit UI automatically.
*   *Hint: Chain `.Where(...)`, then `.Table()`, then `.Select()`.*

**Challenge 10: The Ultimate BIM Audit**
Find all **Windows** that are:
1.  On Level **"Level 2"**
2.  Have a **"Mark"** that starts with the letter **"W"**
3.  Have a **"Width"** greater than **600mm**
List their `Id`, `Name`, and `Width_mm` in a table.
*   *Hint: Combine `.WhereParam`, `.Where` (for string manipulation), and `.Select(w => new { ... })`.*

---

### 🛡️ Level 6: Geometric Intelligence

**Challenge 11: The Pipe Penetration Audit**
Find all **Walls** that intersect with **Pipes** and display the coordination results in a table.
*   *Hint: Use `.AuditClashes("Pipes")` and `.Show()`.*

**Challenge 12: The Visual Coordination Sweep**
Perform a high-precision audit to find all **Structural Columns** that clash with **Walls** with a **2mm** tolerance. Calculate the intersection **Volume** and create **Red 3D Helpers** for visual review.
*   *Hint: Use `.AuditClashes("Walls", "2mm", true, true)` and then `.InProjectUnits().Show()` to see the results in your project's units.*

---

🚀 **Ready to check your work?** If you get stuck on a specific number, just ask me for the "Solution path"!
