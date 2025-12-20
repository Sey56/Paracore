using System.Collections.Generic;
using CoreScript.Engine.Globals; // Required for attributes

class Params
{
    // Mode Selection
    [ScriptParameter(Group: "01. Mode", Description: "Operation mode", Options: "RoomBoundaries,Grid,Coordinates,Perimeter")]
    public string creationMode = "RoomBoundaries";

    // Common Parameters
    [ScriptParameter(Group: "02. General")]
    public string levelName = "Level 1";

    [ScriptParameter(Group: "02. General")]
    public string wallTypeName = "Generic - 200mm";

    [ScriptParameter(Group: "02. General")]
    public double wallHeightMeters = 3.0;

    [ScriptParameter(Group: "02. General")]
    public bool roomBounding = true;

    // Room Boundaries Mode Parameters
    [ScriptParameter(Group: "03. Room Boundaries", VisibleWhen: "creationMode == 'RoomBoundaries'")]
    public double wallOffsetMm = 0.0; // Offset from room boundary (positive = outward)

    // Grid Mode Parameters
    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public double gridSpacingXMeters = 3.0;

    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public double gridSpacingYMeters = 3.0;

    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public int gridCountX = 5;

    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public int gridCountY = 5;

    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public double gridOriginXMeters = 0.0;

    [ScriptParameter(Group: "04. Grid", VisibleWhen: "creationMode == 'Grid'")]
    public double gridOriginYMeters = 0.0;

    // Coordinates Mode Parameters
    [ScriptParameter(Group: "05. Coordinates", VisibleWhen: "creationMode == 'Coordinates'")]
    public string csvFilePath = ""; // Path to CSV file with wall coordinates

    // Perimeter Mode Parameters
    [ScriptParameter(Group: "06. Perimeter", VisibleWhen: "creationMode == 'Perimeter'")]
    public bool useModelLines = false; // Use existing model lines as perimeter
}
