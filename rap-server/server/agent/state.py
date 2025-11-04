from typing_extensions import TypedDict, Annotated
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]
    workspace_path: str
    user_token: str
    script_to_run: dict | None
    script_parameters_definitions: list | None
    selected_script_info: dict | None
    llm_provider: str | None
    llm_model: str | None
    llm_api_key_name: str | None
    llm_api_key_value: str | None
