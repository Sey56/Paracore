using Autodesk.Revit.DB;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Author: Paracore Team
Description: 
The ULTIMATE reference for the Paracore V3 Parameter System.
This script demonstrates every supported feature, from basic inputs to advanced dynamic logic.
Use this file to copy-paste patterns into your own scripts.
*/

// ===================================
// RUNTIME LOGIC
// ===================================

var p = new Params();

Println("--- V3 Parameter System Validation ---");
Println($"Project: {p.ProjectName}");
Println($"Count: {p.ElementCount}");
Println($"Height: {p.WallHeight}m");
Println($"Mode: {p.OperationMode}");
Println($"Materials: {string.Join(", ", p.SelectedMaterials)}");
Println($"Is Commercial? {p.IsCommercial}");

if (p.IsCommercial)
{
    Println($"Tax ID: {p.CommercialTaxID}");
}

Transact("V3 Validation", () => {
    // This is just a parameter demo, no actual Revit elements are modified.
    // But we perform a transaction to simulate a real tool.
});

// ===================================
// PARAMETER DEFINITIONS
// ===================================

public class Params
{
    // ---------------------------------------------------------
    // 1. THE BASICS (Implicit & Tagless)
    // ---------------------------------------------------------
    
    /// The name of your project (Simple Tagless Description)
    [Required] // Marks it as Required in UI
    public string ProjectName { get; set; } = "My Project";

    /// Just a simple checkbox boolean
    public bool EnableAudit { get; set; } = true;

    // ---------------------------------------------------------
    // 2. NUMERIC CONTROLS (Ranges & Sliders)
    // ---------------------------------------------------------

    /// <summary>
    /// Number of elements to process.
    /// Uses standard XML documentation (ideal for libraries).
    /// </summary>
    [Range(1, 100)] 
    public int ElementCount { get; set; } = 10;

    /// Wall height in meters with step
    [Range(0.1, 10.0, 0.1)]
    public double WallHeight { get; set; } = 3.0;

    // ---------------------------------------------------------
    // 3. REVIT SELECTION (The Magic)
    // ---------------------------------------------------------

    /// Pick a Wall Type from the model
    [RevitElements(TargetType = "WallType", Group = "Revit Selection")]
    public string WallTypeName { get; set; }

    /// Pick a specific Level
    [RevitElements(TargetType = "Level", Group = "Revit Selection")]
    public string LevelName { get; set; } = "Level 1";

    /// Pick a Door Type (Filtered by Category)
    [RevitElements(TargetType = "FamilySymbol", Category = "Doors", Group = "Revit Selection")]
    public string DoorTypeName { get; set; }

    // ---------------------------------------------------------
    // 4. MULTI-SELECT & DROPDOWNS (The V3 Way)
    // ---------------------------------------------------------

    /// <summary>Select operation mode (Dropdown)</summary>
    [ScriptParameter(Group = "Options")]
    public string OperationMode { get; set; } = "Create";
    // Define options as a simple static range or property - clean C# syntax!
    public static string[] OperationMode_Options => ["Create", "Update", "Delete"];

    /// <summary>Select multiple materials (Checkboxes)</summary>
    /// <remarks>The engine infers MultiSelect: true because the type is List&lt;string&gt;</remarks>
    [ScriptParameter(Group = "Options")]
    public List<string> SelectedMaterials { get; set; } = ["Concrete", "Glass"];
    // No more ugly comma-separated strings!
    public static List<string> SelectedMaterials_Options => ["Concrete", "Brick", "Glass", "Timber"];

    // ---------------------------------------------------------
    // 5. ADVANCED CONVENTIONS (The Power Features)
    // ---------------------------------------------------------

    // A. Dynamic Options (_Options Method)
    // ----------------------------
    /// Select a distinct view name (Dynamically populated)
    [ScriptParameter(Group = "Advanced")]
    public string? TargetViewName { get; set; }

    // Logic method for dynamic fetching
    public List<string> TargetViewName_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(View))
            .Cast<View>()
            .Where(v => !v.IsTemplate)
            .Select(v => v.Name)
            .Distinct()
            .OrderBy(n => n)
            .ToList();
    }

    // B. Conditional Visibility (_Visible)
    // ------------------------------------
    
    /// Is this a commercial project?
    [ScriptParameter(Group = "Logic")]
    public bool IsCommercial { get; set; } = false;

    /// Tax ID (Only visible if IsCommercial is true)
    [ScriptParameter(Group = "Logic")]
    public string CommercialTaxID { get; set; }

    // This property AUTOMATICALLY controls visibility of CommercialTaxID
    // Convention: PropertyName_Visible => bool
    public bool CommercialTaxID_Visible => IsCommercial;

    // ---------------------------------------------------------
    // 6. FILE SYSTEM INPUTS
    // ---------------------------------------------------------

    /// Select an import file
    [ScriptParameter(InputType = "File", Group = "IO")]
    public string ImportPath { get; set; } = @"C:\data.csv";

    /// Select an export folder
    [ScriptParameter(InputType = "Folder", Group = "IO")]
    public string ExportFolder { get; set; } = @"C:\Exports";
    
    /// Select save location
    [ScriptParameter(InputType = "SaveFile", Group = "IO")]
    public string SavePath { get; set; } = @"C:\Exports\report.pdf";
}
