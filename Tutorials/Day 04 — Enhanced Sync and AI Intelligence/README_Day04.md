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
    [RevitElements(TargetType = "Levels")]
    public string TargetLevel { get; set; } = "Level 1";

    [Range(0, 50000, 100)]
    [Unit("mm")]
    public double MaxLengthThreshold { get; set; } = 3000;
}
```

### The Magic: How Paracore Finds "Levels"
When you use `[RevitElements(TargetType = "Levels")]`, Paracore follows a 4-tiered discovery strategy:

1.  **Hard-Coded Strategy:** Paracore has a fast-track map for common types. "Levels" is one of them. It instantly finds all `Autodesk.Revit.DB.Level` elements.
2.  **Category Match:** If it wasn't hard-coded, Paracore would look for a Revit Category named "Levels".
3.  **Literal Class (Reflection):** If the category search fails, it looks for an actual C# class in the Revit API named `Level`.
4.  **The "Never Fail" Strategy (`_Options`):** If all else fails, or if you want custom formatting (like `Number - Name`), you can define a `TargetLevel_Options` property to provide the list manually.

---

## Scene 2: The Script (Flat & Fast)
At the top of the file, we just write our code. No main method, no wrapping class.

```csharp
using Autodesk.Revit.DB.Architecture;

// 1. Initialize Parameters
var p = new Params();

// 2. Find the target level (or throw an exception for the engine to catch)
Level level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.TargetLevel);

if (level == null) throw new Exception($"Level '{p.TargetLevel}' not found.");

// 3. Collect all walls on that level (using .Value for IDs)
List<Wall> shortWalls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .Where(w => w.LevelId.Value == level.Id.Value)
    .Where(w => w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH).AsDouble() < p.MaxLengthThreshold)
    .ToList();
```

---

## Scene 3: The Enhanced Summary
Instead of just printing text, we use the direct `Table()` helper. This turns your results into a professional, searchable grid in the **Summary** tab.

```csharp
Table(shortWalls.Select(w => new {
    Id = w.Id.Value,
    Name = w.Name,
    Length_mm = UnitUtils.ConvertFromInternalUnits(...)
}).ToList());
```

---

## The Workflow
1.  **Draft** your logic directly in the `.cs` file.
2.  **Inspect** the auto-generated UI in Paracore.
3.  **Execute** and see your filtered data in the Summary tab instantly.

**Congratulations! You've just built a professional-grade Revit Auditor in a few lines of code.**
