using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Walls, Modify
Author: Paracore Agent
Description: Modifies a specified parameter for a list of wall elements, which are provided as a comma-separated string of IDs. This script is designed to operate on elements from the agent's working set.

UsageExamples:
- "Change the height of walls in my working set to 4 meters"
- "Set the 'Unconnected Height' of walls '12345,67890' to 3.5 meters"
*/

// This is NOT a user parameter. It's a placeholder that the backend will replace
// with the actual working set IDs before execution.
string wallIdsCsv = "__WORKING_SET_IDS__"; 

// [Parameter]
string parameterName = "WALL_USER_HEIGHT_PARAM"; // Built-in parameter name or a string parameter name
// [Parameter]
double newValue = 3.0; // New value for the parameter
// [Parameter]
string unitType = "Meters"; // Unit type of newValue (e.g., "Meters", "Feet", "Millimeters")

int modifiedCount = 0;
List<long> successfullyModifiedIds = new List<long>();
List<string> errorMessages = new List<string>();

if (string.IsNullOrWhiteSpace(wallIdsCsv))
{
    Println("❌ No wall IDs provided. Please specify a comma-separated string of wall IDs.");
    return 1; // Indicate failure
}

// Parse the CSV string into a list of longs
List<long> wallIds = wallIdsCsv.Split(',')
                               .Where(s => long.TryParse(s.Trim(), out _))
                               .Select(s => long.Parse(s.Trim()))
                               .ToList();

if (wallIds.Count == 0)
{
    Println("❌ The provided wall IDs string was empty or contained no valid IDs.");
    return 1;
}

Transact("Modify Wall Parameters", doc =>
{
    foreach (long idLong in wallIds)
    {
        try
        {
            ElementId wallElementId = new ElementId(idLong);
            Wall? wall = doc.GetElement(wallElementId) as Wall;

            if (wall == null)
            {
                errorMessages.Add($"Wall with ID {idLong} not found or is not a Wall element.");
                continue;
            }

            Parameter? param = wall.LookupParameter(parameterName);

            // Try to find by BuiltInParameter if parameterName is a valid enum string
            if (param == null && Enum.TryParse<BuiltInParameter>(parameterName, out BuiltInParameter bip))
            {
                param = wall.get_Parameter(bip);
            }

            if (param == null)
            {
                errorMessages.Add($"Parameter '{parameterName}' not found for Wall ID {idLong}.");
                continue;
            }

            if (param.IsReadOnly)
            {
                errorMessages.Add($"Parameter '{parameterName}' for Wall ID {idLong} is read-only.");
                continue;
            }

            // Convert value if necessary based on unitType
            double internalValue = newValue;
            if (!string.IsNullOrEmpty(unitType))
            {
                ForgeTypeId forgeTypeId = UnitTypeId.Meters; // Default to meters

                if (unitType.Equals("Feet", StringComparison.OrdinalIgnoreCase)) forgeTypeId = UnitTypeId.Feet;
                else if (unitType.Equals("Millimeters", StringComparison.OrdinalIgnoreCase)) forgeTypeId = UnitTypeId.Millimeters;
                else if (unitType.Equals("Inches", StringComparison.OrdinalIgnoreCase)) forgeTypeId = UnitTypeId.Inches;
                
                internalValue = UnitUtils.ConvertToInternalUnits(newValue, forgeTypeId);
            }

            if (param.StorageType == StorageType.Double)
            {
                param.Set(internalValue);
            }
            else if (param.StorageType == StorageType.Integer)
            {
                param.Set((int)Math.Round(internalValue));
            }
            
            modifiedCount++;
            successfullyModifiedIds.Add(idLong);
        }
        catch (Exception ex)
        {
            errorMessages.Add($"Error modifying Wall ID {idLong}: {ex.Message}");
        }
    }
});

if (modifiedCount > 0)
{
    Println($"✅ Successfully modified {modifiedCount} of {wallIds.Count} specified wall(s).");
}
else
{
    Println("⚠️ No walls were modified.");
}

if (errorMessages.Any())
{
    Println("Encountered errors:");
    foreach (string error in errorMessages)
    {
        Println($"  - {error}");
    }
    return 1; // Indicate partial or full failure
}

return 0; // Indicate success
