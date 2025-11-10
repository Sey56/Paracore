## Strategic Plan: Paracore Agent Enhancement - Refined Architecture

**Objective:** Achieve a robust, multi-turn, stateful agent capable of correctly identifying user intent, selecting scripts, managing parameters, and executing scripts in Revit, mimicking human interaction with the UI and resolving agent amnesia and conversational loops. This architecture aims for predictability, clarity, and efficient orchestration.

---

### **Core Principles:**

*   **Agent (LLM) as Orchestrator:** The LLM's primary role is the central decision-making unit. It interprets user input and structured signals (ToolMessages) from other nodes, then decides the next action (either a tool call or a conversational response).
*   **Node Autonomy:** Each node performs a specific, well-defined task and returns a clear, structured signal/data (via updates to `AgentState` and/or `ToolMessage` content).
*   **`AgentState` as Source of Truth:** All persistent information needed by the LLM and nodes resides in the `AgentState`. This ensures context is maintained across turns.
*   **`should_continue` as Router:** This function determines the *next node* in the graph based on the `AIMessage` (containing a tool call) or `ToolMessage` (containing a tool result) from the previous step.

---

### **`AgentState` Definition (Updated and Detailed):**

```python
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y] # Conversation history (HumanMessage, AIMessage, ToolMessage)
    workspace_path: str # User's active workspace path
    user_token: str # User's authentication token
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None
    agent_scripts_path: str | None # Path to the agent's dedicated script workspace (toolbox)

    # --- State for User Intent & Script Discovery Workflow ---
    current_task_description: str | None # User's initial task request (e.g., "create a wall")
    identified_scripts_for_choice: list[dict] | None # List of ScriptMetadata for user to choose from (from search_scripts_node)

    # --- State for Script Selection Workflow ---
    selected_script_metadata: dict | None # Full ScriptMetadata of the script confirmed by user (absolutePath, type, name, etc.)
    script_selected_for_params: str | None # Flag to indicate script is selected and awaiting param retrieval (used by LLM for mandatory sequence)

    # --- State for Parameter Management Workflow ---
    user_provided_param_modifications: dict | None # User's requested changes to parameters (e.g., {"levelName": "Level 2"})
    final_parameters_for_execution: list[dict] | None # Merged and validated parameters ready for execution (from sync_params_node)

    # --- State for Execution Workflow ---
    execution_result: dict | None # Result from run_script_by_name tool (from execute_script_node)
    
    # --- Control Signals for LLM (CRITICAL for Orchestration) ---
    # These are internal signals the LLM sets or reads to guide its own behavior or conversational output.
    # They dictate what conversational message the LLM should generate next.
    next_conversational_action: Literal[
        "ask_for_script_confirmation",
        "present_parameters",
        "ask_for_param_modifications", # For when user says "yes" to modify but doesn't specify changes
        "confirm_execution",
        "summarize_result",
        "handle_error",
        "greeting", # For simple greetings
        None # No specific conversational action pending
    ]
```

---

### **Detailed Node Breakdown & Flow:**

**HITL (Human-In-The-Loop) Definition:** A node is designated as HITL if its execution *requires direct user interaction or approval via the frontend UI* before the agent can proceed. This means the agent's backend process will pause, waiting for a specific `ToolMessage` response from the frontend that contains the user's input or decision.

**1. `agent_node` (LLM Orchestrator)**
    *   **Responsibility:** The central decision-making unit. Interprets user input (`HumanMessage`) and structured signals (`ToolMessage`s) from other nodes. Uses `SYSTEM_PROMPT` and `AgentState` to understand context and decide the next action (either a tool call or a conversational `AIMessage`).
    *   **Input:** `AgentState` (containing `HumanMessage` or `ToolMessage` from previous step).
    *   **Output:** `AIMessage` (either a tool call or conversational text).
    *   **Transitions (via `should_continue`):**
        *   To `search_scripts_node` (if LLM calls `list_available_scripts`).
        *   To `select_script_node` (if LLM calls `select_script_tool`).
        *   To `sync_params_node` (if LLM calls `get_ui_parameters_tool`).
        *   To `execute_script_node` (if LLM calls `run_script_by_name`).
        *   To `END` (if LLM generates a final conversational message and `next_conversational_action` is `None`).

**2. `should_continue` (Graph Router)**
    *   **Responsibility:** Determines the *next node* in the graph based on the `AIMessage` (tool call) or `ToolMessage` (tool result) from the previous step.
    *   **Input:** `AgentState` (specifically, the last `AIMessage` or `ToolMessage`).
    *   **Output:** `Literal` string representing the next node name, or `END`.
    *   **Logic:**
        *   If `last_message` is `AIMessage` and contains `tool_calls`:
            *   If `tool_name == "list_available_scripts"` -> `"search_scripts_node"`
            *   If `tool_name == "select_script_tool"` -> `"select_script_node"`
            *   If `tool_name == "get_ui_parameters_tool"` -> `"sync_params_node"` (This is a HITL tool, frontend will respond with `ToolMessage`)
            *   If `tool_name == "run_script_by_name"` -> `"execute_script_node"` (This is a HITL tool, frontend will respond with `ToolMessage`)
            *   Else (unexpected tool call) -> `"agent"` (for LLM to re-evaluate)
        *   If `last_message` is `ToolMessage`: -> `"agent"` (always return to agent after a tool executes for LLM to process result).
        *   If `last_message` is `HumanMessage` or `AIMessage` (conversational) and `state['next_conversational_action']` is `None`: -> `END` (conversation concludes or awaits new user input).
        *   If `last_message` is `HumanMessage` or `AIMessage` (conversational) and `state['next_conversational_action']` is set: -> `"agent"` (LLM needs to generate a response based on the signal).

**3. `search_scripts_node`**
    *   **HITL Status:** Not HITL.
    *   **Input:** `AgentState` (requires `current_task_description`, `agent_scripts_path`).
    *   **Output (to `AgentState`):**
        *   `identified_scripts_for_choice: List[ScriptMetadata]` (if found, contains `name`, `description`, `parameters` for each script).
        *   `next_conversational_action: "ask_for_script_confirmation"` (if scripts found).
        *   `next_conversational_action: "handle_error"` (if no scripts found).
    *   **Output (to `agent_node`):** `ToolMessage` with a concise summary of search results (e.g., "Found X tools.") or an error message.
    *   **Transitions:** Always back to `agent_node`.

**4. `select_script_node`**
    *   **HITL Status:** Not HITL.
    *   **Input:** `AgentState` (requires `script_name` from `select_script_tool` call, `agent_scripts_path`).
    *   **Output (to `AgentState`):**
        *   `selected_script_metadata: dict` (Full `ScriptMetadata` of the script, including its `parameters` definitions).
        *   `script_selected_for_params: str` (Flag to indicate script is selected and parameters are ready for display/modification).
    *   **Output (to `agent_node`):** `ToolMessage` (success/failure, e.g., "Script 'X' selected.").
    *   **Implicit Frontend Action:** This node's execution (specifically, the update to `selected_script_metadata` in `AgentState`) implicitly triggers the existing Paracore frontend logic to fetch and display the script's parameters in `ScriptInspector.tsx`.
    *   **Transitions:** Always back to `agent_node`.

**5. `sync_params_node`**
    *   **HITL Status:** **Is HITL.**
    *   **Input:** `AgentState` (requires `user_provided_param_modifications`). Also receives a `ToolMessage` from the frontend containing the *current UI parameter values*.
    *   **Output (to `AgentState`):**
        *   `final_parameters_for_execution: list[dict]` (Merged and validated parameters, ready for execution).
    *   **Output (to `agent_node`):** `ToolMessage` with the synced parameters or an error.
    *   **Transitions:** Always back to `agent_node`.

**6. `execute_script_node`**
    *   **HITL Status:** **Is HITL.**
    *   **Input:** `AgentState` (requires `selected_script_metadata`, `final_parameters_for_execution`).
    *   **Output (to `AgentState`):**
        *   `execution_result: dict` (containing `is_success`, `output_summary`, etc.).
        *   `next_conversational_action: "summarize_result"` (if successful).
        *   `next_conversational_action: "handle_error"` (if failed or user rejected execution).
        *   Clears all execution-related state (`selected_script_metadata`, `final_parameters_for_execution`, `current_task_description`).
    *   **Output (to `agent_node`):** `ToolMessage` with execution result or error.
    *   **Transitions:** Always back to `agent_node`.

**7. `get_ui_params_node` (Dummy HITL Node)**
    *   **HITL Status:** **Is HITL.**
    *   **Input:** `AgentState` (no specific input from state, acts as a trigger).
    *   **Output (to `AgentState`):** None (its primary output is the `ToolMessage` from the frontend).
    *   **Output (to `agent_node`):** `ToolMessage` (from frontend, containing UI params).
    *   **Transitions:** Always back to `agent_node`.

---

### **Agent's Conversational Flow (LLM's Role Guided by `next_conversational_action`):**

The `agent_node` (LLM) will use the `next_conversational_action` signal in `AgentState` to decide what conversational message to generate.

*   **Initial Input:** User: "Hello"
    *   `agent_node` identifies greeting intent.
    *   `agent_node` sets `next_conversational_action: "greeting"`.
    *   `agent_node` generates: "Hello! I'm Paracore's Revit Agent. What can I help you with?" -> `END`.

*   **Initial Input:** User: "Create a wall"
    *   `agent_node` sets `current_task_description: "Create a wall"`.
    *   `agent_node` calls `list_available_scripts`.
    *   `search_scripts_node` executes, finds `Create_Wall.cs`, sets `identified_scripts_for_choice`, sets `next_conversational_action: "ask_for_script_confirmation"`.
    *   `agent_node` sees `next_conversational_action: "ask_for_script_confirmation"`, generates: "I've found `Create_Wall.cs` which is relevant... Would you like to proceed with it?"

*   **User Input:** "yes" (confirms script)
    *   `agent_node` sees user confirmation, sets `next_conversational_action: None`.
    *   `agent_node` calls `select_script_tool(script_name='Create_Wall.cs')`.
    *   `select_script_node` executes, sets `selected_script_metadata`, sets `script_selected_for_params`. **(Frontend automatically populates parameters in `ScriptInspector.tsx`.)**
    *   `agent_node` sees `ToolMessage` from `select_script_node`, then sets `next_conversational_action: "present_parameters"`.
    *   `agent_node` generates: "I found the `Create_Wall.cs` script, and its parameters are now displayed in the inspector. Would you like to change any?"

*   **User Input:** "change wallLengthMeters to 10"
    *   `agent_node` sees user wants to modify, sets `user_provided_param_modifications: {"wallLengthMeters": 10}`, sets `next_conversational_action: None`.
    *   `agent_node` calls `get_ui_parameters_tool`.
    *   `sync_params_node` (triggered by frontend's `ToolMessage` response to `get_ui_parameters_tool`) executes, merges params, sets `final_parameters_for_execution`, sets `next_conversational_action: "confirm_execution"`.
    *   `agent_node` sees `next_conversational_action: "confirm_execution"`, generates: "I've synced the parameters: [list synced params]. Ready to execute, or continue editing?"

*   **User Input:** "run it"
    *   `agent_node` sees user approval, sets `next_conversational_action: None`.
    *   `agent_node` calls `run_script_by_name` (triggers HITL for final approval).
    *   `execute_script_node` executes (after frontend approval), sets `execution_result`, sets `next_conversational_action: "summarize_result"`.
    *   `agent_node` sees `next_conversational_action: "summarize_result"`, generates: "The script executed successfully..." -> `END`.

---

### **Edge Cases & Error Handling (Guided by `next_conversational_action: "handle_error"`):**

*   **`search_scripts_node` returns `no_scripts_found`:**
    *   `agent_node` sees `next_conversational_action: "handle_error"`, generates: "Sorry, I couldn't find any tools that match your request. Would you like me to try searching for something else?" -> `END`.
*   **User rejects script selection:**
    *   `agent_node` sees user input "no" (after asking for confirmation), sets `next_conversational_action: "handle_error"`, generates: "You chose not to proceed. What else can I help you with?" -> `END`.
*   **Tool execution fails:**
    *   The `ToolMessage` from the node will contain an error.
    *   `agent_node` sees the error in the `ToolMessage` and `next_conversational_action: "handle_error"`, generates: "An error occurred while trying to [tool_action]: [error_message]. Please try again or rephrase your request." -> `END`.
*   **User says "Yeah what?" after parameter presentation:**
    *   `agent_node` sees ambiguous input, generates: "Could you please clarify? Do you want to execute the script or change parameters?"

---

This detailed plan provides a much clearer roadmap for implementation, ensuring each component's role and interaction are well-defined.
