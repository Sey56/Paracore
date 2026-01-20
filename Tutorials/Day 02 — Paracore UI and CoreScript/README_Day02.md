
![Paras Codarch Logo](assets/ParasCodarch.png)
## Day 02 — Paracore UI and CoreScript (≈ 3 minutes)

🎬 **Watch the Day 02 walkthrough:** https://youtu.be/VIDEO_ID

This is a short, focused 3-minute walkthrough to quickly show the Paracore UI and create a simple CoreScript you can run yourself.

---

## 3-minute walkthrough (follow these steps)

1. **Quick intro:** This guide covers the UI and how to create & run a short script.
2. **See the UI:** Learn where the TopBar, Sidebar, Gallery, ScriptInspector, and FloatingCodeViewer are located.
3. **Create a script:** Load a folder as a script source, click **New Script**, then **Edit in VSCode**.
4. **Edit & run:** With **Auto Save** enabled, edit the script in VSCode, save, and run it in Paracore (watch the result in Revit).

---

A practical, step-by-step guide to accompany the Day 2 video: exploring the Paracore UI, creating your first script, and understanding the few helper globals that make CoreScript comfortable.

---

## Prerequisites

- **Latest Paracore build:** Download the latest release before following along (features evolve quickly):
  - [Download the latest Paracore release](https://github.com/Sey56/Paracore-Scripts/releases/latest)
- **Revit:** works with Revit 2025 and 2026.
- **VS Code:** Enable Auto Save for the best experience.
- **Basic C#:** Scripts are plain C# (called **CoreScripts** inside Paracore).

---

## Paracore UI Overview

Paracore’s interface is designed to keep automation simple and accessible. Here’s a quick guide to the main components:

### 🔹 TopBar
- Hamburger menu → hide/show the Sidebar
- App title
- Theme toggle button (light/dark mode)
- Revit connection status indicator
- Automation modes selector
- Help button
- Sign‑in options:
  - **Continue Offline**
  - **Sign in with Google**

### 🔹 Sidebar
- Used mainly for loading and unloading **script sources**  
  (local folders containing your scripts).

### 🔹 Gallery
- Displays scripts as **script cards**.  
- Includes a **robust search feature** for finding scripts quickly.  
- Has a **New Script** button for creating new scripts.  

### 🔹 ScriptInspector
- **Header** → shows script name, description, and metadata.  
- **Tabs below the header:**
  - **Parameters tab** → editable parameters, plus the **Run Script** button.  
    - Also includes the toggle for showing/hiding the FloatingCodeViewer.  
  - **Console tab** → output from `Print` and `Println`.  
  - **Table tab** → tables rendered from the `Show` global.  
  - **Metadata tab** → script metadata and details.

### 🔹 FloatingCodeViewer
- Read‑only view of the selected script’s code.  
- Updates instantly when VSCode autosave is enabled.  
- Contains the **Edit in VSCode** button:  
  - Clicking this generates a temporary workspace with full IntelliSense.  
  - Opens the script in VSCode for editing.  
  - Best of both worlds: live preview in Paracore + full developer experience in VSCode.


### 🔹 CoreScript and Globals

Paracore scripts are called **CoreScripts**. They are just **plain C# files** with full IntelliSense support.  
You don’t need to learn a new language — it’s the same C# you already know, plus a few helper globals.

### Familiar objects
- **Doc / UIDoc / UIApp** → standard Revit API objects (already part of Revit).
- **Transact** → simplified wrapper around Revit transactions.

### New helpers
- **Print / Println** → output text to the Console tab in Inspector.
- **Show** → render tabular data to the Table tab in Inspector.

> Key idea: CoreScript = C# + Revit API + a few helpers. Nothing alien, just simplified.

---

## Quick start: Your First Script

1. **Open Paracore**
   - Launch Paracore and ensure Revit is open with a project.
   - Scripts execute in the active Revit context.

2. **Load a script source**
   - In the **Sidebar**, click to load a local folder as a script source.
   - This folder will contain your scripts and is required before creating new ones.

3. **Create a new script in Gallery**
   - Once a source is loaded, go to **Gallery** → **New Script**.
   - The new script will be created inside the loaded folder.

4. **Open the Inspector**
   - Select your new script to view it in Inspector (`ScriptInspector.tsx`).
   - Inspector hosts Parameters, Console, Table, and Metadata tabs.

5. **Edit in VSCode**
   - In the **FloatingCodeViewer**, click **Edit in VSCode**.
   - Paracore generates a temporary workspace with full IntelliSense and opens VSCode.
   - With autosave enabled, edits in VSCode instantly update the FloatingCodeViewer (read-only).

---

## Example Script: `HelloWall.cs`

```csharp
using Autodesk.Revit.DB;

// [ScriptParameter(Description: "Target Level name")]
string levelName = "Level 1";

// [ScriptParameter(Min: 1.0, Max: 50.0, Step: 0.5, Description: "Wall length in meters")]
double wallLengthMeters = 6.0;

double lengthFt = UnitUtils.ConvertToInternalUnits(wallLengthMeters, UnitTypeId.Meters);
XYZ pt1 = new XYZ(-lengthFt / 2, 0, 0);
XYZ pt2 = new XYZ(lengthFt / 2, 0, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName);

if (level == null)
{
    Println($"Level '{levelName}' not found.");
}
else
{
    Transact("Create Wall", () =>
    {
        Wall wall = Wall.Create(Doc, wallLine, level.Id, false);
    });

    Println("✅ Wall created.");
}

---

## Resources

- 🎬 **Day 02 walkthrough (video):** https://youtu.be/VIDEO_ID
