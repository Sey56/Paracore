import os
import json
import logging
from mcp.server.fastmcp import FastMCP

# Local imports
if __name__ == "__main__" and __package__ is None:
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from grpc_client import close_channel, execute_script, get_context, init_channel

# Configure logging
log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_debug.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=log_file,
    filemode='a'
)
logger = logging.getLogger("paracore-mcp")

# Initialize FastMCP Server
mcp = FastMCP("Paracore Revit Server")



@mcp.tool()
def explore_revit_data(csharp_code: str, justification: str) -> str:
    """
    Executes a C# snippet SILENTLY in Revit to fetch data without mutating the model.
    CRITICAL: Before writing ANY C# code, if you are unfamiliar with the Paracore fluent API, 
    you MUST read `paracore://repl-guide`, `paracore://extension-methods`, and `paracore://system-prompt`.
    Do NOT guess standard Revit API syntax. Paracore is highly specialized.
    """
    logger.info(f"MCP Exploring Data: {justification}")
    try:
        # Wrap simple snippets in the minimal list serialization payload, 
        # or execute_script inside grpc_client handles raw text wrapping if structured properly.
        # Paracore v4 engine handles raw C# directly assuming standard implicit using context.
        result = execute_script(csharp_code, "{}")
        
        if result["is_success"]:
            output_str = ""
            if result.get("structured_output"):
                output_str = json.dumps(result.get("structured_output"))
            else:
                output_str = str(result.get("output", "Execution succeeded with no output."))
            
            # The Shield: Truncate massive outputs to prevent context flooding
            if len(output_str) > 8000:
                output_str = output_str[:8000] + "\n... [TRUNCATED: Result exceeded 8000 characters. Refine your query.]"
            return output_str
        else:
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
    except Exception as e:
        logger.error(f"MCP Exploration Exception: {e}")
        return f"Error executing exploration script: {str(e)}"

@mcp.tool()
def execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """
    Executes a C# snippet to MODIFY the Revit model.
    CRITICAL: You MUST evaluate the Paracore resources (`paracore://extension-methods`) to ensure 
    you are using native commands like `element.SetVal("Name", "X")` rather than standard Revit API.
    Only use when absolutely sure.
    """
    logger.info(f"MCP Executing Query: {justification}")
    try:
        result = execute_script(csharp_code, "{}")
        if result["is_success"]:
            return f"Execution Successful.\nOutput:\n{result.get('output', '')}"
        else:
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
    except Exception as e:
         return f"Error executing task script: {str(e)}"


# Resources
@mcp.resource("paracore://system-prompt")
def read_system_prompt() -> str:
    """The fundamental AI System Prompt that defines Paracore's entire REPL behavioral workflow."""
    try:
        from agent.prompt import SYSTEM_PROMPT
        return SYSTEM_PROMPT
    except Exception as e:
        logger.error(f"Error loading system prompt: {e}")
        return "Error loading prompt."

@mcp.resource("paracore://repl-guide")
def read_repl_guide() -> str:
    """The authoritative REPL Guide describing magic category hydration strings and retrieval shortcuts."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "REPL_GUIDE.md")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return "REPL_GUIDE.md not found."

@mcp.resource("paracore://extension-methods")
def read_extension_methods() -> str:
    """The complete technical reference for all fluent element getters/setters, properties, and formatting tools."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "EXTENSION_METHODS.md")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return "EXTENSION_METHODS.md not found."

# Prompts
@mcp.prompt()
def analyze_revit_model() -> str:
    """Prompt template for analyzing the current Revit model Health."""
    return "Please read the paracore://api-docs resource, get the current Revit context, and then write a C# query to analyze the model for any anomalous elements."

if __name__ == "__main__":
    init_channel()
    logger.info("Starting Paracore FastMCP Server via stdio...")
    try:
        mcp.run(transport="stdio")
    finally:
        close_channel()
        logger.info("FastMCP Server closed.")
