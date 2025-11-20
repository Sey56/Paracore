# Feature Plan: The "Working Set" - Enabling Conversational Revit Automation

## 1. User Story

As a Revit user, I want the Paracore agent to remember the elements I've recently created or modified, so that I can have a continuous, multi-step conversation to perform a series of related tasks without having to re-select or re-describe the elements for each step.

## 2. Introduction: The Leap to Stateful, Conversational Automation

The current agent is a stable, stateless command executor. The "Working Set" is the pivotal feature to evolve it into a stateful, context-aware design partner. It provides the agent with a short-term memory of the elements the user is actively working with, enabling true multi-turn, contextual conversations and moving from a "query-execute-reset" loop to a fluid, continuous workflow.

## 3. Core Concept: The "Working Set"

*   **What It Is:** A dynamic, in-memory collection of Revit `ElementId`s that the agent is currently "aware of." This list persists across the user's individual commands and queries.
*   **How It's Managed:**
    *   **Implicitly (Automatic):** Scripts that create, filter, or modify elements will output the resulting `ElementId`s. The agent will automatically capture these and update the Working Set.
    *   **Explicitly (User-Driven):** The user will have direct control over the Working Set with natural language commands, powered by new agent tools (e.g., *"Add selected walls to my working set,"* *"Show what's in my working set,"* *"Clear my working set."*).

## 4. Demonstrative Scenario: A Practical Revit Workflow

---

**1. You: "Create a 30-meter long curved wall."**

*   The agent finds `Create_Curved_Wall.cs` and resolves parameters.
*   The script runs and returns the ID of the new wall. The agent's logic captures this ID.
*   **Agent's Internal State:** `working_set = [12345]`
*   **Agent's Response:** *"Done. I've created the curved wall. It is now your active working set."*
*   **UI Update:** A new "Working Set" panel in the UI now shows "1 Wall".

**2. You: "Now, place five doors on it, evenly spaced."**

*   The agent understands **"it"** refers to the element in the `working_set`.
*   It finds `Array_Doors_On_Wall.cs`, which requires `wallId`. It automatically populates this parameter with `12345` from the `working_set`.
*   After resolving other parameters (e.g., door type), the agent runs the script. The script returns the IDs of the five new doors, specifying that they should **replace** the current working set.
*   **Agent's Internal State:** `working_set = [20001, 20002, 20003, 20004, 20005]`
*   **Agent's Response:** *"I've placed 5 doors on the wall. The doors are now the active working set."*
*   **UI Update:** The "Working Set" panel now shows "5 Doors".

**3. You: "Select them in Revit."**

*   The agent understands **"them"** refers to the `working_set`. It runs a selection tool with the five door IDs.
*   **Agent's Response:** *"Done. The elements in your working set are now selected in the Revit view."*

**4. You: "What material are the walls made of?"**

*   The agent's prompt to the LLM now includes context: *"The user is asking a question. The current working set contains 5 elements of type 'Door'."*
*   **Agent's Response:** *"The current working set contains doors, not walls. Would you like me to find the wall we created earlier and check its material?"*

---

## 5. Implementation Plan

### Step 1: Backend State Management (`rap-server/server/agent/state.py`)

1.  **Update `AgentState`:** Add a new field to the `AgentState` TypedDict:
    ```python
    working_set: List[int] = Field(default_factory=list)
    ```
2.  **Ensure Persistence:** Modify the logic that clears the state between turns (`graph.py`) to **explicitly preserve** the `working_set` field, while other transient fields are reset.

### Step 2: C# Script Output Convention (`CoreScript.Engine`)

1.  **Define Structured Output:** Establish a formal JSON schema for scripts to return when they need to manipulate the working set. The script's final `return` statement will be a JSON string adhering to this schema.

    **JSON Schema:**
    ```json
    {
      "paracore_output_type": "working_set_elements",
      "operation": "replace" | "add" | "remove",
      "element_ids": [123, 456],
      "display_message": "Successfully created 2 walls and added them to your working set."
    }
    ```
    *   `paracore_output_type`: A fixed string to identify this special output.
    *   `operation`: How to modify the agent's `working_set`.
    *   `element_ids`: The list of Revit `ElementId` integers.
    *   `display_message`: The user-facing summary message.

2.  **Update Example Scripts:** Modify a few key scripts (e.g., `Create_Wall.cs`) to demonstrate this new output format.

### Step 3: Backend Agent Logic (`rap-server/server/agent/graph.py` & `tools.py`)

1.  **Create `post_execution_node`:** Add a new node to the LangGraph graph that runs immediately after the `tool_node`.
    *   **Input:** The result from the executed script (`tool_node` output).
    *   **Logic:**
        *   Check if the tool output is a string.
        *   Attempt to parse the string as JSON.
        *   If parsing is successful and `paracore_output_type` is `working_set_elements`:
            *   Update `state['working_set']` based on the `operation` and `element_ids`.
            *   Replace the agent's response message with the `display_message` from the JSON.
        *   If not, pass the original tool output through unchanged (maintaining current summarization behavior).
    *   **Output:** The (potentially modified) agent response message.

2.  **Update Agent Prompt (`prompt.py`):**
    *   Dynamically insert the status of the working set into the system prompt for every turn.
    *   Example Text to Insert: `CONTEXT: The user currently has a 'working set' containing [5 Doors, 2 Windows]. Refer to this working set when the user says 'it', 'them', or 'these'.`
    *   This requires a mechanism to get the types and counts of elements in the working set, which may involve a new, simple internal tool or helper function.

3.  **Create Explicit Management Tools (`tools.py`):**
    *   Implement new tools for direct user control:
        *   `set_working_set(element_ids: List[int])`: Replaces the working set. Can be used with a selection tool.
        *   `add_to_working_set(element_ids: List[int])`
        *   `remove_from_working_set(element_ids: List[int])`
        *   `clear_working_set()`
        *   `get_working_set_summary()`: Returns a string like "Your working set contains: 5 Doors, 2 Windows."

4.  **Enhance Tool-Using Logic (`graph.py`):**
    *   Before calling a tool, inspect its signature. If a tool expects a parameter named `element_ids` (or similar convention) and the `working_set` is populated, automatically inject the `working_set` into that parameter.

### Step 4: Frontend UI (`rap-web`)

1.  **Create `WorkingSetPanel.tsx`:**
    *   A new, small, non-intrusive UI component, perhaps in a corner of the `AgentView.tsx`.
    *   It will display a summary of the working set's contents (e.g., "Working Set: 5 Doors, 2 Windows").
    *   It could also have a small button to clear the working set.

2.  **Update `AgentView.tsx`:**
    *   The agent's response from the backend will now need to include the updated `working_set` summary on every turn.
    *   `AgentView.tsx` will receive this state and pass it as a prop to `WorkingSetPanel.tsx`.
    *   The `/agent/chat` endpoint in `agent_router.py` must be updated to return this additional state.

## 6. Future Horizons

This architecture paves the way for more advanced capabilities:

*   **Dynamic Tool Acquisition:** An agent tool like `find_automation_script_on_github(query)` could search curated repositories, download a `.cs` file, and make it available for the current session.
*   **Advanced State Management:** The Working Set can be made more intelligent with filtering commands like *"from my working set, keep only the elements on Level 2,"* which would trigger a filtering script and update the set with the result.