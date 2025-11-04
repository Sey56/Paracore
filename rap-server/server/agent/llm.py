import os
from langchain_google_genai import ChatGoogleGenerativeAI
from .state import AgentState

def _get_llm(state: AgentState):
    llm_provider = state.get("llm_provider")
    llm_model = state.get("llm_model")
    llm_api_key_name = state.get("llm_api_key_name")
    llm_api_key_value = state.get("llm_api_key_value")

    if not llm_provider:
        llm_provider = "Google"

    api_key = llm_api_key_value or os.getenv(llm_api_key_name if llm_api_key_name else "")
    if not api_key:
        if llm_api_key_name:
            raise ValueError(f"API key not found. Please provide it directly or set the '{llm_api_key_name}' environment variable.")
        else:
            raise ValueError("API key not found. No API key was provided directly and no API key name was specified in the settings.")

    if not llm_model:
        raise ValueError("LLM model not specified. Please select a model in the LLM settings.")

    if llm_provider != "Google":
        print(f"Warning: LLM provider '{llm_provider}' is not officially supported. Using Google's client as a fallback.")

    # The logic is the same for both cases now, just with a warning for non-Google.
    return ChatGoogleGenerativeAI(
        model=llm_model,
        api_key=api_key,
        convert_system_message_to_human=True
    )
