from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage, AIMessage
import uuid
import os
import json
import traceback

from ..state import AgentState, _get_llm
from ..tools import tools
from ..prompt import prompt

def agent_node(state: AgentState) -> AgentState:
    """Invokes the LLM to get the next action, with a robust fail-safe."""
    print(f"agent_node: Entry - next_conversational_action: {state.get('next_conversational_action')}")
    try:
        llm = _get_llm(state)
        llm_with_tools = llm.bind_tools(tools)
        
        # Always provide default values for the prompt variables
        input_variables = {
            'script_name': '',
            'final_parameters': ''
        }

        next_action = state.get('next_conversational_action')
        if next_action == 'present_parameters':
            script_metadata = state.get('selected_script_metadata')
            if script_metadata:
                input_variables['script_name'] = script_metadata.get('name', 'Unknown Script')
        elif next_action == 'confirm_execution':
            final_params = state.get('final_parameters_for_execution')
            if final_params:
                input_variables['final_parameters'] = json.dumps(final_params, indent=2)

        chain = prompt | llm_with_tools

        # Patch message history to prevent the "invalid parts" error for empty AIMessage content
        patched_messages = []
        for msg in state["messages"]:
            if isinstance(msg, AIMessage) and msg.tool_calls and not msg.content:
                patched_messages.append(AIMessage(content=".", tool_calls=msg.tool_calls, id=msg.id))
            else:
                patched_messages.append(msg)

        print(f"agent_node: Messages being sent to LLM: {patched_messages}")
        
        # Add messages to the input variables
        input_variables['messages'] = patched_messages
        
        response = chain.invoke(input_variables)

        # Update the messages in the state
        state['messages'].append(response)
        return state

    except Exception as e:
        print("--- AGENT NODE CRITICAL ERROR ---")
        traceback.print_exc()
        print("---------------------------------")
        error_message = "I'm sorry, but I've encountered a critical internal error. I cannot proceed with your request."
        state['messages'].append(AIMessage(content=error_message))
        return state
