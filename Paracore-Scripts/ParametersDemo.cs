using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Author: Paracore Team
Description: 
A comprehensive guide on how to define parameters in Paracore scripts.
This script demonstrates the modern "Pro" (Class-Based) pattern.
Use this as a template for your own automation tools!
*/

// =================================================================================
// RUNTIME LOGIC
// =================================================================================

var p = new Params();

Println("--- Paracore Modern Parameter Demonstration ---");
Println($"Pro Description: {p.StructuredDescription}");
Println($"Selected Element: {p.PickElementId}");

// =================================================================================
// PARAMETERS CLASS
// =================================================================================

class Params {
    /// <summary>
    /// Professional description using XML comments. Metadata directly on properties!
    /// </summary>
    #region General
    public string StructuredDescription { get; set; } = "Professional Automation";
    #endregion

    /// <summary>
    /// Offset value in millimeters.
    /// </summary>
    #region Dimensions
    [Range(5, 500, 5)] 
    public int OffsetValue { get; set; } = 100;
    #endregion

    /// <summary>
    /// A multi-select parameter. In the UI, this shows as multiple Checkboxes.
    /// </summary>
    #region Filtering
    public List<string> CategoryFilter { get; set; } = ["Walls", "Doors"];
    public static string[] CategoryFilter_Options => ["Walls", "Doors", "Windows", "Floors"];

    // --- REELEMENTS MAGIC ---

    /// <summary>
    /// Automatically populates with Wall Types from Revit. MultiSelect: true renders as checkboxes.
    /// </summary>
    [RevitElements(TargetType = "WallType", MultiSelect = true)]
    public List<string> WallTypeNames { get; set; } = new() { "Generic - 200mm" };
    #endregion

    /// <summary>
    /// Automatically populates with Levels from Revit.
    /// </summary>
    #region Context
    [RevitElements(TargetType = "Level")]
    public string ActiveLevel { get; set; } = "Level 1";

    /// <summary>
    /// Pick an element directly from Revit.
    /// </summary>
    [Select(SelectionType.Element)]
    public long PickElementId { get; set; }

    // --- CONVENTION-BASED PROVIDERS (V3) ---

    /// <summary>
    /// This property uses a custom provider for its options list.
    /// </summary>
    [RevitElements]
    public string CustomLevel { get; set; } = "Level 1";

    // V3 Convention: PropertyName_Options
    public List<string> CustomLevel_Options() {
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .Select(l => l.Name)
            .Where(n => !n.Contains("Drafting")) 
            .OrderBy(n => n)
            .ToList();
    }
    #endregion

    /// <summary>
    /// Demonstration of a generic category picker using Revit API.
    /// Since this data is extracted from Revit, we use [RevitElements].
    /// </summary>
    #region Advanced
    [RevitElements]
    public string TargetCategory { get; set; } = "Walls";

    public List<string> TargetCategory_Options() {
        return Doc.Settings.Categories
            .Cast<Category>()
            .Where(c => c.IsVisibleInUI)
            .Select(c => c.Name)
            .OrderBy(n => n)
            .ToList();
    }

    // --- CONDITIONAL VISIBILITY (V3 CONVENTION) ---

    /// <summary>
    /// Toggle this to show or hide the advanced property.
    /// </summary>
    public bool ShowAdvanced { get; set; } = false;

    /// <summary>
    /// This property is controlled by a C# method for visibility.
    /// </summary>
    public string AdvancedProperty { get; set; } = "High Tech Value";

    // V3 Convention: PropertyName_Visible
    public bool AdvancedProperty_Visible() => ShowAdvanced;
    #endregion

    // --- INPUT TYPES ---

    #region System
    /// <summary>
    /// Select a folder for exporting data.
    /// </summary>
    [InputFolder]
    public string ExportPath { get; set; } = @"C:\Temp";

    /// <summary>
    /// Select a CSV file for processing.
    /// </summary>
    [InputFile("csv")]
    public string InputFile { get; set; } = @"C:\Data\input.csv";
    #endregion
}
