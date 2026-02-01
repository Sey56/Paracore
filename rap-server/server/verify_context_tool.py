import os
import sys

# Add the current directory to sys.path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent.tools import get_revit_context_tool, tools


def verify_tools():
    print("Verifying tools...")
    tool_names = [t.name for t in tools]
    print(f"Available tools: {tool_names}")

    if "get_revit_context_tool" in tool_names:
        print("SUCCESS: 'get_revit_context_tool' tool is registered.")
    else:
        print("FAILURE: 'get_revit_context_tool' tool is NOT registered.")
        sys.exit(1)

    print("Verifying get_revit_context_tool definition...")
    if get_revit_context_tool.name == "get_revit_context_tool":
        print("SUCCESS: get_revit_context_tool name is correct.")
    else:
        print(f"FAILURE: get_revit_context_tool name is {get_revit_context_tool.name}")
        sys.exit(1)

if __name__ == "__main__":
    verify_tools()
