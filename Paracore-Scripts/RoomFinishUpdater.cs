using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

/*
DocumentType: Project
Categories: Architecture, Data, Import/Export
Author: Seyoum Hagos
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Demonstrates File Picker usage for both INPUT and OUTPUT:
- INPUT: Read room names and floor finishes from a CSV file
- OUTPUT: Export a summary of applied changes to a CSV file

UsageExamples:
- "Update room finishes from CSV"
- "Import room data from file"
- "Bulk update room parameters"

CSV Format (Input):
RoomName,FloorFinish
Kitchen,Ceramic Tile
Bedroom,Carpet
Bathroom,Porcelain Tile
*/

var p = new Params();

// =================================================================================
// STEP 1: READ INPUT CSV FILE
// =================================================================================
if (string.IsNullOrWhiteSpace(p.InputCsvPath))
{
    Println("⚠️ No input CSV file selected. Please select a file and run again.");
    return;
}

if (!File.Exists(p.InputCsvPath))
{
    Println($"❌ File not found: {p.InputCsvPath}");
    return;
}

Println($"📂 Reading CSV file: {p.InputCsvPath}");

// Parse CSV
var roomUpdates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
try
{
    var lines = File.ReadAllLines(p.InputCsvPath);
    if (lines.Length < 2)
    {
        Println("❌ CSV file is empty or has no data rows.");
        return;
    }

    // Skip header row (line 0)
    for (int i = 1; i < lines.Length; i++)
    {
        var line = lines[i].Trim();
        if (string.IsNullOrWhiteSpace(line)) continue;

        var parts = line.Split(',');
        if (parts.Length < 2) continue;

        string roomName = parts[0].Trim().Trim('"');
        string floorFinish = parts[1].Trim().Trim('"');

        if (!string.IsNullOrWhiteSpace(roomName) && !string.IsNullOrWhiteSpace(floorFinish))
        {
            roomUpdates[roomName] = floorFinish;
        }
    }

    Println($"✅ Parsed {roomUpdates.Count} room updates from CSV.");
}
catch (Exception ex)
{
    Println($"❌ Failed to read CSV: {ex.Message}");
    return;
}

// =================================================================================
// STEP 2: APPLY UPDATES TO REVIT ROOMS
// =================================================================================
Println("\n🔄 Applying updates to Revit rooms...");

var rooms = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .WhereElementIsNotElementType()
    .Cast<Room>()
    .Where(r => r.Area > 0) // Only placed rooms
    .ToList();

var updateLog = new List<Dictionary<string, object>>();
int successCount = 0;
int notFoundCount = 0;

Transact("Update Room Finishes", () =>
{
    foreach (var kvp in roomUpdates)
    {
        string targetRoomName = kvp.Key;
        string newFloorFinish = kvp.Value;

        // Find room (case-insensitive)
        var room = rooms.FirstOrDefault(r => 
            string.Equals((r.Name ?? "").Trim(), targetRoomName, StringComparison.OrdinalIgnoreCase));

        if (room == null)
        {
            Println($"⚠️ Room not found: '{targetRoomName}'");
            updateLog.Add(new Dictionary<string, object> {
                { "RoomName", targetRoomName },
                { "Status", "Not Found" },
                { "OldFinish", "" },
                { "NewFinish", newFloorFinish }
            });
            notFoundCount++;
            continue;
        }

        // Get the Floor Finish parameter
        Parameter floorFinishParam = room.LookupParameter("Floor Finish");
        if (floorFinishParam == null || floorFinishParam.IsReadOnly)
        {
            Println($"⚠️ 'Floor Finish' parameter not found or read-only for room: {room.Name}");
            updateLog.Add(new Dictionary<string, object> {
                { "RoomName", room.Name },
                { "Status", "Parameter Error" },
                { "OldFinish", "" },
                { "NewFinish", newFloorFinish }
            });
            continue;
        }

        // Store old value
        string oldValue = floorFinishParam.AsString() ?? "(empty)";

        // Set new value
        floorFinishParam.Set(newFloorFinish);
        
        Println($"✅ Updated '{room.Name}': {oldValue} → {newFloorFinish}");
        updateLog.Add(new Dictionary<string, object> {
            { "RoomName", room.Name },
            { "Status", "Updated" },
            { "OldFinish", oldValue },
            { "NewFinish", newFloorFinish }
        });
        successCount++;
    }
});

Println($"\n📊 Summary: {successCount} updated, {notFoundCount} not found.");

// =================================================================================
// STEP 3: EXPORT SUMMARY (OPTIONAL)
// =================================================================================
if (!string.IsNullOrWhiteSpace(p.OutputCsvPath))
{
    try
    {
        var csvLines = new List<string> { "RoomName,Status,OldFinish,NewFinish" };
        
        foreach (var log in updateLog)
        {
            string roomName = $"\"{log["RoomName"]}\"";
            string status = $"\"{log["Status"]}\"";
            string oldFinish = $"\"{log["OldFinish"]}\"";
            string newFinish = $"\"{log["NewFinish"]}\"";
            csvLines.Add($"{roomName},{status},{oldFinish},{newFinish}");
        }

        File.WriteAllLines(p.OutputCsvPath, csvLines);
        Println($"💾 Exported summary to: {p.OutputCsvPath}");
    }
    catch (Exception ex)
    {
        Println($"❌ Failed to export summary: {ex.Message}");
    }
}

// Show results in table
Show("table", updateLog);
Println($"\n✅ Script completed. Updated {successCount} rooms.");


// =================================================================================
// PARAMETERS CLASS
// =================================================================================
class Params
{
    #region Input
    /// <summary>CSV file with room names (RoomName,FloorFinish)</summary>
    [ScriptParameter(InputType = "File")]
    public string InputCsvPath { get; set; } = "";
    #endregion

    #region Output
    /// <summary>Optional: Export summary of changes</summary>
    [ScriptParameter(InputType = "SaveFile")]
    public string OutputCsvPath { get; set; } = "";
    #endregion
}
