using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
Creates a wall along the X-axis at a user-defined level with specified length and height.
Parameters allow customizing geometry in meters. Great for layout prototyping.

UsageExamples:
- "Create a 10m x 4m wall on 'Level 2'":
- "Create a wall of 8m length and 3m height on 'Level 1'":
    
*/


// [Parameter]
string levelName = "Level 1";
// [Parameter]
double wallLengthMeters = 6.0;
// [Parameter]
double wallHeightMeters = 3.0;

// Other Top-Level Statements
double lengthFt = UnitUtils.ConvertToInternalUnits(wallLengthMeters, UnitTypeId.Meters);
double heightFt = UnitUtils.ConvertToInternalUnits(wallHeightMeters, UnitTypeId.Meters);
XYZ pt1 = new XYZ(-lengthFt / 2, 0, 0);
XYZ pt2 = new XYZ(lengthFt / 2, 0, 0);
Line wallLine = Line.CreateBound(pt1, pt2);

Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == levelName); 

if (level == null)
{
    Println($"❌ Level '{levelName}' not found.");
}

Println($"Preparing to create wall of {wallLengthMeters}m × {wallHeightMeters}m on '{levelName}'...");

Wall? createdWall = null;

// Write operations inside a transaction
Transact("Create Wall", doc =>
{
    Wall wall = Wall.Create(doc, wallLine, level.Id, false);
    wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.Set(heightFt);
    createdWall = wall;
});

if (createdWall != null)
{
    long wallId = createdWall.Id.Value;
    // Using the helper function for cleaner output
    // Print the JSON payload and exit with success code
    Println(BuildWorkingSetJson(
        "replace",
        [wallId],
        "✅ Wall created and added to the working set."
    ));
    return 0;
}

// Helper function to build the JSON string for working set updates
static string BuildWorkingSetJson(string operation, long[] elementIds, string message) {
    string idsJson = string.Join(",", elementIds);
    // Using C# interpolated strings, escaping internal quotes and curly braces for literal JSON output
    return $"{{ \"paracore_output_type\": \"working_set_elements\", \"operation\": \"{operation}\", \"element_ids\": [{idsJson}], \"display_message\": \"{message}\" }}";
}

// Using the helper function for error return: print JSON and exit with non-zero code
Println(BuildWorkingSetJson("none", [], "Error: Wall creation failed to produce an element."));
return 1;
