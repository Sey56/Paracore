using Autodesk.Revit.DB;
using System.Collections.Generic;

/*
DocumentType: Project
Author: Paracore Team
Description: Test script for region-based parameter grouping
*/

var p = new Params();

Println($"Wall Type: {p.WallTypeName}");
Println($"Level: {p.LevelName}");
Println($"Tile Spacing: {p.TileSpacing}");
Println($"Randomize: {p.RandomizeOffset}");

public class Params
{
    #region Revit Selection
    /// Pick a Wall Type from the model
    [RevitElements(TargetType = "WallType"), Required]
    public string WallTypeName { get; set; }
    
    /// Pick a specific Level
    [RevitElements(TargetType = "Level"), Required]
    public string LevelName { get; set; } = "Level 1";
    #endregion

    #region Tile Settings
    /// Spacing between tiles in meters
    [Range(0.1, 10.0, 0.1), Unit("m")]
    public double TileSpacing { get; set; } = 1.0;
    
    /// Enable random offset
    public bool RandomizeOffset { get; set; } = false;
    
    /// Maximum offset distance
    [Unit("m")]
    public double MaxOffset { get; set; } = 0.1;
    
    public bool MaxOffset_Visible => RandomizeOffset;
    #endregion

    #region Advanced Options
    /// Custom setting
    public string CustomSetting { get; set; } = "Default";
    #endregion
}
