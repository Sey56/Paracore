import logging
from typing import Dict, List, Optional

from agent.api_helpers import read_local_script_manifest

logger = logging.getLogger(__name__)

class ScriptRegistry:
    """
    A unified registry for Paracore scripts.
    Provides rich discovery and capability mapping for both UI and MCP clients.
    """

    def __init__(self, agent_scripts_path: str):
        self.agent_scripts_path = agent_scripts_path
        self._scripts = []
        self._refresh_needed = True

    def refresh(self, force: bool = False):
        """Refreshes the script list from the discovery sources."""
        try:
            self._scripts = read_local_script_manifest(self.agent_scripts_path, force_refresh=force)
            self._refresh_needed = False
            logger.info(f"Registry refreshed (force={force}): {len(self._scripts)} scripts loaded from {self.agent_scripts_path}")
        except Exception as e:
            logger.error(f"Failed to refresh script registry: {e}")
            self._scripts = []

    def get_all_scripts(self) -> List[Dict]:
        """Returns all scripts in the registry."""
        if self._refresh_needed:
            self.refresh()
        return self._scripts

    def find_script_by_name(self, name: str) -> Optional[Dict]:
        """
        Finds a script by its unique name/ID. 
        Tries tool_id (unique) first, then falls back to metadata name,
        then tries suffix match (for robustness against missing folder prefixes).
        """
        all_scripts = self.get_all_scripts()
        # 1. Try finding by tool_id exactly
        for script in all_scripts:
            if self._get_tool_id(script) == name:
                return script

        # 2. Suffix match for tool_id (e.g. wall_auditor matching auditing_wall_auditor)
        for script in all_scripts:
            t_id = self._get_tool_id(script)
            if t_id.endswith(name) and t_id.count('_') > name.count('_'):
                logger.info(f"Robust Match found: '{name}' matched to '{t_id}' via suffix.")
                return script

        # 3. Fallback to metadata name
        for script in all_scripts:
            if script.get('name') == name:
                return script
        return None

    def _get_tool_id(self, script: Dict) -> str:
        """Generates a stable tool ID from the script path."""
        metadata = script.get("metadata", {})
        name = script.get("name", "unnamed_script")
        rel_path = metadata.get("relativePath") or script.get("path") or name
        return rel_path.lower().replace(".cs", "").replace(".ptool", "").replace("\\", "_").replace("/", "_").replace(" ", "_").replace(".", "_")

    def find_script_by_tool_id(self, tool_id: str) -> Optional[Dict]:
        """Finds a script by its tool ID."""
        for script in self.get_all_scripts():
            if self._get_tool_id(script) == tool_id:
                return script
        return None

    def get_catalog(self) -> List[Dict]:
        """
        Returns a rich catalog of available scripts for LLM processing.
        Includes full metadata so the agent can pass it back to the UI.
        """
        catalog = []
        for script in self.get_all_scripts():
            tool_id = self._get_tool_id(script)

            # Ensure every script has a unified 'id' field for the UI
            collated_script = script.copy()
            collated_script['id'] = tool_id
            collated_script['tool_id'] = tool_id
            catalog.append(collated_script)

        return catalog

    def get_mcp_tools(self) -> List[Dict]:
        """
        Converts curated scripts into MCP tool definitions.
        """
        tools = []
        for script in self.get_all_scripts():
            metadata = script.get("metadata", {})
            name = script.get("name", "unnamed_script")
            tool_id = self._get_tool_id(script)

            # Map parameters to JSON Schema
            properties = {}
            required = []

            params = script.get("parameters", [])
            for p in params:
                p_name = p.get("name")
                if not p_name: continue

                properties[p_name] = self._map_param_to_schema(p)
                if p.get("required"):
                    required.append(p_name)

            tools.append({
                "name": f"run_{tool_id}",
                "description": metadata.get("description") or "No description provided.",
                "input_schema": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            })
        return tools

    def _map_param_to_schema(self, p: Dict) -> Dict:
        """Maps a Paracore parameter definition to a JSON Schema fragment."""
        p_type = str(p.get("type", "string")).lower()
        schema = {"description": p.get("description", "")}

        if p.get("options"):
            schema["enum"] = p["options"]
            schema["type"] = "string"
        elif "int" in p_type or "long" in p_type:
            schema["type"] = "integer"
        elif "double" in p_type or "float" in p_type or "number" in p_type:
            schema["type"] = "number"
        elif "bool" in p_type:
            schema["type"] = "boolean"
        else:
            schema["type"] = "string"

        return schema
