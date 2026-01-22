/*
DocumentType: Project
Categories: Tutorials, Audit
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Lists all rooms on a selected level with their numbers and areas. 
Provides interactive 'Select & Zoom' functionality by clicking on rows.

UsageExamples:
- "Audit rooms on Level 1"
- "Show room area table"
*/

using Autodesk.Revit.DB.Architecture;

// 1. Setup Parameters
Params p = new Params();

// 2. Find the selected level
Level? level = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == p.LevelName);

if (level == null)
{
    Println($"⚠️ Level '{p.LevelName}' not found in the project.");
}
else
{
    // 3. Collect Rooms on the specific level
    List<Room> roomsOnLevel = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
        .Cast<Room>()
        .Where(r => r.LevelId == level.Id)
        .ToList();

    if (roomsOnLevel.Count == 0)
    {
        Println($"ℹ️ No rooms found on level '{p.LevelName}'.");
    }
    else
    {
        // 4. Extract data for the interactive table
        var results = roomsOnLevel.Select(rm =>
        {
            // Extract the area parameter (stored in internal units - sq feet)
            var areaParam = rm.get_Parameter(BuiltInParameter.ROOM_AREA);
            double roomArea = areaParam != null ? areaParam.AsDouble() : 0;
            
            // Convert to Square Meters for local standards
            double areaInSqMeters = Math.Round(UnitUtils.ConvertFromInternalUnits(roomArea, UnitTypeId.SquareMeters), 2);

            return new
            {
                ElementId = rm.Id.Value, // 'ElementId' column enables Select & Zoom
                Number = rm.Number,
                Name = rm.Name,
                Area_m2 = areaInSqMeters
            };
        });

        // 5. Display the data
        Table(results);
        Println($"✅ Listed {roomsOnLevel.Count} rooms on {p.LevelName}. Click any row to find the room in Revit.");
    }
}

// 6. Define User Inputs
public class Params
{
    /// <summary>Choose the floor level to audit</summary>
    [RevitElements(TargetType = "Level")]
    [Required]
    public string LevelName { get; set; }
}
