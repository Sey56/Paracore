# Testing Plan: The "Working Set" Feature

This document outlines the steps to test the end-to-end functionality of the new "Working Set" feature.

---

### Test Case 1: Implicit Creation and Contextual Follow-Up

**Goal:** Verify that a script that creates an element automatically adds it to the working set, and that the agent can use this context in a follow-up command.

**Steps:**

1.  **Start a new chat** with the Paracore agent.
2.  **User Prompt:** Enter the following message:
    ```
    Create a wall
    ```
3.  The agent should respond that it found the `Create_Wall.cs` script and present its parameters. Click **"Approve"** in the HITL modal to run the script with default parameters.
4.  **Verification (Step 1):**
    *   **Expected Agent Response:** The agent should respond with a message similar to: `✅ Wall created and added to the working set.`
    *   **Expected UI Change:** The new "Working Set" panel should appear in the UI, displaying: `1 element in working set`.
5.  **User Prompt (Follow-up):** After the wall is created, enter the following new message:
    ```
    what is its ID?
    ```
    *(Note: This is a simple test to see if the LLM uses the working set context. It may not have a specific tool to get an ID, but its response should indicate it understands what "it" refers to.)*
6.  **Verification (Step 2):**
    *   **Expected Agent Behavior:** The agent's response should acknowledge that "it" refers to the wall in the working set. An ideal response would be something like: *"The element in your working set has the ID: [ID of the created wall]."*. The key is that it doesn't ask "what do you mean by 'it'?".

---

### Test Case 2: Explicit Working Set Management (Clearing)

**Goal:** Verify that the user can explicitly clear the working set using a natural language command.

**Prerequisite:** Complete Test Case 1, so there is an active working set.

**Steps:**

1.  **User Prompt:** Enter the following message:
    ```
    clear my working set
    ```
2.  **Verification:**
    *   **Expected Agent Response:** The agent should use the `clear_working_set` tool and respond with: `Working set has been cleared.`
    *   **Expected UI Change:** The "Working Set" panel should disappear from the UI.

---

### Test Case 3: Explicit Working Set Management (Adding from Selection)

**Goal:** Verify that the user can add currently selected Revit elements to the working set.

**Setup:**

1.  This test requires a script that can retrieve the IDs of currently selected elements in Revit. Please create the following **single-file script** named `Get_Selection.cs` in your `agent-scripts` folder:

    ```csharp
    /*
    DocumentType: Project
    Categories: Revit, Selection
    Author: Paracore Agent
    Description: Gets the Element IDs of all currently selected elements in the active Revit view.
    */
    using Autodesk.Revit.DB;
    using Autodesk.Revit.UI;
    using System.Collections.Generic;
    using System.Linq;

    // Get the currently selected element IDs
    ICollection<ElementId> selectedIds = UIDoc.Selection.GetElementIds();

    if (selectedIds.Count == 0)
    {
        return @"{""display_message"": ""No elements are currently selected in Revit. Please select some elements and try again."" }";
    }

    // Convert ElementId objects to a list of long integers
    List<long> id_longs = selectedIds.Select(id => id.Value).ToList();

    // Format the list of longs into a comma-separated string for the JSON array
    string ids_json_array = string.Join(",", id_longs);
    string message = $"Added {id_longs.Count} selected element(s) to the working set.";

    return $@"{{""paracore_output_type"": ""working_set_elements"", ""operation"": ""add"", ""element_ids"": [{ids_json_array}], ""display_message"": ""{message}""}}";
    ```
2.  In the Revit application, manually select 2 or 3 elements (e.g., walls, doors).
3.  Ensure your working set in the agent is empty (if not, run `clear my working set`).

**Steps:**

1.  **User Prompt:** Enter the following message:
    ```
    get selected elements
    ```
2.  The agent should find and execute the `Get_Selection.cs` script.
3.  **Verification:**
    *   **Expected Agent Response:** `Added 2 selected element(s) to the working set.` (or however many you selected).
    *   **Expected UI Change:** The "Working Set" panel should appear or update to show `2 elements in working set`.

---
Please perform these tests and let me know the results. This will help us confirm that the core mechanics of the new feature are working as expected.
