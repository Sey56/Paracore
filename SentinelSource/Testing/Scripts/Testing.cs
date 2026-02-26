/*
DocumentType: Project
Categories: Template
Author: Paracore Team
Dependencies: RevitAPI 2025+, Paracore.Addin

Description:
This is a top level statement script. Doc, UIDoc, Transact, Println,...
are accessible everywhere in this script or other scripts in the Scripts folder

*/

Params p = new();
string userName = Doc.Application.Username;

Println($"{p.Greeting} {userName}");
Println($"Selected WallType name is: {p.CurrentWallTypes?.Name}");

public class Params
{
    #region parameters

    /// Greeting message
    public string Greeting { get; set; } = "Welcome to Paracore!";

    /// <summary>
    /// Click the compute button and select 
    /// a wall type from the dropdown
    /// </summary>
    public WallType? CurrentWallTypes { get; set; }

    #endregion
}
