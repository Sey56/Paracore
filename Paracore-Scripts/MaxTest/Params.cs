using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;

public class Params
{

    #region Room Selection

    /// Select multiple rooms to get their areas.
    [RevitElements(TargetType = "Room", MultiSelect = true)]
    public List<string> SelectedRooms { get; set; } = new();

    #endregion

    #region Interactive Selection

    /// <summary>
    /// Click and select a single wall in Revit
    /// </summary>
    [Select(SelectionType.Element)]
    public long SelectedWallId { get; set; }

    /// <summary>
    /// Point selection requires the XYZ type
    /// </summary>
    [Select(SelectionType.Element)]
    public long BaseLevel { get; set; }

    [Select(SelectionType.Edge)]
    public Reference? MyEdge { get; set; }

    #endregion

}