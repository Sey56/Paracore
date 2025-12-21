using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Text;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using CoreScript.Engine.Globals; // Required for attributes

/*
DocumentType: Project
Categories: Architecture, QA
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Architectural Standards QA Check with Visual Highlighting.
Checks three fundamental building code requirements and highlights non-compliant elements.
Offers CSV export of findings.
*/

// Initialize Parameters
var p = new Params();

// Convert to internal units (feet)
double minRoomAreaSqFt = UnitUtils.ConvertToInternalUnits(p.minRoomArea, UnitTypeId.SquareMeters);
double minRoomSideLenFt = UnitUtils.ConvertToInternalUnits(p.minRoomSideLength, UnitTypeId.Meters);

double minRiserHeightFt = UnitUtils.ConvertToInternalUnits(p.minRiserHeight, UnitTypeId.Meters);
double maxRiserHeightFt = UnitUtils.ConvertToInternalUnits(p.maxRiserHeight, UnitTypeId.Meters);

double minTreadDepthFt = UnitUtils.ConvertToInternalUnits(p.minTreadDepth, UnitTypeId.Meters);
double maxTreadDepthFt = UnitUtils.ConvertToInternalUnits(p.maxTreadDepth, UnitTypeId.Meters);

double minDoorClearanceFt = UnitUtils.ConvertToInternalUnits(p.minDoorClearance, UnitTypeId.Meters);

// Store highlighted elements to clear them later
List<ElementId> previouslyHighlightedElements = new List<ElementId>();

// Main execution
Println("🏗️ Starting Architectural Standards Audit...");
Println($"• Rooms: Min Area {p.minRoomArea}m², Min Side {p.minRoomSideLength}m");
Println($"• Stairs: Riser {p.minRiserHeight}-{p.maxRiserHeight}m, Tread {p.minTreadDepth}-{p.maxTreadDepth}m");
Println($"• Doors:  Min Clearance {p.minDoorClearance}m");
Println("------------------------------------------");

// Run checks
var issues = new List<QAIssue>();
issues.AddRange(CheckRoomCompliance(minRoomAreaSqFt, minRoomSideLenFt));
issues.AddRange(CheckStairDimensions(minRiserHeightFt, maxRiserHeightFt, minTreadDepthFt, maxTreadDepthFt));
issues.AddRange(CheckDoorClearances(minDoorClearanceFt));

// Report results
if (issues.Count == 0)
{
    Println("✅ All checks passed! Model complies with selected standards.");
}
else
{
    Println($"⛔ Found {issues.Count} compliance issues.");
    var problemElementIds = issues.Select(i => i.ElementId).ToList();

    // Highlight problems in the active view
    if (p.highlightIssues)
    {
        Println("🟥 Highlighting problematic elements in red...");
        HighlightElements(problemElementIds);
        Println("💡 The issues are now highlighted.");
    }

    // Select them in the UI
    Println($"🔍 Selecting {problemElementIds.Count} problematic elements...");
    SelectElements(problemElementIds);

    // CSV Export
    if (p.shouldExportToCsv)
    {
        ExportToCsv(issues, p.outputPath);
    }
}

// ---------------------------------------------------------
// Helper Methods
// ---------------------------------------------------------

void HighlightElements(List<ElementId> elementIds)
{
    if (UIDoc == null || elementIds.Count == 0) return;

    Color highlightColor = new Color(255, 0, 0); // Red
    int lineWeight = 5;

    OverrideGraphicSettings ogs = new OverrideGraphicSettings();
    ogs.SetProjectionLineColor(highlightColor);
    ogs.SetProjectionLineWeight(lineWeight);
    ogs.SetSurfaceForegroundPatternColor(highlightColor);
    ogs.SetSurfaceForegroundPatternId(ElementId.InvalidElementId);

    Transact("Highlight Issues", () =>
    {
        foreach (ElementId id in elementIds)
        {
            Doc.ActiveView.SetElementOverrides(id, ogs);
        }
    });

    UIDoc.RefreshActiveView();
}

void SelectElements(List<ElementId> elementIds)
{
    if (UIDoc != null && elementIds != null && elementIds.Count > 0)
    {
        UIDoc.Selection.SetElementIds(elementIds);
        UIDoc.ShowElements(elementIds);
    }
}

// ===== QA CHECK METHODS =====
IEnumerable<QAIssue> CheckRoomCompliance(double minAreaSqFt, double minSideLenFt)
{
    var issues = new List<QAIssue>();
    var rooms = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
        .Cast<Room>();

    var boundaryOptions = new SpatialElementBoundaryOptions();

    foreach (var room in rooms)
    {
        // Check 1: Area
        if (room.Area > 0 && room.Area < minAreaSqFt)
        {
            double actualArea = UnitUtils.ConvertFromInternalUnits(room.Area, UnitTypeId.SquareMeters);
            issues.Add(new QAIssue(
                room.Id, room.Name, "Rooms",
                $"Area too small: {actualArea:F2}m² < required {p.minRoomArea}m²"
            ));
            continue; // Fail area -> Report -> Next room (optimization)
        }

        // Check 2: Side Lengths (Narrow Room Check)
        IList<IList<BoundarySegment>> boundaries = room.GetBoundarySegments(boundaryOptions);
        if (boundaries == null) continue;

        bool sideFail = false;
        foreach (var loop in boundaries)
        {
            foreach (var segment in loop)
            {
                double len = segment.GetCurve().Length;
                if (len < minSideLenFt && len > 0.01) // Ignore near-zero segments
                {
                    double actLenM = UnitUtils.ConvertFromInternalUnits(len, UnitTypeId.Meters);
                    issues.Add(new QAIssue(
                        room.Id, room.Name, "Rooms",
                        $"Room too narrow: Side {actLenM:F2}m < required {p.minRoomSideLength}m"
                    ));
                    sideFail = true;
                    break; 
                }
            }
            if (sideFail) break;
        }
    }
    return issues;
}

IEnumerable<QAIssue> CheckStairDimensions(double minRiserFt, double maxRiserFt, double minTreadFt, double maxTreadFt)
{
    var issues = new List<QAIssue>();
    var stairs = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Stairs)
        .WhereElementIsNotElementType()
        .Cast<Stairs>();

    foreach (var stair in stairs)
    {
        foreach (ElementId runId in stair.GetStairsRuns())
        {
            var run = Doc.GetElement(runId) as StairsRun;
            if (run == null) continue;

            // Check riser height (Min & Max)
            var riserParam = run.get_Parameter(BuiltInParameter.STAIRS_RUN_ACTUAL_RISER_HEIGHT);
            if (riserParam != null)
            {
                 double rVal = riserParam.AsDouble();
                 if (rVal < minRiserFt || rVal > maxRiserFt)
                 {
                    double valCm = UnitUtils.ConvertFromInternalUnits(rVal, UnitTypeId.Centimeters);
                    issues.Add(new QAIssue(stair.Id, stair.Name, "Stairs",
                        $"Non-compliant Riser: {valCm:F1}cm (Range: {p.minRiserHeight*100}-{p.maxRiserHeight*100}cm)"));
                 }
            }
            
            // Check tread depth (Min & Max)
            var treadParam = run.get_Parameter(BuiltInParameter.STAIRS_RUN_ACTUAL_TREAD_DEPTH);
             if (treadParam != null)
            {
                 double tVal = treadParam.AsDouble();
                 if (tVal < minTreadFt || tVal > maxTreadFt)
                 {
                    double valCm = UnitUtils.ConvertFromInternalUnits(tVal, UnitTypeId.Centimeters);
                    issues.Add(new QAIssue(stair.Id, stair.Name, "Stairs",
                        $"Non-compliant Tread: {valCm:F1}cm (Range: {p.minTreadDepth*100}-{p.maxTreadDepth*100}cm)"));
                 }
            }
        }
    }
    return issues;
}

IEnumerable<QAIssue> CheckDoorClearances(double minClearanceFt)
{
    var issues = new List<QAIssue>();
    var doors = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Doors)
        .WhereElementIsNotElementType()
        .Cast<FamilyInstance>();

    foreach (var door in doors)
    {
        // Try Symbol parameter first, then Instance
        var widthParam = door.Symbol.get_Parameter(BuiltInParameter.DOOR_WIDTH) ?? door.get_Parameter(BuiltInParameter.DOOR_WIDTH);
        
        if (widthParam != null && widthParam.AsDouble() < minClearanceFt)
        {
            double widthM = UnitUtils.ConvertFromInternalUnits(widthParam.AsDouble(), UnitTypeId.Meters);
            double minWidthM = UnitUtils.ConvertFromInternalUnits(minClearanceFt, UnitTypeId.Meters);
            issues.Add(new QAIssue(
                door.Id,
                door.Name,
                "Doors",
                $"Door too narrow: {widthM:F2}m < required {minWidthM:F2}m"
            ));
        }
    }
    return issues;
}

void ExportToCsv(List<QAIssue> issues, string directoryPath)
{
    try
    {
        // Use default directory if empty
        if (string.IsNullOrWhiteSpace(directoryPath))
            directoryPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);

        Directory.CreateDirectory(directoryPath);
        
        string fileName = $"{Doc.ProjectInformation.Name}_QA_Report_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
        string fullPath = Path.Combine(directoryPath, fileName);
        
        var csv = new StringBuilder();
        csv.AppendLine("Element ID,Element Name,Category,Issue Description");
        
        foreach (var issue in issues)
        {
            string safeName = issue.ElementName?.Replace("\"", "\"\"") ?? "";
            string safeCategory = issue.Category?.Replace("\"", "\"\"") ?? "";
            string safeDescription = issue.Description?.Replace("\"", "\"\"") ?? "";
            
            csv.AppendLine($"\"{issue.ElementId}\",\"{safeName}\",\"{safeCategory}\",\"{safeDescription}\"");
        }
        
        File.WriteAllText(fullPath, csv.ToString(), Encoding.UTF8);
        Println($"📊 Exported {issues.Count} issues to: {fullPath}");
    }
    catch (Exception ex)
    {
        Println($"❌ Export failed: {ex.Message}");
    }
}

// ===== DATA STRUCTURE =====
class QAIssue
{
    public ElementId ElementId { get; }
    public string ElementName { get; }
    public string Category { get; }
    public string Description { get; }
    
    public QAIssue(ElementId id, string name, string category, string description)
    {
        ElementId = id;
        ElementName = name ?? "Unnamed";
        Category = category ?? "Unknown";
        Description = description;
    }
}

// ===== PARAMETER CLASS =====
class Params
{
    [ScriptParameter(Group: "01. Rooms", Description: "Minimum required room area in square meters.")]
    public double minRoomArea = 10.0;
    
    [ScriptParameter(Group: "01. Rooms", Description: "Minimum required room side length in meters (detects narrow slivers).")]
    public double minRoomSideLength = 2.0;

    [ScriptParameter(Group: "02. Stairs", Description: "Minimum allowed stair riser height in meters.")]
    public double minRiserHeight = 0.150;

    [ScriptParameter(Group: "02. Stairs", Description: "Maximum allowed stair riser height in meters.")]
    public double maxRiserHeight = 0.190;

    [ScriptParameter(Group: "02. Stairs", Description: "Minimum allowed stair tread depth in meters.")]
    public double minTreadDepth = 0.250;
    
    [ScriptParameter(Group: "02. Stairs", Description: "Maximum allowed stair tread depth in meters.")]
    public double maxTreadDepth = 0.350;

    [ScriptParameter(Group: "03. Doors", Description: "Minimum required clear width for doors in meters.")]
    public double minDoorClearance = 0.9;

    [ScriptParameter(Group: "04. Output", Description: "Highlight non-compliant elements in Red in the active view.")]
    public bool highlightIssues = true;

    [ScriptParameter(Group: "04. Output", Description: "Export results to a CSV report.")]
    public bool shouldExportToCsv = false;

    [ScriptParameter(Group: "04. Output", Description: "Directory path for CSV export.", VisibleWhen: "shouldExportToCsv == true")]
    public string outputPath = "C:/Users/Public/Documents";
}