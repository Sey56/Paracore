from typing_extensions import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]
    
    # --- Configuration from Frontend ---
    user_token: str
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None
    agent_scripts_path: str | None
    ui_parameters: dict | None

    # --- State for User Intent & Script Discovery ---
    current_task_description: str | None
    identified_scripts_for_choice: list[dict] | None

    # --- State for Script Selection Workflow ---
    recommended_script_name: str | None # The name of the script recommended by the agent
    selected_script_metadata: dict | None
    script_selected_for_params: bool | None
    script_execution_queue: list[dict] | None # Queue for multi-step automation

    # --- State for Parameter Management Workflow ---
    user_provided_param_modifications: dict | None
    script_parameters_definitions: list[dict] | None
    final_parameters_for_execution: list[dict] | None

    # --- Post-Execution State ---
    execution_summary: dict | None
    raw_output_for_summary: dict | None

    # --- Working Set State ---
    working_set: dict[str, list[int]] | None
    
    # --- Control Signals for LLM ---
    next_conversational_action: Literal[
        "ask_for_script_confirmation",
        "present_parameters",
        "confirm_execution",
        None
    ]