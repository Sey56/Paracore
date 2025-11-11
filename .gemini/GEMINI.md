## Strategic Plan: Paracore Agent Enhancement - Refined Architecture (Updated 2025-11-11)

**Objective:** Achieve a robust, multi-turn, stateful agent capable of correctly identifying user intent, selecting scripts, managing parameters, and executing scripts in Revit, mimicking human interaction with the UI and resolving agent amnesia and conversational loops. This architecture aims for predictability, clarity, and efficient orchestration.

---

### **Core Principles:**

*   **Agent (LLM) as Orchestrator:** The LLM's primary role is the central decision-making unit. It interprets user input and structured signals (ToolMessages) from other nodes, then decides the next action (either a tool call or a conversational response).
*   **Node Autonomy:** Each node performs a specific, well-defined task and returns a clear, structured signal/data (via updates to `AgentState` and/or `ToolMessage` content).
*   **`AgentState` as Source of Truth:** All persistent information needed by the LLM and nodes resides in the `AgentState`. This ensures context is maintained across turns.
*   **`should_continue` as Router:** This function determines the *next node* in the graph based on the `AIMessage` (containing a tool call) or `ToolMessage` (containing a tool result) from the previous step.

---

### **`AgentState` Definition (Central to the Agent's Memory)**

This `TypedDict` will hold all the necessary context across turns.

```python
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y] # Conversation history (HumanMessage, AIMessage, ToolMessage)
    
    # --- Configuration from Frontend (Passed via ChatRequest) ---
    user_token: str # User's authentication token (for API calls)
    llm_provider: str | None # e.g., "google"
    llm_model: str | None # e.g., "gemini-2.0-flash"
    llm_api_key_name: str | None # e.g., "GOOGLE_API_KEY"
    llm_api_key_value: str | None # The actual API key value
    agent_scripts_path: str | None # Path to the agent's dedicated script workspace (tools_library path)

    # --- State for User Intent & Script Discovery Workflow ---
    current_task_description: str | None # User's initial task request (e.g., "create a wall")
    identified_scripts_for_choice: list[dict] | None # List of ScriptMetadata for user to choose from (from search_scripts_node)

    # --- State for Script Selection Workflow ---
    selected_script_metadata: dict | None # Full ScriptMetadata of the script confirmed by user (absolutePath, type, name, etc.)
    script_selected_for_params: str | None # Flag to indicate script is selected and awaiting param retrieval (used by LLM for mandatory sequence)

    # --- State for Parameter Management Workflow ---
    user_provided_param_modifications: dict | None # User's requested changes to parameters (e.g., {"levelName": "Level 2"})
    script_parameters_definitions: list[dict] | None # Definitions of parameters for the selected script (name, type, defaultValueJson, etc.)
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

### **LangGraph Nodes & Connections**

We will define the following nodes and their transitions:

1.  **`agent_node` (LLM Orchestrator)**
    *   **Purpose:** The central decision-making unit. Interprets user input (`HumanMessage`) and structured signals (`ToolMessage`s) from other nodes. Uses `SYSTEM_PROMPT` and `AgentState` to understand context and decide the next action (either a tool call or a conversational `AIMessage`).
    *   **Input:** `AgentState` (containing `HumanMessage` or `ToolMessage` from previous step).
    *   **Output:** `AIMessage` (either a tool call or conversational text).
    *   **Transitions (via `should_continue`):**
        *   To `search_scripts_node` (if LLM calls `list_available_scripts`).
        *   To `select_script_node` (if LLM calls `select_script_tool`).
        *   To `get_params_node` (if LLM calls `get_script_parameters_tool`).
        *   To `sync_params_node` (if LLM calls `sync_ui_parameters_tool` - *this will be a HITL tool*).
        *   To `execute_script_node` (if LLM calls `run_script_by_name` - *this will be a HITL tool*).
        *   To `END` (if LLM generates a final conversational message and `next_conversational_action` is `None`).

2.  **`search_scripts_node`**
    *   **Purpose:** Executes the `list_available_scripts` tool to get the manifest.
    *   **Input:** `AgentState` (requires `agent_scripts_path`).
    *   **Output (to `AgentState`):** `identified_scripts_for_choice: List[ScriptMetadata]` (if found).
    *   **Output (to `agent_node`):** `ToolMessage` with a concise summary of search results or an error message.
    *   **HITL Status:** Not HITL.
    *   **Transitions:** Always back to `agent_node`.

3.  **`select_script_node`**
    *   **Purpose:** Executes the `select_script_tool` to store the chosen script's metadata.
    *   **Input:** `AgentState` (requires `script_name` from `select_script_tool` call, `agent_scripts_path`).
    *   **Output (to `AgentState`):** `selected_script_metadata: dict` (Full `ScriptMetadata`).
    *   **Output (to `agent_node`):** `ToolMessage` (success/failure).
    *   **HITL Status:** Not HITL.
    *   **Transitions:** Always back to `agent_node`.

4.  **`get_params_node`**
    *   **Purpose:** Executes the `get_script_parameters_tool` to fetch parameter definitions for the selected script.
    *   **Input:** `AgentState` (requires `selected_script_metadata`, `user_token`).
    *   **Output (to `AgentState`):** `script_parameters_definitions: list[dict]`.
    *   **Output (to `agent_node`):** `ToolMessage` with parameter definitions or an error.
    *   **HITL Status:** Not HITL.
    *   **Transitions:** Always back to `agent_node`.

5.  **`sync_params_node`**
    *   **Purpose:** Reconciles parameters from `AgentState`, user input, and UI.
    *   **Input:** `AgentState` (requires `selected_script_metadata`, `script_parameters_definitions`, `user_provided_param_modifications`). Also receives a `ToolMessage` from the frontend containing the *current UI parameter values*.
    *   **Output (to `AgentState`):** `final_parameters_for_execution: list[dict]`.
    *   **Output (to `agent_node`):** `ToolMessage` with the synced parameters or an error.
    *   **HITL Status:** **Is HITL.** (Frontend sends UI parameters as a `ToolMessage`).
    *   **Transitions:** Always back to `agent_node`.

6.  **`execute_script_node`**
    *   **Purpose:** Executes the `run_script_by_name` tool.
    *   **Input:** `AgentState` (requires `selected_script_metadata`, `final_parameters_for_execution`, `user_token`).
    *   **Output (to `AgentState`):** `execution_result: dict`.
    *   **Output (to `agent_node`):** `ToolMessage` with execution result or error.
    *   **HITL Status:** **Is HITL.** (Frontend displays modal for final approval).
    *   **Transitions:** Always back to `agent_node`.

7.  **`should_continue` (Graph Router)**
    *   **Purpose:** Determines the *next node* in the graph based on the `AIMessage` (tool call) or `ToolMessage` (tool result) from the previous step.
    *   **Input:** `AgentState` (specifically, the last `AIMessage` or `ToolMessage`).
    *   **Output:** `Literal` string representing the next node name, or `END`.
    *   **Logic:**
        *   If `last_message` is `AIMessage` and contains `tool_calls`:
            *   If `tool_name == "list_available_scripts"` -> `"search_scripts_node"`
            *   If `tool_name == "select_script_tool"` -> `"select_script_node"`
            *   If `tool_name == "get_script_parameters_tool"` -> `"get_params_node"`
            *   If `tool_name == "sync_ui_parameters_tool"` -> `"sync_params_node"`
            *   If `tool_name == "run_script_by_name"` -> `"execute_script_node"`
            *   Else (unexpected tool call) -> `"agent"` (for LLM to re-evaluate)
        *   If `last_message` is `ToolMessage`: -> `"agent"` (always return to agent after a tool executes for LLM to process result).
        *   If `last_message` is `HumanMessage` or `AIMessage` (conversational) and `state['next_conversational_action']` is `None`: -> `END` (conversation concludes or awaits new user input).
        *   If `last_message` is `HumanMessage` or `AIMessage` (conversational) and `state['next_conversational_action']` is set: -> `"agent"` (LLM needs to generate a response based on the signal).

---

### **Implementation Strategy (Layered Approach)**

We will implement this workflow in distinct, verifiable layers. Each layer will be tested before proceeding.

**Layer 1: Basic Agent with Script Discovery (Current Focus)**

1.  **Goal:** Agent can respond to "list available scripts" by reading the local `manifest.json` and summarizing the scripts.
2.  **`manifest.json` Clarification:**
    *   **Location:** The `manifest.json` file is located in the `agent_scripts_path` (which is the `tools_library` path).
    *   **Structure Assumption:** It is assumed to be a list of dictionaries, where each dictionary represents a script's metadata (e.g., `name`, `description`, `absolutePath`, `type`, etc.). This can be verified/adjusted during implementation once we attempt to read it.
3.  **Components to Implement/Modify:**
    *   **`rap-server/server/agent/state.py`:**
        *   Update `AgentState` with: `user_token`, `llm_provider`, `llm_model`, `llm_api_key_name`, `llm_api_key_value`, `agent_scripts_path`, `current_task_description`, `identified_scripts_for_choice`, `selected_script_metadata`, `script_selected_for_params`, `user_provided_param_modifications`, `script_parameters_definitions`, `final_parameters_for_execution`, `execution_result`, `next_conversational_action`. (Basically, the full `AgentState` definition from above).
    *   **`rap-server/server/agent/tools.py`:**
        *   Define the `list_available_scripts` tool using the `@tool` decorator. This tool will take `agent_scripts_path: str` as an argument.
    *   **`rap-server/server/agent/api_helpers.py`:**
        *   Create a function `read_local_script_manifest(agent_scripts_path: str) -> list[dict]`.
        *   This function will:
            *   Construct the full path to the `manifest.json` file (e.g., `os.path.join(agent_scripts_path, "manifest.json")`).
            *   Read the `manifest.json` file.
            *   Parse the JSON content into a Python list of dictionaries (script metadata).
            *   Handle `FileNotFoundError` and `json.JSONDecodeError`, returning an empty list or raising a custom exception if the file cannot be read/parsed.
        *   The `list_available_scripts` tool (from `tools.py`) will then call this `read_local_script_manifest` function.
    *   **`rap-server/server/agent/graph.py`:**
        *   Modify `_get_llm` to accept `state: AgentState` and retrieve LLM config from it.
        *   Add `tool_node` function (as defined in the full plan).
        *   Modify `should_continue` (as defined in the full plan).
        *   Update graph definition to include all nodes and conditional edges for `search_scripts_node`.
    *   **`rap-server/server/agent/agent_router.py`:**
        *   Update `ChatRequest` with: `user_token`, `llm_provider`, `llm_model`, `llm_api_key_name`, `llm_api_key_value`, `agent_scripts_path`.
        *   Pass these fields from the request to the `AgentState` using `app.update_state`.
        *   Modify the response logic to:
            *   Handle `AIMessage`s potentially containing `tool_calls`.
            *   Process `ToolMessage` results (which will be JSON-encoded manifest data).
            *   Construct a conversational response summarizing the available scripts from `state['identified_scripts_for_choice']`.
    *   **`rap-server/server/agent/prompt.py`:**
        *   Update system prompt to explicitly instruct the LLM to use the `list_available_scripts` tool when asked about available tools or scripts.

**Testing Layer 1:**

*   **Integration Test:** Test the full flow by sending a message like "list available scripts" or "what tools do you have?" from the frontend and verifying the agent's conversational response. Ensure `agent_scripts_path` is correctly provided by the frontend and a `manifest.json` exists at that location for testing. If no `manifest.json` exists or the path is invalid, the agent should report that no scripts were found.

---

I have now committed this detailed execution plan to `GEMINI.md`. Please review this updated plan carefully. Your explicit confirmation of this plan, especially the `manifest.json` location and assumed structure, is crucial before any further steps.