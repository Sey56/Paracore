using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

/*
** MULTI-FILE SCRIPT (Entry Point) **
This is a modular script. You can put all code here OR modularize by creating
other .cs files in this folder (e.g., Utils.cs, Params.cs) and referencing them here.

DocumentType: Project
Categories: Multi-Category
Author: Paracore User
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Modular script template. Add your logic here or organize helpers in separate files.
Globals available: Doc, UIDoc, UIApp, Transact, Println, Show.

UsageExamples:
- "Run script"
*/

// Example: Instantiate parameters from Params.cs (if created)
// var p = new Params();

Println($"Hello from Main.cs in {Doc.Title}!");

// Your modular logic goes here...
public class Params
{
    [RevitElements(TargetType = "Room")]
    public string RoomName {get; set;}
}