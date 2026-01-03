# Paracore Sample Scripts 🛠️

Welcome to the official sample script library for **Paracore**. This collection is designed to help you understand how to automate Revit using C# and the Paracore Engine.

## 🚀 How to use this library
1.  **Download/Clone** this folder.
2.  Open **Paracore**.
3.  Go to **Settings** > **Script Sources**.
4.  Add the path to this folder as a "Local Folder". 🏎️

---

## 🏗️ Script Structures
Paracore supports two types of automation:

### 1. Single-File Scripts (`.cs`)
Most scripts in the root directory are simple, single-file automations. The engine compiles and executes the logic sequentially.
*   **Example**: `Create_Wall.cs`

### 2. Multi-File Scripts (Folders)
Any subfolder (like `Create_Walls`) is treated as a single script. 
*   **Requirement**: The folder must contain at least one `.cs` file.
*   **Logical Entry**: The engine looks for a file matching the folder name (e.g., `Create_Walls.cs`) or the first file found.

---

## ⚙️ Parameters & Metadata
> [!IMPORTANT]
> **Old Syntax Obsolete**: The legacy `// Parameter]` comment-based syntax has been removed. 

Please use the modern **Attribute-based** system for full UI integration:

```csharp
// Define your parameters in a class at the bottom
class Params {
    [ScriptParameter(Description: "My Wall Height")]
    public double height = 3000;

    [RevitElements(Description: "Target Categories")]
    public string category = "Walls";
}
```

---

## ⚠️ Safety First!
**NEVER run sample scripts on live production models until you have verified their logic.**
*   Test all scripts on a copy of your model or the Revit Sample Project.
*   Read the `Description` metadata at the top of each file to understand its impact.
*   Check the console output for skipped elements or warnings. 🛡️

Happy Automating! 🏁⚙️🌟🏆🏁🚀
