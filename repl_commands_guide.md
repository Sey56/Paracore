# 🏁 Paracore REPL Workshop Master Reference

The Paracore REPL Workshop is a high-fidelity C# environment designed for real-time Revit automation. This master reference documents every tool, helper, and shortcut available to you.

## ⚡ Pro Editor Features
The workshop editor provides a "mini-VSCode" experience:
- **Syntax Highlighting**: Real-time C# coloring.
- **Smart Indentation**: Auto-indent on [Enter](file:///C:/Users/seyou/Paracore/rap-web/src/features/automation/components/ScriptGallery/ScriptGallery.tsx#130-137) + Brace awareness.
- **Tab Support**: Press [Tab](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#249-251) to insert 4 spaces.
- **Multi-Line Persistence**: Your code stays in the editor after running for rapid iteration.
- **Execution**: Press **`Ctrl + Enter`** to run.
- **Identifying Labels**: Start your code with `/// My Label` to name your execution turn in the console logs.

---

## 💡 Implicit Output (The Shortcut)
You don't always need [Println](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#65-73). If your last line of code is an expression that returns a value, the REPL will **automatically print it**.

```csharp
Doc.Title          // Prints project name
Selection.Count    // Prints number of selected elements
5 + 5              // Prints 10
```

---

## 🧠 Core Global Objects
These are globally injected and always available.

| Object | Type | Description |
| :--- | :--- | :--- |
| [Doc](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#80-93) | [Document](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#80-93) | The active Revit database Document. |
| `UIDoc` | `UIDocument` | The Revit UI Document (active window). |
| `UIApp` | `UIApplication` | The top-level Revit UI Application. |
| `ActiveView` | [View](file:///C:/Users/seyou/Paracore/Paracore.Addin/ViewModels/ServerViewModel.cs#90-91) | The currently active view. |
| `Selection` | `List<Element>` | Currently selected elements in Revit. |
| [Parameters](file:///C:/Users/seyou/Paracore/rap-web/src/features/automation/components/ScriptInspector/ParametersTab.tsx#40-447) | `Dictionary` | Access to external parameters passed to the script. |

---

## ✨ Magic Discovery & Retrieval
Paracore's "Magic" engine resolves strings into Revit objects and avoids complex collectors.

### Instance & Type Discovery
- [GetElements("Doors")](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#349-360) : All door instances.
- [GetElements("DoorTypes")](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#349-360) : All door family symbols.
- `GetElements<Wall>()` : All walls (via C# type).
- `GetElements<FamilyInstance>("Furniture")` : Targeted class + category filter.

### Identity & Navigation
- [GetElement("My Wall Name")](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#322-335) : Find one element by name or "Magic Identity".
- [GetMagicNames()](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#372-391) : List all 500+ categories and family names you can target.
- [GetCategories()](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#392-402) : List all categories in the project.

---

## 📊 Interactive Visualization
Render rich, interactive data in the **Summary** tab.

- **[Table(data)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#249-251)** : Renders any list of objects or elements as a searchable grid.
- **[BarChart(data)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#251-252) / [PieChart(data)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#205-207)** : Renders objects with [name](file:///C:/Users/seyou/Paracore/Paracore.Addin/Services/CoreScriptRunnerService.cs#97-101) and `value` properties.
- **[LineChart(data)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#253-254)** : Renders a line graph.
- **[Select(elements)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#122-132)** : Select and zoom to elements in the Revit UI.
- **[Zoom(elements)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#144-186)** : Zoom the active view to fit elements.
- **[Isolate(elements)](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#133-143)** : Temporarily isolate elements in the view.

---

## 🛠️ Model Modification (Transactions)
To change Revit data, you **must** wrap your code in a [Transact](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#267-278) block.

```csharp
Transact("Pro Labeling", () => {
    var doors = GetElements("Doors");
    foreach (var d in doors) {
        d.LookupParameter("Comments")?.Set("Audit Verified");
    }
});
```

---

## 🔬 Advanced: Background Watchdogs
Register background validation tasks that run while Revit is idle.

```csharp
Watchdog(() => {
    var thinWalls = GetElements<Wall>().Where(w => w.Width < 0.1);
    if (thinWalls.Any()) {
        WatchdogReport($"Found {thinWalls.Count()} thin walls!", "warning", thinWalls);
    }
}, intervalSeconds: 5);
```

---

## 📚 Quick C# Cheat Sheet for Revit
Commonly used properties:
- `element.Id` : The [ElementId](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Core/ParameterOptionsComputer.cs#31-75) (prints as a number in Paracore).
- `element.Name` : The name of the element.
- `element.Category` : The Revit category object.
- `element.LookupParameter("Name")` : Access ANY parameter.
- [(element as Wall)?.Width](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#225-237) : Access specific class properties.

---

## 🚀 Examples to Try Now
- **Audit Levels**: [Table(GetElements<Level>())](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#249-251)
- **Room Densities**: [PieChart(GetElements<Room>().GroupBy(r => r.Level.Name).Select(g => new { name = g.Key, value = g.Count() }))](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#205-207)
- **Cleanup**: [Transact("Purge Selection", () => { foreach(var e in Selection) Doc.Delete(e.Id); })](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ExecutionGlobals.cs#267-278)
- **Discovery**: [GetMagicNames().Where(n => n.Contains("Structure"))](file:///C:/Users/seyou/Paracore/CoreScript.Engine/Globals/ScriptApi.cs#372-391)
