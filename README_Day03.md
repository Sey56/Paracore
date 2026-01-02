# Day 03 — The Paracore Ecosystem & Workflow Mastery

## Scene 1: Introduction & Version Check
> [!IMPORTANT]
> Please ensure you have installed **Paracore v1.1.1** or later. This update includes critical workflow improvements (Live Sync, Instant Connection) referenced in this tutorial.
> **Download:** [Paracore v1.1.1 Latest Release](https://github.com/Sey56/Paracore/releases/tag/v1.1.1)

- Recap of Day 1 & 2: Installation, UI Tour, "HelloWall.cs".
- **Goal for Today:** Lay the groundwork for real-world automation. Before we start building complex tools, we need to master the Paracore ecosystem and get comfortable with its unique workflow mechanics.

## Scene 2: The "Smart Sync" Engine (Metadata & Parameters)
- **Metadata Behavior:** Metadata (Author, Description, etc.) is parsed when the script source is loaded.
- **Parameter Extraction:** Parameters are extracted on selection and cached globally.
- **The "Smart Sync" Workflow (v1.1.1):** 
  - **Automatic Background Sync:** Updates happen automatically in the background (every ~5s) while you type in VS Code. You don't even need to change focus! 🚀
  - **Instant Focus Sync:** If you want an immediate update, simply click anywhere on the Paracore window to trigger a focus-driven rescan.
  - **Manual Override Protection:** Paracore remembers your UI edits. If you manually change a value, it becomes "dirty" and won't be overwritten by code changes.
  - **Global Persistence:** Your edits and selected presets are now saved to `localStorage`. They survive app restarts and navigating between scripts.
  - **Pro Tip: Resetting Parameters:** If you want to force a parameter back to the code's default (clearing your UI override), simply delete the parameter definition in VS Code, wait for Paracore to sync (it will disappear), and then **Undo** in VS Code. It will be treated as a "new" parameter and pick up the fresh defaults! 💡

## Scene 3: Temporary Workspaces
- **What are they?** When you click "Edit", Paracore generates a temporary, isolated VS Code workspace. This gives you full IntelliSense without cluttering your main project.
- **Lifecycle:** These workspaces are **ephemeral**. They are designed to be thrown away.
- **Cleanup:** When you close **Revit**, Paracore automatically cleans up all these temporary folders.
- **Visuals:** If you keep VS Code open after closing Revit, the files will appear deleted (strikethrough) because the temp folder is gone. This is normal behavior! Just reopen from Paracore next time.

## Scene 4: Standalone vs. App Workflow
- **VS Code Extension:** works independently! You only need the **Revit Add-in** running.
- **Paracore App:** Provides the rich UI, parameter sliders, preset management, and collaboration features.
- **Workspace Differences:** 
  - **Extension:** Manages persistent workspaces until manually deleted.
  - **App:** Manages ephemeral workspaces for quick "edit-and-run" cycles.

## Scene 5: Blocking Operations
- **The Revit Modal Block:** Revit is single-threaded. If a `TaskDialog` is open, or you are actively drawing/editing an element, the Revit API is "blocked."
- **Communication Latency:** Execution results can only be sent back once the Revit transaction finishes. 
- **Pro Tip:** Avoid long-running loops without `Println` feedback, and remember that `TaskDialog.Show()` will pause your script execution entirely until it is closed.

## Scene 6: The "Zero Setup" Advantage
Comparing a traditional Revit Add-in vs. Paracore CoreScript.

### The Traditional Way (SDK Example)
*Requires: Class Library, DLL References, .addin Manifest, and a Revit Restart.*

```csharp
[Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.ReadOnly)]
public class Document_Selection : IExternalCommand
{
    public Autodesk.Revit.UI.Result Execute(ExternalCommandData commandData,
        ref string message, ElementSet elements)
    {
        try
        {
            // Select some elements in Revit before invoking this command

            // Get the handle of current document.
            UIDocument uidoc = commandData.Application.ActiveUIDocument;

            // Get the element selection of current document.
            ICollection<ElementId> selectedIds = uidoc.Selection.GetElementIds();

            if (selectedIds.Count == 0)
            {
                TaskDialog.Show("Revit", "You haven't selected any elements.");
            }
            else
            {
                string info = "Ids of selected elements in the document are: ";
                foreach (ElementId id in selectedIds)
                {
                    info += Environment.NewLine + id.Value;
                }
                TaskDialog.Show("Revit", info);
            }
        }
        catch (Exception e)
        {
            message = e.Message;
            return Autodesk.Revit.UI.Result.Failed;
        }
        return Autodesk.Revit.UI.Result.Succeeded;
    }
}
```

### The Paracore Way (Modern Syntax)
*No setup. No restart. Instant UI and Console feedback. (Global namespaces like `Autodesk.Revit.DB` are already available!)*

```csharp
// Access Revit handles directly (UIDoc, Doc, App are globally available)
var selectedIds = UIDoc.Selection.GetElementIds();

if (selectedIds.Count == 0)
{
    // You can use standard Revit UI...
    TaskDialog.Show("Revit", "You haven't selected any elements.");
}
else
{
    // ...OR the powerful Paracore console!
    Println($"Ids of {selectedIds.Count} selected elements in the document are:");

    foreach (ElementId id in selectedIds)
    {
        // Standard Revit API works perfectly here
        Println($"- {id.Value}");
    }
    
    // Mix and match as needed
    TaskDialog.Show("Paracore", $"Processing {selectedIds.Count} elements. See console for details.");
}
```
