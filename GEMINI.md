# Post-Execution Summary Workflow (rap-server Implementation)

**Objective:** To provide the agent with an intelligent summary of script execution results. All summary generation logic will be handled exclusively within the `rap-server` backend. The C# add-in's responsibility is strictly limited to script execution and returning raw output. This keeps the add-in simple and co-locates agent-specific logic with the agent backend.

---

### Step 1: Raw Output from C# Backend (No Summary Generation Here)

-   **Role:** The C# `RServer.Addin` is solely responsible for executing the script and returning the full, raw `ExecuteScriptResponse`.
-   **Output:** This response contains the complete `output` (console logs) and `structured_output` (data from `Show()` calls).
-   **Crucially:** The C# backend **does NOT** generate, process, or attach any form of summary to this response. Its role in summary generation is zero.

### Step 2: Intercept Raw Output in `rap-server`

-   **File:** `rap-server/server/api/script_execution_router.py`
-   **Logic:** The `/run-script` endpoint in `script_execution_router.py` receives the raw `ExecuteScriptResponse` from the C# backend. This is the point where the raw output is available in the Python environment.
-   **Action:**
    1.  The `execute_script` function in `grpc_client.py` already returns a dictionary containing `is_success`, `output`, `error_message`, `error_details`, and `structured_output`.
    2.  The `script_execution_router.py` will pass this entire `response_data` to a new summary generation utility.

### Step 3: Implement Summary Generation Logic in `rap-server`

-   **File:** `rap-server/server/agent/summary_utils.py` (new file)
-   **Logic:** This new utility will contain the core logic for inspecting the raw output and generating a summary *if needed*.
-   **Action:**
    1.  Define a function `generate_summary(raw_execution_result: dict) -> dict | None`.
    2.  This function will receive the `raw_execution_result` dictionary (containing `output` and `structured_output`).
    3.  **Summary Rules:**
        -   **Table Summary (Priority 1):**
            -   Check if `raw_execution_result['structured_output']` contains an item with `type: 'table'`.
            -   If found, parse the `data` field (which is a JSON string) into a Python list.
            -   Count the number of items (rows) in the list.
            -   If `row_count > 5`, create a `table_summary` dictionary: `{'row_count': row_count, 'truncated_rows_json': first_5_rows}`.
            -   Return a summary object: `{'type': 'table', 'message': '...', 'table': table_summary}`.
        -   **Console Summary (Priority 2):**
            -   If no table summary was generated, check `raw_execution_result['output']` (the console log).
            -   Split the string into lines and filter out non-essential messages (like "✅ Code executed successfully").
            -   Count the number of relevant lines.
            -   If `line_count > 5`, create a `console_summary` dictionary: `{'line_count': line_count, 'truncated_lines': first_5_lines}`.
            -   Return a summary object: `{'type': 'console', 'message': '...', 'console': console_summary}`.
        -   If neither condition is met (output is small), the function will return `None`.

### Step 4: Pass Summary to Agent Graph

-   **File:** `rap-server/server/agent/agent_router.py`
-   **Logic:** The `/agent/chat` endpoint is where the agent's conversational flow is managed.
-   **Action:**
    1.  When the `invokeAgent` function in the frontend sends the "System: Script execution was successful." message, it includes the `raw_output` in the request.
    2.  The `agent_router.py` will call the `generate_summary` utility function (from Step 3) using this `raw_output`.
    3.  The generated `summary` (or `None`) will be placed into the `AgentState` under a key like `execution_summary`.

### Step 5: Agent Responds Intelligently

-   **File:** `rap-server/server/agent/graph.py`
-   **Logic:** The `agent_node` in the agent graph will consume the `execution_summary` from the `AgentState`.
-   **Action:**
    1.  If `execution_summary` is present, the `agent_node` will use an LLM to formulate a concise, user-friendly response based on the summary data (e.g., "The script created a table with 36 rows. See the Table tab for the full output.").
    2.  If `execution_summary` is `None` (because the raw output was small), the `agent_node` will use the *full raw output* (which is also available in the `AgentState`) to generate a summary and response. This ensures an intelligent response in all cases.