using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Tutorials, Audit
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
A data quality auditing script that identifies elements with missing or empty 
'Mark' or 'Comments' parameters. Teaches advanced filtering and string validation.

UsageExamples:
- "Check wall comments health"
- "Find elements with empty marks"
*/

// 1. Initialize User Parameters
var p = new Params();

// 2. Select Category mapping
BuiltInCategory category = p.TargetCategory switch
{
    "Walls" => BuiltInCategory.OST_Walls,
    "Doors" => BuiltInCategory.OST_Doors,
    "Windows" => BuiltInCategory.OST_Windows,
    "Rooms" => BuiltInCategory.OST_Rooms,
    _ => BuiltInCategory.OST_Walls
};

// 3. Collect Elements of the chosen category
var elements = new FilteredElementCollector(Doc)
    .OfCategory(category)
    .WhereElementIsNotElementType()
    .ToList();

// 4. Audit Logic: Filter for "Dirty" data
var offenders = elements.Select(e => {
    // Check 'Mark' parameter
    var markParam = e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK);
    string mark = markParam?.AsString() ?? "";

    // Check 'Comments' parameter (Instance)
    var commentParam = e.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
    string comment = commentParam?.AsString() ?? "";

    bool hasIssues = string.IsNullOrWhiteSpace(mark) || string.IsNullOrWhiteSpace(comment);

    return new {
        Element = e,
        Mark = mark,
        Comment = comment,
        HasIssues = hasIssues
    };
})
.Where(x => x.HasIssues)
.ToList();

// 5. Display Results
if (offenders.Count == 0)
{
    Println($"✨ Model Health Check: 0 issues found in {p.TargetCategory}. Great work!");
}
else
{
    var tableData = offenders.Select(x => new {
        ElementId = x.Element.Id.Value, // Interactive Selection
        Type = x.Element.Name,
        MarkStatus = string.IsNullOrWhiteSpace(x.Mark) ? "❌ EMPTY" : x.Mark,
        CommentStatus = string.IsNullOrWhiteSpace(x.Comment) ? "❌ EMPTY" : "OK",
        CurrentComment = x.Comment
    });

    Table(tableData);
    Println($"⚠️ Found {offenders.Count} elements in {p.TargetCategory} with missing data.");
}

// 6. Define Parameters
class Params
{
    /// <summary>Choose category to audit</summary>
    [Required]
    public string TargetCategory { get; set; } = "Walls";

    // This property provides the options for the dropdown in the UI
    public List<string> TargetCategory_Options => new List<string> { "Walls", "Doors", "Windows", "Rooms" };
}
