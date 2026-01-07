using System;
using CoreScript.Engine.Globals; 

// 1. Top-Level Statements (Execution Logic)
var p = new Params();
Console.WriteLine($"--- Validation Demo Run ---");
Console.WriteLine($"Project: {p.ProjectName}");
Console.WriteLine($"Type: {p.BuildingType}");

if (!string.IsNullOrEmpty(p.CompanyID))
{
    Console.WriteLine($"Company ID: {p.CompanyID}");
}

// 2. Class Definitions
public class Params
{
    // Best practice: Move options inside the class as static fields
    // This allows nameof() to work in attributes and keeps the global namespace clean
    public static readonly string[] BuildingTypes = new[] { "Residential", "Commercial", "Industrial" };

    [ScriptParameter(Description: "Project Name"), Required]
    public string ProjectName { get; set; } = "My Project";

    // Dynamic Options referencing a static field in the same class
    [ScriptParameter(Description: "Building Type", Options: nameof(BuildingTypes))]
    public string BuildingType { get; set; } = "Residential";

    // Conditional visibility: Only shown when BuildingType is "Commercial"
    [ScriptParameter(Description: "Company ID"), Required]
    [Pattern(@"^COM-\d{4}$")]
    [EnabledWhen(nameof(BuildingType), "Commercial")]
    public string CompanyID { get; set; }

    [ScriptParameter(Description: "Height")]
    [Min(0), Max(50), Suffix("m")]
    public double WallHeight { get; set; } = 10;
}
