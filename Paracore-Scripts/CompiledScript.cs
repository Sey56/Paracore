using static CoreScript.Engine.Globals.ScriptApi;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;

#line 25 "Main.cs"

/*
** MULTI-FILE SCRIPT (Entry Point) **
This is a modular script. You can put all code here OR modularize by creating
other .cs files in this folder (e.g., Utils.cs, Params.cs) and referencing them here.

DocumentType: Project
Categories: Multi-Category
Author: Paracore User
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Modular script template. Add your logic here or organize helpers in separate files.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Show.

UsageExamples:
- "Run script"
*/

// Example: Instantiate parameters from Params.cs (if created)
// var p = new Params();

Params p = new();

// Room? room = new FilteredElementCollector(Doc)
//     .OfCategory(BuiltInCategory.OST_Rooms)
//     .WhereElementIsNotElementType()
//     .Cast<Room>().FirstOrDefault(rm => rm.Name == p.RoomName);

List<Room> selectedRooms = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .WhereElementIsNotElementType()
    .Cast<Room>()
    .Where(rm => p.SelectedRooms != null && p.SelectedRooms.Contains(rm.Name))
    .ToElements();

// Print selected rooms and their areas in square meters

if (selectedRooms.Count > 0)
{
    foreach (Room selectedRoom in selectedRooms)
    {
CoreScript.Engine.Globals.ExecutionGlobals.CheckTimeout();        double areaInSquareMeters = UnitUtils.ConvertFromInternalUnits(selectedRoom.Area, UnitTypeId.SquareMeters);
        Println($"Selected Room '{selectedRoom.Name}' has an area of {areaInSquareMeters:F2} m².");
    }
}
else
{
    Println("No rooms selected.");
}

// Print room area in square meters
// if (room == null)
// {
//     Println($"Room '{p.RoomName}' not found.");
// }
// else
// {
//     double areaInSquareMeters = UnitUtils.ConvertFromInternalUnits(room.Area, UnitTypeId.SquareMeters);
//     Println($"Room '{p.RoomName}' has an area of {areaInSquareMeters:F2} m².");
// }

#line 1 "Params.cs"

public class Params
{
    /// Name of the room to get area for.   
    [RevitElements(TargetType = "Room")]
    public string? RoomName { get; set; }
 ="Balcony 100";
    /// Select multiple rooms to get their areas.
    [RevitElements(TargetType = "Room", MultiSelect = true)]
    public List<string>? SelectedRooms { get; set; }
 =new System.Collections.Generic.List<string> { "Back Room 2" };
    /// <summary>
    ///  Click and select a single wall in Revit
    /// </summary>
    [Select(SelectionType.Element)]
    [RevitElements(Category = "Walls")] // <--- The Filter!
    public int SelectedWallId { get; set; }
 =388802;
    [Select(SelectionType.Point)]
    public strin MyPoint { get; set; }
 ="-39.6981627296588,-26.5748031496063,0";
}