from typing import Annotated
from langchain_core.messages import BaseMessage
from typing_extensions import TypedDict
from typing_extensions import TypedDict

# 1. Define the application state
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]
    
    # LLM configuration
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None

    # --- State for the entire workflow ---
    workspace_path: str | None
    agent_scripts_path: str | None
    user_token: str | None

    # --- State for User Intent & Script Discovery Workflow ---
    current_task_description: str | None # User's initial task request (e.g., "create a wall")
    identified_scripts_for_choice: list[dict] | None # List of ScriptMetadata for user to choose from

    # --- State for Script Selection Workflow ---
    selected_script_metadata: dict | None # Full ScriptMetadata of the script confirmed by user
    
    # --- State for Parameter Management Workflow ---
    script_parameters_definitions: list[dict] | None # The parameters of the selected script
    final_parameters_for_execution: list[dict] | None # Merged and validated parameters ready for execution

    # --- State for Execution Workflow ---
    execution_result: dict | None # Result from run_script_by_name tool
    
    # --- Control Signals for LLM (CRITICAL for Orchestration) ---
    next_conversational_action: str | None
