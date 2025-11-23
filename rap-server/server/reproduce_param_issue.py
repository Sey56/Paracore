import os
import sys

# Add the server directory to the python path so we can import tools
sys.path.append(os.path.abspath(r"c:\Users\seyou\RAP\rap-server\server"))

from agent.tools import get_script_parameters_tool

def test_get_parameters():
    script_path = r"c:\Users\seyou\RAP\agent-scripts\Create_Spiral_Wall"
    print(f"Testing get_script_parameters_tool with path: {script_path}")
    
    # Try with "multi-file" type
    try:
        params = get_script_parameters_tool.run({"script_path": script_path, "script_type": "multi-file"})
        print(f"Result with script_type='multi-file': {params}")
    except Exception as e:
        print(f"Error with script_type='multi-file': {e}")

    # Try with "single-file" type (should be auto-detected as multi-file anyway)
    try:
        params = get_script_parameters_tool.run({"script_path": script_path, "script_type": "single-file"})
        print(f"Result with script_type='single-file': {params}")
    except Exception as e:
        print(f"Error with script_type='single-file': {e}")

if __name__ == "__main__":
    test_get_parameters()
