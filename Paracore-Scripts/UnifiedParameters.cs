using Autodesk.Revit.DB;
using System.Collections.Generic;

/*
DocumentType: Project
Author: Paracore Team
Description: 
Demonstration of the Unified V3 Parameter System.
This shows how [ScriptParameter] is no longer needed for standard inputs.
*/

var p = new Params();

Println("--- Unified Parameter Demo ---");
Println($"Input File: {p.SourceCsv}");
Println($"Output Folder: {p.ExportDir}");
Println($"Report Path: {p.ReportFile}");

public class Params
{
    // --- New File System Attributes ---

    /// <summary>
    /// Select a CSV file to process.
    /// </summary>
    [InputFile("csv"), Required]
    public string SourceCsv { get; set; } = @"C:\data.csv";

    /// <summary>
    /// Select the folder where results will be saved.
    /// </summary>
    [InputFolder]
    public string ExportDir { get; set; } = @"C:\Exports";

    /// <summary>
    /// Choose where to save the final PDF report.
    /// </summary>
    [SaveFile("pdf")]
    public string ReportFile { get; set; } = @"C:\Exports\FinalReport.pdf";


    // --- Standard Unified Attributes (Already Supported) ---

    /// <summary>
    /// A required text field.
    /// </summary>
    [Required]
    public string ProjectCode { get; set; } = "P-001";

    /// <summary>
    /// Numeric input with explicit range.
    /// </summary>
    [Range(0, 100)]
    public int Iterations { get; set; } = 10;
}
