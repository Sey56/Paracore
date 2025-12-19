using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Author: Paracore Team
Description: 
A comprehensive guide on how to define parameters in Paracore scripts.
This script demonstrates both the "Simple" (Comment-Based) and "Pro" (Class-Based) patterns.
Use this as a template for your own automation tools!
*/

// =================================================================================
// 1. SIMPLE PATTERN (Comment-Based)
// =================================================================================
// Best for: Quick scripts, prototyping, and top-level simplicity.
// Syntax: Use C# comments starting with // [Parameter(...)] or // [RevitElements(...)]

// [ScriptParameter(Description: "A simple text input field")]
string projectName = "My Revit Project";

// [ScriptParameter(Min: 0, Max: 100, Step: 1, Description: "An integer slider")]
int wallCount = 10;

// [ScriptParameter(Min: 0.0, Max: 50.0, Step: 0.1, Description: "A double/decimal slider")]
double wallHeight = 3.5;

// [ScriptParameter(Options: "Option A, Option B, Option C", Description: "A dropdown list")]
string selectedOption = "Option A";

// [ScriptParameter(Description: "A boolean toggle")]
bool enableLogging = true;

// [ScriptParameter(VisibleWhen: "enableLogging == true", Description: "Only visible when Logging is enabled")]
string logPrefix = "LOG_";

// [RevitElements(Type: "Level", Category: "Levels")]
string levelToUse = "Level 1";

// =================================================================================
// 2. PRO PATTERN (Class-Based)
// =================================================================================
// Best for: Large scripts, complex multi-file tools, and zero IDE errors.
// Syntax: Real C# attributes [Parameter] inside a 'class Params'.
// Benefit: Perfect IntelliSense in VS Code (zero red squiggles!)

var p = new Params();

// Access class parameters using 'p.VariableName'
Println($"Pro Parameter Text: {p.structuredDescription}");


// =================================================================================
// SCRIPT LOGIC
// =================================================================================

Println("--- Paracore Parameter Demonstration ---");
Println($"Project: {projectName}");
Println($"Wall Count: {wallCount}");
Println($"Logging Prefix: {(enableLogging ? logPrefix : "N/A")}");
Println($"Pro Description: {p.structuredDescription}");
Println($"Pro Level: {p.targetLevel}");


// =================================================================================
// PRO CLASS DEFINITION
// =================================================================================

class Params {
    [ScriptParameter(Description: "Metadata directly on class fields - no IDE errors!", Group: "General")]
    public string structuredDescription = "Professional Automation";

    [ScriptParameter(Min: 5, Max: 500, Step: 5, Group: "Dimensions")]
    public int offsetValue = 100;

    [ScriptParameter(Min: 0.1, Max: 10.0, Step: 0.1, Description: "A decimal slider for precision offsets.", Group: "Dimensions")]
    public double precisionOffset = 1.5;

    [ScriptParameter(Options: "Walls, Doors, Windows, Floors", Description: "Supports multi-select! In the UI, this will show up as multiple Checkboxes.", Group: "Filtering")]
    public List<string> categoryFilter = ["Walls", "Doors"];

    // AUTOMATIC (MAGIC) - MULTI-SELECT
    // The Engine has built-in logic for types like "WallType", "Level", "View", etc.
    // By specifying Type="WallType", it automagically populates the list.
    // MultiSelect: true -> Renders as CHECKBOXES in the UI.
    [RevitElements(Type: "WallType", MultiSelect: true, Group: "Filtering")]
    public List<string> wallTypeSelection = new() { "Generic - 200mm" };

    // AUTOMATIC (MAGIC) - SINGLE-SELECT
    // Same magic, but single selection.
    // MultiSelect: false (default) -> Renders as a DROPDOWN in the UI.
    [RevitElements(Type: "Level", Group: "Context")]
    public string simpleLevelPicker = "Level 1";

    // MANUAL (CUSTOM) - SINGLE-SELECT
    // For more control (e.g., custom filtering), defining a method ending in '_Options()'
    // overrides the automatic magic.
    [RevitElements(Group: "Context")]
    public string targetLevel = "Level 1";

    public List<string> targetLevel_Options() {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Select(l => l.Name)
            .Where(n => !n.Contains("Drafting")) // Custom Filter!
            .OrderBy(n => n)
            .ToList();
    }

    // AUTOMATIC (MAGIC) - CATEGORY FILTERING
    // By specifying both Type and Category, we can filter elements.
    // Here we get all FamilySymbols (Types) that belong to the "Doors" category.
    [RevitElements(Type: "FamilySymbol", Category: "Doors", Group: "Filtering")]
    public string doorType = "Single-Flush: 30\" x 84\"";

    // MANUAL (CUSTOM) - LISTING CATEGORIES
    // Since 'Category' is not an Element, we must list them manually.
    // This allows you to create generic scripts that work on ANY category (e.g. "Delete All X").
    [RevitElements(Group: "Filtering")]
    public string targetCategory = "Walls";

    public List<string> targetCategory_Options() {
        var categories = new List<string>();
        foreach (Category cat in Doc.Settings.Categories) {
            categories.Add(cat.Name);
        }
        categories.Sort();
        return categories;
    }
}
