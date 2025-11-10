from langchain_core.messages import BaseMessage
from typing_extensions import TypedDict, Annotated, Literal
import os
from langchain_google_genai import ChatGoogleGenerativeAI

# --- 1. Define Agent State ---
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

def _get_llm(state: AgentState):
    llm_provider = state.get("llm_provider")
    llm_model = state.get("llm_model")
    llm_api_key_name = state.get("llm_api_key_name")
    llm_api_key_value = state.get("llm_api_key_value")

    # Default to Google if no provider is specified
    if not llm_provider:
        llm_provider = "Google"

    # Determine the API key
    api_key = llm_api_key_value or os.getenv(llm_api_key_name or "GOOGLE_API_KEY")
    if not api_key:
        raise ValueError(f"API key not found. Please provide it directly or set the '{llm_api_key_name or 'GOOGLE_API_KEY'}' environment variable.")

    if not llm_model:
        raise ValueError("LLM model not specified in AgentState. Please provide a model name.")

    # For now, we only have the Google client, but we'll use the model from the state
    # This can be expanded with a factory function for different providers
    if llm_provider == "Google":
        return ChatGoogleGenerativeAI(
            model=llm_model,
            api_key=api_key,
            convert_system_message_to_human=True,
            max_retries=0 # Disable retries on API errors
        )
    else:
        # Fallback for other providers, assuming a compatible API for now.
        # This removes the hardcoded model and API key name.
        print(f"Warning: LLM provider '{llm_provider}' is not officially supported. Using Google's client as a fallback.")
        return ChatGoogleGenerativeAI(
            model=llm_model,
            api_key=api_key,
            convert_system_message_to_human=True,
            max_retries=0 # Disable retries on API errors
        )