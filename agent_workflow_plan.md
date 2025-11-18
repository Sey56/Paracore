# Proposed Agent Workflow Enhancement Plan

## Introduction

You've made two excellent observations about improving the agent:
1.  It should be more decisive and not ask the user to choose between similar scripts.
2.  It should be more proactive by fetching and showing parameters earlier.

Based on our code review and your suggestions, here is a proposed new workflow that achieves both goals, making the agent faster and more user-friendly. I've also identified some areas in the current code we can simplify.

## Analysis of Current Inefficiencies

*   In `search_node.py`, the agent makes two LLM calls if it finds multiple scripts: one to get a list, and a second to rank them. This is redundant and inefficient.
*   In `selection_node.py`, the agent uses an expensive LLM call just to understand if the user said "yes" or "no". This is a non-deterministic call for a simple task that can be done with simple Python logic.
*   The overall conversation has too many turns: `find -> ask to choose -> get choice -> ask to proceed -> get params -> ask to run`. This leads to a chatty and slower user experience.

## The New, Streamlined Workflow: Decisive and Proactive

This new workflow reduces conversational turns and provides a richer, more transparent experience.

1.  **User Query (Example):**
    > "Create a 10-meter-long linear wall at level 1"

2.  **(IMPROVED) Agent - Decisive Search (Code Change in `search_node.py`):**
    *   The `search_node` will be modified. Its prompt will be updated to be much stricter, instructing the LLM it **must** return only the single best script ID for the user's request.
    *   This will remove the "multi-choice" scenario and the second LLM call for ranking, making the agent faster and more decisive.
    *   The node's output will now **always** be the single `selected_script_metadata` (or an appropriate "no script found" message).

3.  **(NEW) Agent - Proactive Parameter Fetching (Code Change in `graph.py` and potentially a new handler):**
    *   We will re-wire the agent's state graph. After the `search_node` successfully selects a single script, the graph will **immediately** transition to call the `get_script_parameters_tool`. It will **not** ask the user for confirmation yet.
    *   This tool call will fetch the parameter definitions and default values for the selected script directly from the C# engine.
    *   The results (the parameter definitions) will be added to the agent's state (e.g., `script_parameters_definitions`).

4.  **(NEW) Agent - Intelligent Parameter Parsing & Proposal (Code Change in `agent_node.py` and a new prompt):**
    *   The graph will then transition back to the `agent_node` (or a specific new handler within it).
    *   A new LLM prompt will be used for this step. This prompt will instruct the agent to:
        1.  Parse the original user's query (from the agent's state).
        2.  Parse the fetched script parameter definitions (from the agent's state).
        3.  Intelligently extract relevant values from the user's query and assign them to the appropriate parameters.
        4.  Construct a clear message for the user, presenting the chosen script and the parameters that have been pre-filled.
        5.  End with a clear call to action (e.g., "Do you want to run this, or make a change?").

5.  **Unified Agent Response (Example):**
    > "I've selected `Create_Wall.cs`. Based on your request, I have filled out the parameters:
    > *   `length`: 10.0
    > *   `levelName`: 'Level 1'
    >
    > Do you want to **run** this, or would you like to make a **change**?"

6.  **(EXISTING, BUT IMPROVED) User Interaction & Execution:**
    *   From this point, the existing robust logic for handling user modifications (e.g., "change length to 12 meters"), syncing with the UI, and the final Human-in-the-Loop (HITL) confirmation will take over.
    *   This new proactive proposal flows directly into that existing loop, providing a seamless experience.

## Required Code Changes (High Level)

*   **`rap-server/server/agent/nodes/search_node.py`:**
    *   Modify the LLM prompt to enforce a single, best-fit script selection.
    *   Simplify the logic to remove the multi-script choice and second ranking LLM call.
    *   Ensure the node's output always points to the next step of parameter fetching.
*   **`rap-server/server/agent/nodes/selection_node.py`:**
    *   This node will be **removed** as its functionality (parsing user selection and affirmation) will be integrated into the new flow or replaced with simpler Python checks.
*   **`rap-server/server/agent/graph.py`:**
    *   Update the graph's edges to reflect the new sequence: `agent (search)` -> `tool_node (for get_script_parameters_tool)` -> `agent (propose)`.
    *   Possibly introduce a new state if the `agent_node` becomes too complex for this new stage.
*   **`rap-server/server/agent/nodes/agent_node.py`:**
    *   Implement the new handler for the "Intelligent Parameter Parsing & Proposal" step, including a new prompt tailored for this task.
*   **`rap-server/server/agent/prompt.py`:**
    *   Potentially update the main prompt to reflect the agent's new capabilities.
