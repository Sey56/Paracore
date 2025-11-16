from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState

def get_llm(state: AgentState):
    """Dynamically creates an LLM instance based on the state."""
    provider = state.get("llm_provider")
    model = state.get("llm_model")
    api_key_value = state.get("llm_api_key_value")

    if not provider:
        raise ValueError("LLM provider not specified in agent state. Please configure it in the settings.")
    if not model:
        raise ValueError("LLM model not specified in agent state. Please configure it in the settings.")
    if not api_key_value:
        raise ValueError("LLM API key not provided in agent state. Please configure it in the settings.")

    if provider.lower() == "google":
        return ChatGoogleGenerativeAI(
            model=model, 
            google_api_key=api_key_value, 
            convert_system_message_to_human=True
        )
    # In the future, other providers can be added here.
    # elif provider == "openai":
    #     return ChatOpenAI(model=model, api_key=api_key_value)
    
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
