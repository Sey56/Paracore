using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Selection, Working Set
Author: Paracore Agent
Description: Use this script to add the user's currently selected Revit elements to the working set. It gets the Element IDs of all currently selected elements in the active Revit view and adds them. This is the correct tool to use when the user asks to "add the selection to the working set" or a similar phrase.

UsageExamples:
- "add selected elements to my working set"
- "get current selection and add it to the set"
*/

ICollection<ElementId> selectedIds = UIDoc.Selection.GetElementIds();

if (selectedIds == null || selectedIds.Count == 0)
{
    Println("No elements are currently selected in Revit. Please select some elements and try again.");
    // Set internal data for the agent, but don't show it to the user.
    SetInternalData(BuildWorkingSetJson("none", []));
    return 1; // Return failure code
}
else
{
    // Convert ElementId objects to a list of long integers
    List<long> id_longs = selectedIds.Select(id => id.Value).ToList();
    
    Println($"✅ Adding {id_longs.Count} selected element(s) to the working set.");

    // Set internal data for the agent to process
    SetInternalData(BuildWorkingSetJson(
        "add",
        [.. id_longs]
    ));
    return 0; // Return success code
}


// Helper function to build the JSON string for working set updates
static string BuildWorkingSetJson(string operation, long[] elementIds) {
    string idsJson = string.Join(",", elementIds);
    return $"{{ \"paracore_output_type\": \"working_set_elements\", \"operation\": \"{operation}\", \"element_ids\": [{idsJson}] }}";
}
