### Your Idea: A Caching Strategy

Your suggestion is essentially a caching mechanism.

*   **How it would work:** The agent remembers the scripts it found for "create a wall". If the next query is "create a wall with a height of 10ft", it would first check its cached list.
*   **Pros:** This is faster. It avoids re-searching the entire script library for closely related tasks.
*   **Cons:** It adds complexity. The agent needs to decide if the new query is "similar enough" to use the cache. More importantly, it doesn't account for times when the scripts on disk might have changed.

Your idea is the right way to start thinking about this. Now, let's build on it to create a more robust and powerful workflow.

### A Better Idea: A "Context-Aware" Agent Architecture

I propose we restructure the agent's "memory" (its state) into different layers of context. This makes the agent smarter, faster, and paves the way for much more complex automations.

#### 1. Multi-Layered State Management

Instead of a single, flat state dictionary, we'll divide it into two primary contexts:

*   **`session_context` (Long-Term Memory):**
    This holds information that is true for the entire user session. It is **never cleared** between tasks.
    *   `agent_scripts_path`: The path to the user's scripts.
    *   `full_script_manifest`: The **complete list of all available scripts**. This is loaded **once** at the beginning of the session (or if the path changes).

*   **`task_context` (Working Memory):**
    This holds information related only to the current task. It is **completely cleared** after each task is done (i.e., in the `summary_node`).
    *   `current_task_description`: The user's specific goal for this task (e.g., "create a wall").
    *   `identified_scripts`: The *subset* of scripts from the `full_script_manifest` that are relevant to the current task.
    *   `selected_script`: The specific script chosen for the current step.
    *   `parameters`: The parameters for the `selected_script`.

#### 2. The New, More Efficient Workflow

This new state structure leads to a much cleaner and faster workflow:

1.  **Session Start:** The agent is initialized. The `full_script_manifest` is loaded into `session_context` one time.
2.  **New Query ("create a wall"):**
    *   The agent performs a semantic search on the `full_script_manifest` that it already has in its memory. **(This is much faster as there's no file I/O).**
    *   The results are stored in `task_context.identified_scripts`.
    *   The rest of the flow (selection, parameters, execution) proceeds, using only the `task_context`.
3.  **Task End:**
    *   The `summary_node` runs.
    *   It **only clears the `task_context`**.
    *   The `session_context` (with the full manifest) remains untouched.
4.  **Second New Query ("rotate a door"):**
    *   The agent is already holding the `full_script_manifest` in its `session_context`.
    *   It immediately performs a semantic search on this in-memory list to find scripts relevant to rotating doors.
    *   The process repeats, fast and efficiently.

#### 3. The Future: `revit_context`

This architecture also opens the door for a third, even more powerful context layer:

*   **`revit_context` (Environmental Awareness):**
    This would hold information about the state of the Revit model itself.
    *   `last_created_elements`: [ID_of_wall_1]
    *   `current_selection`: [ID_of_door_5, ID_of_window_2]

    Imagine this workflow:
    1.  **User:** "Create a wall."
        *   *(Agent creates a wall, and saves its ID into `revit_context.last_created_elements`)*
    2.  **Agent:** "Done. I have created a wall."
    3.  **User:** "Now make it 15 feet high."
        *   *(Agent sees the new query. It checks its `revit_context` and knows which wall the user is talking about. It finds a "Set Parameter" script and applies it to the wall's ID without having to ask "Which wall?").*

This `revit_context` would allow for truly conversational and fluid automation chains.

---

**Proposal:**

Let's start by implementing the **`session_context`** and **`task_context`** architecture. This will solve the immediate problem you identified, make the agent much faster, and build the foundation for more advanced features.

This involves:
1.  Updating the `AgentState` model to have nested `session_context` and `task_context` dictionaries.
2.  Changing the `tool_node` to load the manifest into `session_context.full_script_manifest`.
3.  Changing the `agent_node` (and its sub-nodes) to read from the `session_context` and write to the `task_context`.
4.  Updating the `summary_node` to only clear the `task_context`.

This is a significant but powerful upgrade. Do you approve of this new architectural direction?

---
---

### **UPDATE:** Revised "Just-in-Time" Manifest Architecture (Token-Efficient)

You are absolutely right. Storing the entire manifest in the agent's state would be incredibly inefficient and costly in terms of tokens. Your existing design of generating it once and storing it in the browser's local storage is the correct and much smarter approach. My previous proposal was flawed because I was not aware of this constraint or your existing implementation.

Let's move forward with your design. Here is a revised, token-efficient architecture that builds on your idea.

#### 1. Frontend Responsibility (The Source of Truth)

*   As you have it now, when the user enters "agent mode," the frontend is responsible for fetching the `full_script_manifest` and storing it in **local storage**.

#### 2. The "Injection" Workflow

This is the key change. Instead of the agent *pulling* the script list with a tool, the frontend will *push* it to the agent for each new task.

1.  **New User Query:** The user types a new query (e.g., "create a wall").
2.  **Frontend Action:** Before sending the query to the backend, the frontend reads the `full_script_manifest` from its local storage.
3.  **API Call with Injection:** The frontend calls the `/agent/chat` endpoint. It sends not only the user's message but also **injects the full manifest** into the body of the API request.
    ```json
    {
      "messages": [...],
      "thread_id": "...",
      "full_script_manifest": [ ... ] // Injected from browser local storage
    }
    ```
4.  **Backend Action (`agent_router.py`):**
    *   The backend router receives the request.
    *   It extracts the `full_script_manifest` from the request body.
    *   It places the manifest into the agent's state for the **current turn only**.
5.  **Agent Workflow (`agent_node.py`):**
    *   The agent now has the full list of scripts available in its working memory for this specific task.
    *   It immediately performs the semantic search on this list to find relevant scripts.
6.  **Task End (`summary_node.py`):**
    *   At the end of the task, the agent's working memory is cleared. The injected manifest is discarded.
    *   The agent's persistent state remains minimal, containing only the `agent_scripts_path` as you wanted.

#### Benefits of This Approach:

*   **Extremely Token-Efficient:** The large manifest is never part of the conversational history, saving a huge number of tokens.
*   **Simplifies the Agent:** We can **completely remove the `search_scripts_tool`**. The agent no longer needs to know how to fetch scripts; it just expects to be given them. This makes the agent's logic simpler and more robust.
*   **Fast & Responsive:** The manifest is loaded instantly from local storage, and the agent can begin its primary job (semantic search) immediately.

---

**Proposal:**

This architecture correctly incorporates your design constraints and is a significant improvement. I will proceed with implementing this. The required changes are:

1.  **Backend:**
    *   Modify `agent_router.py` to accept `full_script_manifest` in the chat request and add it to the agent's initial state for the turn.
    *   Remove the `search_scripts_tool` from `tools.py` and all related logic from the agent's workflow, as it is now redundant.
    *   Update `agent_node.py` to directly use the manifest from the state instead of trying to call a tool to get it.
2.  **Frontend:**
    *   Update the `invokeAgent` function (likely in `AgentView.tsx` or a similar file) to read the manifest from local storage and include it in the API call to `/agent/chat`.

This is the right way forward. Do you approve of me starting on these changes?

---
---

## Detailed Execution Plan: Building a Context-Aware Revit Agent

This plan outlines the implementation of the "Just-in-Time" architecture and then builds upon it to create a more powerful, context-aware agent.

### Stage 1: Implement the "Just-in-Time" Manifest Architecture (Core Refactoring)

**Goal:** Make the agent token-efficient and robust for handling user queries by injecting the script manifest from the frontend, rather than storing it in the agent's state.

**Steps:**

1.  **Modify Backend Router (`rap-server/server/agent/agent_router.py`):**
    *   Update the `/agent/chat` endpoint's request body model to accept an optional `full_script_manifest: List[dict]`.
    *   In the endpoint logic, if `full_script_manifest` is provided in the request, inject it into the initial `AgentState` for the current graph invocation. The key should be `identified_scripts_for_choice` to match the existing logic.

2.  **Simplify Agent Tools (`rap-server/server/agent/tools.py`):**
    *   **Delete the `search_scripts_tool`**. It is now completely redundant.
    *   Remove it from the `tools` list that is exported.

3.  **Update Agent Logic (`rap-server/server/agent/nodes/agent_node.py`):**
    *   The main router logic will be simplified. The first step for a new query will no longer be to call a tool. Instead, it will directly proceed to the semantic search step (`handle_semantic_search`), since the manifest (`identified_scripts_for_choice`) will already be in the state, injected by the router.

4.  **Update Frontend (`rap-web/src/.../AgentView.tsx` or similar):**
    *   Locate the `invokeAgent` function (or its equivalent).
    *   Before making the API call to `/agent/chat`, retrieve the `full_script_manifest` from the browser's local storage.
    *   Include this manifest in the body of the POST request.

### Stage 2: Implement Basic `revit_context` (Remembering the Last Action)

**Goal:** Enable simple, immediate follow-up commands (e.g., "create a wall", followed by "make it taller").

**Steps:**

1.  **Update Agent State (`rap-server/server/agent/state.py`):**
    *   Add a new dictionary to `AgentState`: `revit_context: dict = Field(default_factory=dict)`.
    *   This dictionary will initially contain `last_action_element_ids: List[int] = []`.

2.  **Enhance C# Script Execution (`RServer.Addin` & `CoreScript.Engine`):**
    *   Modify the `ExecutionResult` class in the C# engine to include a `List<long> ModifiedElementIds`.
    *   When a script creates or modifies elements, ensure their IDs are captured and added to this list in the result.

3.  **Update Backend Execution Flow:**
    *   **`grpc_client.py`:** Ensure the `ModifiedElementIds` are received from the gRPC response.
    *   **`script_execution_router.py`:** The `/run-script` endpoint should return these IDs as part of its JSON response to the frontend.

4.  **Update Frontend (`rap-web/src/.../AgentView.tsx`):**
    *   When a script execution is finished (after the HITL modal), the `runScript` function will receive the `modifiedElementIds`.
    *   When the frontend sends the "System: Script execution was successful." message to the agent, it will now **also inject the `revit_context`**, including the `last_action_element_ids`.

5.  **Update Agent Prompt (`rap-server/server/agent/prompt.py`):**
    *   Add instructions for using the new context: "If the user's prompt seems to refer to a previous action (e.g., using words like 'it', 'that', 'the wall'), you should use the element IDs found in `revit_context.last_action_element_ids` as the target for the next action."

### Stage 3: Implement Generic, Reusable Tools

**Goal:** Shift from finding specific, single-purpose scripts to using a smaller set of powerful, generic tools that the agent can combine to achieve complex tasks. This makes the agent more flexible and capable.

**Steps:**

1.  **Create Generic C# Scripts/Tools:**
    *   `Get_Element_Parameters.cs`: A script that takes one or more element IDs and returns a JSON string of their parameters.
    *   `Set_Element_Parameters.cs`: A script that takes one or more element IDs and a JSON string of parameters and values to update.
    *   `Create_Element.cs`: A more advanced script that can create different types of elements (walls, floors, etc.) based on a `type` parameter and other inputs.
    *   `Delete_Elements.cs`: A script that takes a list of element IDs to delete.

2.  **Update Agent Tools (`rap-server/server/agent/tools.py`):**
    *   Define new tools that correspond to these generic scripts (e.g., `get_element_parameters_tool`, `set_element_parameters_tool`).

3.  **Evolve Agent Logic:**
    *   The agent's core task becomes "planning" or "task decomposition". Instead of finding one script, it will learn to break a request down into a sequence of calls to these generic tools.
    *   **Example Request:** "Create a 12-foot wall and then change its fire rating to 2 hours."
    *   **Agent's Internal Plan:**
        1.  Call `Create_Element` tool with `type: "Wall"`. Get back the new wall's ID.
        2.  Update `revit_context.last_action_element_ids` with the new ID.
        3.  Call `Set_Element_Parameters` tool with the wall's ID and parameters `{"Height": 12, "Fire Rating": "2-hr"}`.

This staged plan provides a clear path from our current state to a highly capable, context-aware conversational agent for Revit, starting with the most critical architectural fix.