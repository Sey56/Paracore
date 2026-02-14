// 1. Setup
var p = new Params();

// 2. Execution logic
Transact("Hello World", () => {
    Println($"Hello {p.TargetName} from {Doc.Title}!");
});

// 3. Parameters (MUST BE LAST)
public class Params {
    #region Settings
    
    /// <summary>
    /// The name to greet.
    /// </summary>
    public string TargetName { get; set; } = "Paracore User";
    
    #endregion
}
