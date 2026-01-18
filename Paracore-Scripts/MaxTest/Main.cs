using Autodesk.Revit.DB.Architecture;

/*
Description: Calculates areas for selected rooms.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Table.
*/

Params p = new();

// Logic: Read-only operations (Filtering and Calculation)
if (p.SelectedRooms != null && p.SelectedRooms.Any())
{
    // FIX: Changed .ToElements() to .ToList() 
    // .ToElements() only works directly on a FilteredElementCollector.
    // Since we used .Cast<Room>(), we must use .ToList().
    List<Room> selectedRooms = new FilteredElementCollector(Doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
        .Cast<Room>()
        .Where(rm => p.SelectedRooms.Contains(rm.Name))
        .ToElements();

    if (selectedRooms.Count > 0)
    {
        foreach (Room selectedRoom in selectedRooms)
        {
            // Revit 2025: Internal units (sqft) to SquareMeters
            double areaInSquareMeters = UnitUtils.ConvertFromInternalUnits(selectedRoom.Area, UnitTypeId.SquareMeters);
            Println($"Selected Room '{selectedRoom.Name}' has an area of {areaInSquareMeters:F2} m².");
        }
    }
    else
    {
        Println("Selected room names were not found in the current document.");
    }
}
else
{
    Println("No rooms selected in the parameters pane.");
}