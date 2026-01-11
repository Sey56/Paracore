
public class Params
{
    // Mode Selection
    /// <summary>Operation mode</summary>
    public string CreationMode { get; set; } = "RoomBoundaries";
    public static string[] CreationMode_Options => new[] { 
        "RoomBoundaries", "Grid", "Coordinates", "Perimeter" 
    };

    // Common Parameters
    [RevitElements(TargetType = "Level")]
    public string LevelName { get; set; } = "Level 1";

    [RevitElements(TargetType = "WallType")]
    public string WallTypeName { get; set; } = "Generic - 200mm";

    /// <summary>Height in meters</summary>
    public double WallHeightMeters { get; set; } = 3.0;

    /// <summary>Set walls as Room Bounding</summary>
    public bool RoomBounding { get; set; } = true;

    // Room Boundaries Mode Parameters
    /// <summary>Offset from room boundary (positive = outward)</summary>
    public double WallOffsetMm { get; set; } = 0.0;
    public bool WallOffsetMm_Visible => CreationMode == "RoomBoundaries";

    // Grid Mode Parameters
    public double GridSpacingXMeters { get; set; } = 3.0;
    public bool GridSpacingXMeters_Visible => CreationMode == "Grid";

    public double GridSpacingYMeters { get; set; } = 3.0;
    public bool GridSpacingYMeters_Visible => CreationMode == "Grid";

    public int GridCountX { get; set; } = 5;
    public bool GridCountX_Visible => CreationMode == "Grid";

    public int GridCountY { get; set; } = 5;
    public bool GridCountY_Visible => CreationMode == "Grid";

    public double GridOriginXMeters { get; set; } = 0.0;
    public bool GridOriginXMeters_Visible => CreationMode == "Grid";

    public double GridOriginYMeters { get; set; } = 0.0;
    public bool GridOriginYMeters_Visible => CreationMode == "Grid";

    // Coordinates Mode Parameters
    /// <summary>Path to CSV file with wall coordinates</summary>
    public string CsvFilePath { get; set; } = "";
    public bool CsvFilePath_Visible => CreationMode == "Coordinates";

    // Perimeter Mode Parameters
    /// <summary>Use existing model lines as perimeter</summary>
    public bool UseModelLines { get; set; } = false;
    public bool UseModelLines_Visible => CreationMode == "Perimeter";
}
