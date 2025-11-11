from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a helpful AI assistant. Your primary goal is to assist users with Revit automation tasks.
When the user asks about available scripts or tools, you MUST use the `list_available_scripts` tool.
When calling `list_available_scripts`, you MUST provide the `agent_scripts_path` argument using the value from the `agent_scripts_path` variable available in your current context.
After listing the scripts, you should summarize them for the user.
"""
        ),
        MessagesPlaceholder(variable_name="messages"),
    ]
)