# Paracore Sample Scripts 🛠️

Welcome to the official sample script library for **Paracore**. This collection is designed to help you understand how to automate Revit using C# and the Paracore Engine.

## 🚀 How to use this library
1.  **Download/Clone** this folder.
2.  Open **Paracore**.
3.  Go to **Settings** > **Script Sources**.
4.  Add the path to this folder as a "Local Folder". 🏎️

---

## 🏗️ Script Types
Paracore identifies two types of scripts within a script source:

### 1. Single-File Scripts (`.cs`)
Files located directly in the script source. These are standalone automations where the engine executes the logic sequentially.

### 2. Multi-File Scripts (Folders)
Folders located directly in the script source. These are treated as a single script entity, regardless of how many files are inside. 

*   **No Naming Enforcement**: You don't need to name the main file after the folder. You can name your entry point `Main.cs`, `Logic.cs`, or anything else.
*   **Smart Detection**: The Paracore engine uses Roslyn to parse all files in the folder and automatically identifies the top-level execution entry point. 🧠

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
