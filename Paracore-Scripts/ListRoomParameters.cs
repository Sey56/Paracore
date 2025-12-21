using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.Linq;
using CoreScript.Engine.Globals; // For attributes

/*
DocumentType: Project
Categories: Architecture, Data
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Select a Room from a dynamic dropdown list and view its detailed parameters in a Table.

UsageExamples:
- "Print room parameters"

*/

var p = new Params();



if (string.IsNullOrEmpty(p.roomName)) 
{
    Println("⚠️ No room selected. Please select a room and run again.");
    return;
}

Println($"🔍 Searching for Room: '{p.roomName}'...");

// Find the room by Name only (case-insensitive)
Room room = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .WhereElementIsNotElementType()
    .Cast<Room>()
    .FirstOrDefault(r => string.Equals((r.Name ?? "").Trim(), (p.roomName ?? "").Trim(), StringComparison.OrdinalIgnoreCase));

if (room == null)
{
    Println($"❌ Room not found: {p.roomName}");
    Show("message", $"Room not found: {p.roomName}");
    return;
}

Println($"✅ Found Room: {room.Name} ({room.Number})");

// Collect parameters (simple Name/Value/Type list)
List<object> paramData = new List<object>();
var csvLines = new List<string> { "Name,Value,Type,Group" }; // Header for CSV

foreach (Parameter param in room.Parameters)
{
    string name = param.Definition?.Name ?? "(unnamed)";
    string value = param.AsValueString() ?? param.AsString();
    if (string.IsNullOrEmpty(value))
    {
        switch (param.StorageType)
        {
            case StorageType.Integer: value = param.AsInteger().ToString(); break;
            case StorageType.Double: value = param.AsDouble().ToString("F2"); break;
            case StorageType.ElementId: value = param.AsElementId().ToString(); break;
            default: value = "(null)"; break;
        }
    }
    
    // Group Name (Modern)
    string groupName = "Other";
    if (param.Definition != null) 
    {
        try { groupName = LabelUtils.GetLabelForGroup(param.Definition.GetGroupTypeId()); } catch {}
    }

    paramData.Add(new { Name = name, Value = value, Type = param.StorageType.ToString(), Group = groupName });

    // Sanitize for CSV (simple quote escape)
    string safeName = $"\"{name.Replace("\"", "\"\"")}\"";
    string safeValue = $"\"{value.Replace("\"", "\"\"")}\"";
    string safeGroup = $"\"{groupName.Replace("\"", "\"\"")}\"";
    csvLines.Add($"{safeName},{safeValue},{param.StorageType},{safeGroup}");
}

Show("table", paramData);
Println($"✅ Listed {paramData.Count} parameters for '{room.Name}'.");

// --- Export Logic ---
if (!string.IsNullOrWhiteSpace(p.exportCsvPath))
{
    try
    {
        string path = p.exportCsvPath;
        // Basic path sanitization
        if (!System.IO.Path.IsPathRooted(path))
        {
             // If relative, maybe defaulting to docs or failing? Let's assume absolute from picker.
             // But if user typed 'test.csv', where does it go? Desktop is a safe bet if just filename.
             if (!path.Contains("\\") && !path.Contains("/"))
                 path = System.IO.Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.Desktop), path);
        }

        System.IO.File.WriteAllLines(path, csvLines);
        Println($"💾 Exported to CSV: {path}");
        Show("message", $"Successfully exported to {path}");
    }
    catch (Exception ex)
    {
        Println($"❌ Failed to export CSV: {ex.Message}");
    }
}


// =================================================================================
// PARAMETERS CLASS
// =================================================================================
class Params
{
    [ScriptParameter(Group: "Selection", Description: "Select a room to analyze.", Computable: true)]
    public string roomName = "";

    [ScriptParameter(Group: "Export", Description: "Optional: Path to save CSV export.", InputType: "SaveFile")]
    public string exportCsvPath = "";

    public List<string> roomName_Options()
    {
        var rooms = new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType()
            .Cast<Room>()
            .Where(r => r.Area > 0) // Only placed rooms
            .Select(r => (r.Name ?? "").Trim())
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .OrderBy(n => n)
            .ToList();

        if (rooms.Count == 0)
            throw new InvalidOperationException("No rooms found in the document. Please add rooms before running this script.");

        return rooms;
    }
}
