public class Params
{
    /// Name of the room to get area for.   
    [RevitElements(TargetType = "Room")]
    public string? RoomName { get; set; }

    /// Select multiple rooms to get their areas.
    [RevitElements(TargetType = "Room", MultiSelect = true)]
    public List<string>? SelectedRooms { get; set; }

    /// <summary>
    ///  Click and select a single wall in Revit
    /// </summary>
    [Select(SelectionType.Element)]
    [RevitElements(Category = "Walls")] // <--- The Filter!
    public int SelectedWallId { get; set; }

    [Select(SelectionType.Point)]
    public strin MyPoint { get; set; }

}