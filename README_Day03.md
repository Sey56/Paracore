# Day 03 — The Paracore Ecosystem & Workflow Mastery

## Scene 1: Introduction & Version Check
> **Important:** Please ensure you have installed **Paracore v1.1.1** or later. This update includes critical workflow improvements (Live Sync, Instant Connection) referenced in this tutorial.

- Recap of Day 1 & 2: Installation, UI Tour, "HelloWall.cs".
- **Goal for Today:** Lay the groundwork for real-world automation. Before we start building complex tools, we need to master the Paracore ecosystem and get comfortable with its unique workflow mechanics.

## Scene 2: The "Live Sync" Engine (Metadata & Parameters)
- **Metadata Behavior:** Metadata (Author, Description, etc.) is parsed when the script source is loaded.
- **Parameter Efficiency:** Parameters are extracted on selection.
- **The "Live Sync" Workflow:** 
  - Updates happen automatically when you switch focus back to the Paracore app.
  - No manual refresh needed! Just add a parameter in VS Code, Alt-Tab back to Paracore, and watch the new input field appear instantly.
  - This keeps performance high by not spamming the engine while you type.

## Scene 3: Temporary Workspaces
- **What are they?** When you click "Edit", Paracore generates a temporary, isolated VS Code workspace. This gives you full IntelliSense without cluttering your main project.
- **Lifecycle:** These workpsaces are **ephemeral**. They are designed to be thrown away.
- **Cleanup:** When you close **Revit**, Paracore automatically cleans up all these temporary folders to keep your disk usage low.
- **Visuals:** If you keep VS Code open after closing Revit, the files will appear deleted (strikethrough) because the temp folder is gone. This is normal behavior! Just reopen from Paracore next time.

## Scene 4: CoreScript Extension vs. Paracore App
- **Standalone:** The `corescript-vscode` extension works independently!
- **Minimal Setup:** You only need the **Revit Add-in** installed for the server. You don't need the full Paracore React app running to execute scripts from VS Code.
- **Workspace Differences:** 
  - **VS Code Extension:** Manages its own workspaces that persist until *you* delete them.
  - **Paracore App:** Manages ephemeral workspaces that are automatically cleaned up by Revit.

## Scene 5: Blocking Operations
- **The "Running..." Hang:** Revit is a single-threaded application. If it is busy (e.g., a `TaskDialog` is open, or you are in the middle of drawing a Wall), it acts as a modal block.
- **Result:** Execution results cannot be sent back to Paracore until the operation finishes. 
- **Example:** A `TaskDialog.Show()` blocks the script until you click "Close". `Println` statements after it won't appear until unblocked.

## Scene 6: The "Zero Setup" Advantage
Comparing a traditional Revit Add-in vs. Paracore CoreScript.

### The Traditional Way (SDK Example)
*Requires: Class Library project, References (RevitAPI.dll), Manifest file (.addin), restarting Revit to load.*

```csharp
[Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.ReadOnly)]
public class Document_Selection : IExternalCommand
{
    public Autodesk.Revit.UI.Result Execute(ExternalCommandData commandData,
        ref string message, ElementSet elements)
    {
        try
        {
            // Boilerplate to get document
            UIDocument uidoc = commandData.Application.ActiveUIDocument;
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

### The Paracore Way
*No setup. No restart. Just write and run.*

```csharp
try
{
    // UIDoc is globally available!
    var selectedIds = UIDoc.Selection.GetElementIds();

    if (selectedIds.Count == 0)
    {
        Println("No elements selected.");
    }
    else
    {
        Println("Selected ElementIds:");
        foreach (ElementId id in selectedIds)
        {
            Println($"ElementId: {id.Value}");
        }
    }
}
catch (Exception e)
{
    Println($"Error: {e.Message}");
}
```
