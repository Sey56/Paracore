public class Params {
    #region Settings
    
    /// <summary>
    /// The name to greet.
    /// </summary>
    public string TargetName { get; set; } = "Paracore User";

    public Wall MyWall {get; set;}

    [RevitElements(Category = "Doors")]
    public FamilySymbol MyDoor {get; set;}

    public BuiltInParameter MyParameter {get; set;}
    
    #endregion
}
