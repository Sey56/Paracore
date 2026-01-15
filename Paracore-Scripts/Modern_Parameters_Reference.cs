using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

/*
** MODERN PARAMETERS REFERENCE **
This script demonstrates the complete capabilities of the Paracore Parameter Engine (V2 Modern).
Use this as a copy-paste reference for your own scripts.
*/

Params p = new();

Println("--- Script Execution Started ---");
Println($"Text Input: {p.SimpleText}");
Println($"Numeric Input: {p.WallWidth} {p.WallWidth_Unit}");
Println($"Boolean Toggle: {p.IsToggleOn}");
Println($"Selected Option: {p.DynamicDropdown}");
Println($"Selected Point: {p.PickPoint}");
Println($"Selected Element ID: {p.PickElementId}");

if (p.MultiSelectRooms != null)
    Println($"Selected Rooms: {string.Join(", ", p.MultiSelectRooms)}");

if (p.SourceCsv != null)
    Println($"File Path: {p.SourceCsv}");

// ---------------------------------------------------------
// PARAMETERS CLASS
// ---------------------------------------------------------
public class Params
{
    // -----------------------------------------------------
    #region 1. Basic Types & Validation
    // -----------------------------------------------------

    /// <summary>
    /// A simple required text string.
    /// </summary>
    [Required]
    public string SimpleText { get; set; } = "Default Text";

    /// <summary>
    /// A numeric input with range, step, and unit suffix.
    /// </summary>
    [Range(100, 5000, 10)] 
    [Unit("mm")]
    public double WallWidth { get; set; } = 300;

    /// <summary>
    /// A simple boolean toggle switch.
    /// </summary>
    public bool IsToggleOn { get; set; } = true;

    #endregion

    // -----------------------------------------------------
    #region 2. File System Inputs
    // -----------------------------------------------------

    /// <summary>
    /// Select a CSV or Excel file.
    /// </summary>
    [InputFile("csv,xlsx")]
    public string SourceCsv { get; set; }

    /// <summary>
    /// Select an output directory.
    /// </summary>
    [InputFolder]
    public string OutputDir { get; set; }

    #endregion

    // -----------------------------------------------------
    #region 3. Interactive Selection
    // -----------------------------------------------------

    /// <summary>
    /// Pick a point in the Revit model. Returns "X,Y,Z".
    /// </summary>
    [Select(SelectionType.Point)]
    public string PickPoint { get; set; }

    /// <summary>
    /// Pick an element in Revit. Returns its Element ID (supports int or long).
    /// </summary>
    [Select(SelectionType.Element)]
    public long PickElementId { get; set; }

    #endregion

    // -----------------------------------------------------
    #region 4. Magic Lists ([RevitElements])
    // -----------------------------------------------------

    /// <summary>
    /// Automatically lists all Wall Types in the project.
    /// </summary>
    [RevitElements(TargetType = "WallType")]
    public string WallTypeSelector { get; set; }

    /// <summary>
    /// Automatically lists all Views.
    /// </summary>
    [RevitElements(TargetType = "View")]
    public string ViewSelector { get; set; }

    #endregion

    // -----------------------------------------------------
    #region 5. Dynamic Logic (Suffixes)
    // -----------------------------------------------------

    /// <summary>
    /// Dropdown populated by custom logic (_Options).
    /// </summary>
    public string DynamicDropdown { get; set; }

    // Logic for DynamicDropdown
    public List<string> DynamicDropdown_Options()
    {
        // Example: Get all Level names
        return new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Select(l => l.Name)
            .ToList();
    }

    /// <summary>
    /// Multi-select checkboxes (List<string>).
    /// </summary>
    public List<string> MultiSelectRooms { get; set; }

    // Logic for MultiSelectRooms
    public List<string> MultiSelectRooms_Options()
    {
        return new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Select(e => e.Name)
            .Distinct()
            .ToList();
    }

    // -----------------------------------------------------
    // Visibility & Interaction
    // -----------------------------------------------------

    public bool ShowAdvancedSettings { get; set; } = false;

    /// <summary>
    /// This parameter is only visible if 'ShowAdvancedSettings' is TRUE.
    /// </summary>
    public string AdvancedApiKey { get; set; }

    // Visibility Logic
    public bool AdvancedApiKey_Visible => ShowAdvancedSettings;

    #endregion
}
