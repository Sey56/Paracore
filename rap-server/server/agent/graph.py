from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
from typing_extensions import TypedDict, Annotated
import os
import json
import traceback
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from .tools import run_script_by_name, get_script_parameters_tool, list_available_scripts
from .api_helpers import list_scripts_in_workspace, run_script_from_server, get_script_parameters_from_server

# --- 1. Define Agent State ---
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]
    workspace_path: str
    user_token: str
    script_to_run: dict | None
    script_parameters_definitions: list | None

# --- 2. Setup Tools, Prompt, and LLM ---

tools = [run_script_by_name, get_script_parameters_tool, list_available_scripts]

gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY not found in environment variables.")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash", 
    api_key=gemini_api_key,
    convert_system_message_to_human=True # Important for Gemini 1.5
)

llm_with_tools = llm.bind_tools(tools)

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a specialized Revit assistant named Paracore Agent. Your primary function is to help users by executing scripts in their Revit workspace.

- **Identify User Intent:** Your first step is to understand if the user wants to run a script, list available scripts, or something else.
- **Find the Script:** If the user wants to run a script, you must first find it. Use the `list_available_scripts` tool to see what is in their workspace. Use the user's message to identify the correct script from that list.
- **Check Parameters:** Once a script is identified, use the `get_script_parameters_tool` to see if it requires any inputs.
- **Elicit Parameters:** If the script has parameters, present them to the user clearly and ask for the values. Do not run the script until you have the required parameters. If a parameter has a default value, mention it.
- **Execute the Script:** Once you have the script name and all required parameters, call the `run_script_by_name` tool.
- **Handle Ambiguity:** If you are unsure which script to run, or if the user's request is unclear, ask for clarification. Do not guess.
- **Confirm Success:** After running a script, confirm to the user that it was executed and report the result."""
        ),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

chain = prompt | llm_with_tools

# --- 3. Define Graph Nodes ---

def agent_node(state: AgentState) -> AgentState:
    """Invokes the LLM to get the next action, with a robust fail-safe."""
    try:
        # Patch message history to prevent the "invalid parts" error
        patched_messages = []
        for msg in state["messages"]:
            if isinstance(msg, AIMessage) and msg.tool_calls and not msg.content:
                patched_messages.append(AIMessage(content=".", tool_calls=msg.tool_calls, id=msg.id))
            else:
                patched_messages.append(msg)

        response = chain.invoke({"messages": patched_messages})
        return {"messages": [response]}

    except Exception as e:
        print("--- AGENT NODE CRITICAL ERROR ---")
        traceback.print_exc()
        print("---------------------------------")
        error_message = "I'm sorry, but I've encountered a critical internal error. I cannot proceed with your request."
        return {"messages": [AIMessage(content=error_message)]}

def tool_node(state: AgentState) -> dict:
    """This node executes tools by orchestrating calls to API helpers."""
    tool_calls = state['messages'][-1].tool_calls
    if not tool_calls:
        return {}

    results = []
    for tool_call in tool_calls:
        tool_name = tool_call['name']
        tool_args = tool_call['args']

        result_json = {"error": "Unknown tool or processing error.", "is_success": False}
        workspace_path = state.get('workspace_path')
        user_token = state.get('user_token')

        if not workspace_path or not user_token:
            result_json = {"error": "Workspace path or user token not set in agent's state.", "is_success": False}
        elif tool_name == 'run_script_by_name':
            results.append(AIMessage(content="", tool_calls=[tool_call]))
            continue
        elif tool_name == 'get_script_parameters_tool':
            script_name = tool_args.get('script_name', '')
            all_scripts = list_scripts_in_workspace(workspace_path)
            # Perform a case-insensitive match against the script name without the extension
            matching_scripts = [s for s in all_scripts if os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

            if len(matching_scripts) == 0:
                result_json = {"error": f"Script '{script_name}' not found.", "is_success": False}
            elif len(matching_scripts) > 1:
                result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
            else:
                found_script = matching_scripts[0]
                result_json = get_script_parameters_from_server(
                    script_path=found_script['absolutePath'],
                    script_type=found_script['type'],
                    user_token=user_token
                )
        elif tool_name == 'list_available_scripts':
            result_json = list_scripts_in_workspace(workspace_path)

        results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id']))

    return {"messages": results}

def human_in_the_loop_node(state: AgentState) -> dict:
    """Handles the execution of the run_script_by_name tool after user approval."""
    tool_calls = state['messages'][-1].tool_calls
    if not tool_calls:
        return {}

    tool_call = tool_calls[0]
    if tool_call['name'] != 'run_script_by_name':
        return {}

    workspace_path = state.get('workspace_path')
    user_token = state.get('user_token')
    script_name = tool_call['args'].get('script_name', '')
    parameters = tool_call['args'].get('parameters', {})

    all_scripts = list_scripts_in_workspace(workspace_path)
    # Perform a case-insensitive match against the script name without the extension
    matching_scripts = [s for s in all_scripts if os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

    if len(matching_scripts) == 0:
        result_json = {"error": f"Script '{script_name}' not found.", "is_success": False}
    elif len(matching_scripts) > 1:
        result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
    else:
        found_script = matching_scripts[0]
        result_json = run_script_from_server(
            script_path=found_script['absolutePath'],
            script_type=found_script['type'],
            parameters=parameters,
            user_token=user_token
        )
    
    return {"messages": [ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id'])]}

# --- 4. Wire up the Graph ---

graph_builder = StateGraph(AgentState)

graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)
graph_builder.add_node("human_in_the_loop", human_in_the_loop_node)

graph_builder.set_entry_point("agent")

def should_continue(state: AgentState):
    """Determines the next step for the agent."""
    last_message = state['messages'][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        if last_message.tool_calls[0]['name'] == 'run_script_by_name':
            return "human_in_the_loop"
        return "tools"
    return END

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "human_in_the_loop": "human_in_the_loop",
        "tools": "tools",
        END: END,
    }
)

graph_builder.add_edge("tools", "agent")
graph_builder.add_edge("human_in_the_loop", "agent")

# --- 5. Compile the Graph ---

memory = MemorySaver()

app = graph_builder.compile(
    checkpointer=memory,
    interrupt_before=["human_in_the_loop"]
)