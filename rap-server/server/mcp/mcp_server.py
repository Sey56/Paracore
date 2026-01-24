import asyncio
import os
import json
import logging
from typing import List, Optional

from mcp.server import Server, InitializationOptions
from mcp.server.stdio import stdio_server
import mcp.types as types

# Local imports
if __name__ == "__main__" and __package__ is None:
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.orchestrator.registry import ScriptRegistry
from grpc_client import init_channel, get_script_parameters, execute_script, close_channel, get_context

# Configure logging
log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_debug.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=log_file,
    filemode='a'
)
logger = logging.getLogger("paracore-mcp")

# Configuration
def get_scripts_path():
    """Determines the scripts path with priority: 1. CLI Arg, 2. Env Var, 3. Derived Default"""
    import argparse
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--scripts-path", type=str, help="Root path for script discovery")
    args, _ = parser.parse_known_args()
    
    if args.scripts_path:
        return args.scripts_path
        
    env_path = os.getenv("PARACORE_SCRIPTS_PATH")
    if env_path:
        return env_path
        
    # Derived fallback: {RepoRoot}/Agent-Library
    # mcp_server.py is in rap-server/server/mcp
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    derived_path = os.path.join(base_dir, "Agent-Library")
    return derived_path

SCRIPTS_PATH = get_scripts_path()

# Initialize Registry
registry = ScriptRegistry(SCRIPTS_PATH)
server = Server("paracore-mcp", version="0.1.0")

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available Paracore scripts and context tools."""
    logger.info(f"Listing tools for path: {SCRIPTS_PATH}")
    mcp_tools = registry.get_mcp_tools()
    
    tools = []
    for t in mcp_tools:
        tools.append(types.Tool(
            name=t["name"],
            description=t["description"],
            inputSchema=t["input_schema"]
        ))
    
    # Add specialized Revit tools
    tools.append(types.Tool(
        name="get_revit_context",
        description="Get information about the current Revit document, view, and selection.",
        inputSchema={"type": "object", "properties": {}},
    ))
    # Note: get_revit_levels removed - use get_parameter_options instead
    tools.append(types.Tool(
        name="get_script_parameters",
        description="Get the detailed parameter definitions for a specific script tool.",
        inputSchema={
            "type": "object",
            "properties": {
                "script_tool_id": {"type": "string", "description": "The tool ID of the script (e.g., 'auditing_wall_length_auditor_advanced')."}
            },
            "required": ["script_tool_id"]
        },
    ))
    tools.append(types.Tool(
        name="get_parameter_options",
        description="Compute available options for a script parameter dynamically from Revit (e.g., fetch real Level names or Element Types).",
        inputSchema={
            "type": "object",
            "properties": {
                "script_tool_id": {"type": "string", "description": "The tool ID of the script."},
                "parameter_name": {"type": "string", "description": "The name of the parameter to compute options for."}
            },
            "required": ["script_tool_id", "parameter_name"]
        },
    ))
    
    return tools

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool calls by executing scripts or Revit commands."""
    arguments = arguments or {}

    if name == "get_revit_context":
        try:
            context = get_context()
            return [types.TextContent(type="text", text=json.dumps(context, indent=2))]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error getting context: {str(e)}")]


    if name == "get_script_parameters":
        tool_id = arguments.get("script_tool_id")
        target_script = registry.find_script_by_tool_id(tool_id)
        if not target_script:
            return [types.TextContent(type="text", text=f"Error: Script '{tool_id}' not found.")]
        return [types.TextContent(type="text", text=json.dumps(target_script.get("parameters", []), indent=2))]

    if name == "get_parameter_options":
        tool_id = arguments.get("script_tool_id")
        param_name = arguments.get("parameter_name")
        
        target_script = registry.find_script_by_tool_id(tool_id)
        if not target_script:
            return [types.TextContent(type="text", text=f"Error: Script '{tool_id}' not found.")]

        script_path = target_script.get("absolutePath") or target_script.get("path")
        script_type = target_script.get("type", "single-file")

        try:
            from utils import resolve_script_path
            import glob
            absolute_path = resolve_script_path(script_path)
            
            # For options computation, we need the main script content
            source_code = ""
            if script_type == "single-file":
                with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
            elif script_type == "multi-file":
                # Find the top-level script (usually the one with 'public class Params' or just use first .cs)
                cs_files = glob.glob(os.path.join(absolute_path, "*.cs"))
                if not cs_files: return [types.TextContent(type="text", text="Error: No files found in multi-file script.")]
                
                # Simple check: try to find the one with 'Params'
                found_main = False
                for f_path in cs_files:
                    with open(f_path, 'r', encoding='utf-8-sig') as f:
                        content = f.read()
                        if "class Params" in content:
                            source_code = content
                            found_main = True
                            break
                if not found_main:
                    with open(cs_files[0], 'r', encoding='utf-8-sig') as f:
                        source_code = f.read()

            from grpc_client import compute_parameter_options
            resp = compute_parameter_options(source_code, param_name)
            return [types.TextContent(type="text", text=json.dumps(resp, indent=2))]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error computing options: {str(e)}")]

    # Handle script tools (run_*)
    if name.startswith("run_"):
        tool_id = name.replace("run_", "")
        target_script = registry.find_script_by_tool_id(tool_id)
        
        if not target_script:
            return [types.TextContent(type="text", text=f"Error: Script tool '{name}' not found.")]

        script_name = target_script.get("name", "unnamed_script")
        script_path = target_script.get("absolutePath") or target_script.get("path")
        script_type = target_script.get("type", "single-file")

        logger.info(f"Executing {script_name} via MCP")
        
        try:
            from utils import resolve_script_path
            import glob
            
            absolute_path = resolve_script_path(script_path)
            script_files_payload = []
            
            if script_type == "single-file":
                with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files_payload.append({"FileName": os.path.basename(script_path), "Content": source_code})
            elif script_type == "multi-file":
                for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                    with open(file_path, 'r', encoding='utf-8-sig') as f:
                        source_code = f.read()
                    script_files_payload.append({"FileName": os.path.basename(file_path), "Content": source_code})

            if not script_files_payload:
                return [types.TextContent(type="text", text=f"Error: No script files found.")]

            # Standardized Parameter Mapping
            parameters = []
            param_defs = {p.get("name"): p for p in target_script.get("parameters", [])}
            
            for k, v in arguments.items():
                p_def = param_defs.get(k, {})
                parameters.append({
                    "Name": k,
                    "Value": v,
                    "Type": p_def.get("type", "string"),
                    "Unit": p_def.get("unit", ""),
                    "MultiSelect": p_def.get("multiSelect", False),
                    "SelectionType": p_def.get("selectionType", "")
                })
            
            # Metadata injection
            parameters.append({"Name": "__script_name__", "Value": script_name, "Type": "string"})

            response = execute_script(json.dumps(script_files_payload), json.dumps(parameters))
            
            result = f"Execution {'Successful' if response.get('is_success') else 'Failed'}\n"
            if response.get('output'):
                result += f"Output:\n{response.get('output')}\n"
            if response.get('error_message'):
                result += f"\nError: {response['error_message']}"
            
            return [types.TextContent(type="text", text=result)]
            
        except Exception as e:
            logger.exception("MCP Execution Failure")
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]

    return [types.TextContent(type="text", text=f"Error: Unknown tool '{name}'")]

@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    return [types.Resource(uri="paracore://instructions", name="Paracore Instructions", mimeType="text/markdown")]

@server.read_resource()
async def handle_read_resource(uri: str) -> types.ReadResourceResult:
    if uri == "paracore://instructions":
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        path = os.path.join(base_dir, "Instruction.md")
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        return types.ReadResourceResult(contents=[types.TextResourceContents(uri=uri, text=content, mimeType="text/markdown")])
    raise ValueError(f"Unknown resource: {uri}")

async def main():
    init_channel()
    # Trigger a fresh script scan on startup
    logger.info("Triggering fresh script registry refresh...")
    registry.refresh(force=True)
    
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())
    close_channel()

if __name__ == "__main__":
    asyncio.run(main())
