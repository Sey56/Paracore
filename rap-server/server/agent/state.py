from typing_extensions import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage

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