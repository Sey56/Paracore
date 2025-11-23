using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Walls, Modify
Author: Paracore Agent
Description: Modifies a specified parameter for a list of wall elements provided by the agent's working set.

UsageExamples:
- "Change the height of walls in my working set to 4 meters"
- "Set the 'Unconnected Height' of the walls to 3.5 meters"
*/

// This is NOT a user parameter. The backend will replace this line
// with C# code that initializes 'targetWallIds' with the actual working set Element IDs.
List<ElementId> targetWallIds; // __INJECT_WORKING_SET__

// [Parameter]
string parameterName = "WALL_USER_HEIGHT_PARAM"; // Built-in parameter name or a string parameter name
// [Parameter]
double newValue = 3.0; // New value for the parameter
// [Parameter]
string unitType = "Meters"; // Unit type of newValue (e.g., "Meters", "Feet", "Millimeters")

int modifiedCount = 0;
List<string> errorMessages = new List<string>();

// We now expect targetWallIds to be injected by the backend.
// If it's null (e.g., injection failed or no working set), handle the error.
if (targetWallIds == null || targetWallIds.Count == 0)
{
    Println("❌ No wall IDs provided for modification (working set is empty or injection failed).");
    return 1; // Indicate failure
}

int skippedCount = 0;

Transact("Modify Wall Parameters", doc =>
{
    foreach (ElementId wallElementId in targetWallIds)
    {
        try
        {
            Wall? wall = doc.GetElement(wallElementId) as Wall;

            if (wall == null)
            {
                // Silently skip non-wall elements
                skippedCount++;
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
                errorMessages.Add($"Parameter '{parameterName}' not found for Wall ID {wallElementId.Value}.");
                continue;
            }

            if (param.IsReadOnly)
            {
                errorMessages.Add($"Parameter '{parameterName}' for Wall ID {wallElementId.Value} is read-only.");
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
        }
        catch (Exception ex)
        {
            errorMessages.Add($"Error modifying Wall ID {wallElementId.Value}: {ex.Message}");
        }
    }
});

if (modifiedCount > 0)
{
    Println($"✅ Successfully modified {modifiedCount} wall(s).");
    Println($"SUMMARY: Successfully modified {modifiedCount} wall(s) with parameter '{parameterName}' set to {newValue} {unitType}.");
}
else
{
    Println("⚠️ No walls were modified.");
}

if (skippedCount > 0)
{
    Println($"ℹ️ Skipped {skippedCount} non-wall element(s) from the working set.");
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
