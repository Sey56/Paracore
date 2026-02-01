import logging
import os
import sys
from contextlib import AsyncExitStack
from typing import Any, List, Optional

from langchain_core.tools import StructuredTool
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Configure logging
logger = logging.getLogger(__name__)

class ParacoreMCPClient:
    _instance = None

    def __init__(self):
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self._tools_cache = []

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = ParacoreMCPClient()
        return cls._instance

    async def initialize(self):
        """Start the MCP server subprocess and initialize session."""
        if self.session:
            return

        # Path to the server module
        # We assume we are running from 'rap-server/server'
        server_script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp", "mcp_server.py")

        # Ensure the environment knows where to find the 'server' package
        # We use the same python interpreter
        env = os.environ.copy()
        python_path = sys.executable

        logger.info(f"[MCPClient] Starting MCP Server subprocess: {python_path} {server_script_path}")

        server_params = StdioServerParameters(
            command=python_path,
            args=[server_script_path],
            env=env
        )

        try:
            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
            self.stdio, self.write = stdio_transport
            self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))
            await self.session.initialize()
            logger.info("[MCPClient] Connected to Paracore MCP Server!")

            # Pre-fetch tools
            await self.refresh_tools()

        except Exception as e:
            logger.error(f"[MCPClient] Failed to initialize: {e}")
            raise

    async def refresh_tools(self):
        if not self.session: return
        try:
            result = await self.session.list_tools()
            self._tools_cache = result.tools
            logger.info(f"[MCPClient] Discovered {len(self._tools_cache)} tools.")
        except Exception as e:
            logger.error(f"[MCPClient] Failed to list tools: {e}")

    async def get_langchain_tools(self) -> List[StructuredTool]:
        """Converts cached MCP tools to LangChain StructuredTools."""
        if not self.session:
            await self.initialize()

        from pydantic import Field, create_model

        tools = []
        for tool_def in self._tools_cache:
            # 1. Map JSON Schema to Pydantic fields
            # MCP inputSchema is roughly: {"type": "object", "properties": {...}, "required": [...]}
            input_schema = tool_def.inputSchema
            properties = input_schema.get("properties", {})
            required_fields = input_schema.get("required", [])

            field_definitions = {}
            for field_name, field_info in properties.items():
                # Extract basic type
                python_type = Any
                js_type = field_info.get("type")
                if js_type == "string": python_type = str
                elif js_type == "integer": python_type = int
                elif js_type == "number": python_type = float
                elif js_type == "boolean": python_type = bool
                elif js_type == "array": python_type = List[Any]

                # Check if required
                default_value = ... if field_name in required_fields else None

                field_definitions[field_name] = (python_type, Field(default=default_value, description=field_info.get("description", "")))

            # Create the dynamic model
            ArgsModel = create_model(f"{tool_def.name}_args", **field_definitions)

            # 2. Create a closure for execution
            async def _execute(name=tool_def.name, **kwargs):
                return await self.call_tool(name, kwargs)

            tool = StructuredTool.from_function(
                coroutine=_execute,
                name=tool_def.name,
                description=tool_def.description or "",
                args_schema=ArgsModel
            )
            tools.append(tool)
        return tools

    async def get_pydantic_ai_tools(self) -> List[Any]:
        """Converts cached MCP tools to Pydantic-AI Tool objects."""
        if not self.session:
            await self.initialize()

        from pydantic import Field, create_model
        from pydantic_ai import Tool

        tools = []
        for tool_def in self._tools_cache:
            # 1. Map JSON Schema to Pydantic fields
            input_schema = tool_def.inputSchema
            properties = input_schema.get("properties", {})
            required_fields = input_schema.get("required", [])

            field_definitions = {}
            for field_name, field_info in properties.items():
                python_type = Any
                js_type = field_info.get("type")
                if js_type == "string": python_type = str
                elif js_type == "integer": python_type = int
                elif js_type == "number": python_type = float
                elif js_type == "boolean": python_type = bool
                elif js_type == "array": python_type = List[Any]

                default_value = ... if field_name in required_fields else None
                field_definitions[field_name] = (python_type, Field(default=default_value, description=field_info.get("description", "")))

            ArgsModel = create_model(f"{tool_def.name}_args", **field_definitions)

            # 2. Create the tool wrapper
            async def _execute(ctx, args: ArgsModel, name=tool_def.name):
                # PydanticAI passes the model instance as 'args'
                return await self.call_tool(name, args.model_dump())

            # Use Tool class for explicit control
            tool = Tool(
                _execute,
                name=tool_def.name,
                description=tool_def.description or "",
                takes_ctx=True
            )
            tools.append(tool)
        return tools

    async def call_tool(self, name: str, arguments: dict) -> Any:
        if not self.session:
            await self.initialize()

        logger.info(f"[MCPClient] Calling tool: {name}")
        try:
            result = await self.session.call_tool(name, arguments)
            output_text = ""
            for content in result.content:
                if content.type == "text":
                    output_text += content.text + "\n"
                elif content.type == "image":
                    output_text += "[Image Content]\n"
                elif content.type == "embedded_resource":
                    output_text += "[Embedded Resource]\n"

            return output_text.strip()
        except Exception as e:
            logger.error(f"[MCPClient] Tool execution error: {e}")
            return f"Error executing tool {name}: {str(e)}"

    async def cleanup(self):
        await self.exit_stack.aclose()
        self.session = None

# Global helpers
async def get_mcp_tools():
    client = ParacoreMCPClient.get_instance()
    await client.initialize()
    return await client.get_langchain_tools()

async def get_mcp_pydantic_tools():
    client = ParacoreMCPClient.get_instance()
    await client.initialize()
    return await client.get_pydantic_ai_tools()

