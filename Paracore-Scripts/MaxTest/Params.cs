public class Params
{

    #region Room Selection

    /// Select multiple rooms to get their areas.
    [RevitElements(TargetType = "Room")]
    public List<string> SelectedRooms { get; set; }

    #endregion

    #region Interactive Selection

    /// <summary>
    /// Click and select a single wall in Revit
    /// </summary>
    [Select(SelectionType.Element)]
    public long SelectedWallId { get; set; }

    /// <summary>
    /// Select a level
    /// </summary>
    [Select(SelectionType.Element)]
    public long BaseLevel { get; set; }

    [Select(SelectionType.Edge)]
    public Referenc? MyEdge { get; set; }

    #endregion

}