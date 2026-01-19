# Day 04 — Build Your First Auditor: The Wall Length Filter

## Introduction
Today we move from theory to reality. Paracore is not just an add-in; it is a **Top-Level Scripting Environment**. This means you don't have to worry about boilerplates, classes, or complex setups. You just write your logic and press **Run**.

We are going to build a **Wall Length Auditor** script. This script will identify "Short Walls" (under a specific length) on a level of your choice.

---

## Scene 1: Defining the Parameters
Look at the bottom of `Wall_Length_Auditor.cs`. We define our settings in a simple `Params` class.

```csharp
public class Params
{
    [RevitElements(TargetType = "Level")]
    public string TargetLevel { get; set; } = "Level 1";

    [Range(0, 50000, 100)]
    [Unit("mm")]
    public double MaxLengthThreshold { get; set; } = 3000;
}
```

### The Magic: How Paracore Finds "Level"
When you use `[RevitElements(TargetType = "Level")]`, Paracore follows a 4-tiered discovery strategy:

1.  **Hard-Coded Strategy:** Paracore has a fast-track map for common types. "Level" is a classic. It instantly finds all `Autodesk.Revit.DB.Level` elements.
2.  **Category Match:** If it wasn't hard-coded, Paracore would look for a Revit Category named "Levels" (yes, the Category is plural, but the Class is singular!).
3.  **Literal Class (Reflection):** Paracore looks for the actual C# class in the Revit API. Here, it matches the `Level` class perfectly.
4.  **The "Never Fail" Strategy (`_Options`):** If all else fails, you can define a `TargetLevel_Options` property to provide the list manually.

---

## Scene 2: The Script (Fluent & Readable)
At the top of the file, we write our code. We use Revit's "Fluent" API for collectors, but break down complex calculations into simple variables to keep things readable.

```csharp
using Autodesk.Revit.DB.Architecture;

// 1. Initialize Parameters
var p = new Params();

// 2. Find the target level using a fluent collector chain
Level level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.TargetLevel);

if (level == null) throw new Exception($"Level '{p.TargetLevel}' not found.");

// 3. Collect and Filter walls
List<Wall> shortWalls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId.Value == level.Id.Value)
    .Where(w => 
    {
        // Break down complex logic into variables!
        double wallLength = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble();
        return wallLength < p.MaxLengthThreshold;
    })
    .ToList();
```

---

## Scene 3: The Enhanced Table
Instead of just printing text, we use the direct `Table()` helper. This turns your results into a professional, searchable grid in the **Table** tab.

```csharp
var rows = shortWalls.Select(w => 
{
    // Get internal units and convert to mm
    double internalLength = w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble();
    double mmValue = UnitUtils.ConvertFromInternalUnits(internalLength, UnitTypeId.Millimeters);

    return new {
        Id = w.Id.Value,
        Name = w.Name,
        Length_mm = Math.Round(mmValue, 2)
    };
}).ToList();

Table(rows);
```

---

## Scene 4: Select & Isolate
The real power of automation is instant feedback. We select the problematic walls and isolate them in the active view so you can see them immediately.

```csharp
// 6. Select and Isolate the short walls in the active view
var idsToSelect = shortWalls.Select(w => w.Id).ToList();
UIDoc.Selection.SetElementIds(idsToSelect);

// Most view operations require a Transact block to update the Revit UI.
Transact("Isolate Short Walls", () => {
    Doc.ActiveView.IsolateElementsTemporary(idsToSelect);
});
```

---

## The Workflow
1.  **Draft** your logic directly in the `.cs` file.
2.  **Inspect** the auto-generated UI in Paracore.
3.  **Execute** — see the results in the Table tab, and watch Revit highlight and isolate the walls for you.

**Congratulations! You've just built a professional-grade Revit Auditor in a few lines of code.**
