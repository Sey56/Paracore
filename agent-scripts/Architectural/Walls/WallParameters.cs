using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: General, Prototyping
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin

Description:
Lists all parameters of the first wall found in the active Revit document, including name, value, and storage type.

UsageExamples:
- "List wall parameters":
*/

// Comment just to test git commit
// Comment just to test git pull

// Top-Level Statements
// Find the first wall in the document
Wall? wall = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .FirstOrDefault();

if (wall == null)
{
    Println("No wall found in the document.");
    Show("message", "No wall found in the document.");
    return;
}

// Collect parameters
List<object> paramData = [];
foreach (Parameter param in wall.Parameters)
{
    string paramName = param.Definition.Name;
    string paramValue = param.AsValueString() ?? param.AsString() ?? "(null)";
    string paramType = param.StorageType.ToString();

    paramData.Add(new
    {
        Name = paramName,
        Value = paramValue,
        Type = paramType
    });
}

// Display in table format
Show("table", paramData);

Println($"✅ Listed {paramData.Count} parameters from the first wall.");
