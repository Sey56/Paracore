/*
DocumentType: Project
Categories: Architectural
Author: Paracore Team
Dependencies: CoreScript.Engine, Paracore.Addin, Revit 2025

Description:
Just a sample file to experiment with the new
project based architecture

*/


// 1. Setup
var p = new Params();

// 2. Execution logic
Transact("Hello World", () => {
    Println($"Hello {p.TargetName} from {Doc.Title}!");
});

// 3. Parameters (MUST BE LAST)
