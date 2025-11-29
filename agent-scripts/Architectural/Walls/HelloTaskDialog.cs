
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

/*
DocumentType: Project
Categories: Architectural, Structural, MEP
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin


Description:
Displayes a Task Dialog with a Hello World message.
UsageExamples:
- "Hello Task Dialog"
- "Task Dialog Example"
*/

// [Parameter]
string name = "Revit";

TaskDialog.Show("Hello Task Dialog", $"Hello, {name}!");
