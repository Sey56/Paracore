# Strategic Plan: Paracore Agent Enhancement

## 1. Guiding Principles

Our primary goal is to evolve the Paracore Agent from a conversational interface into a **dynamic, intelligent orchestrator**. It should be capable of understanding complex user goals and creating multi-step plans to achieve them.

A critical constraint is the **protection of the core Paracore "Automation Mode."** The agent will be built upon this robust foundation, adapting to its workflow (script discovery, parameterization, execution). The agent is an intelligent layer *on top of* the core manual workflow and is not allowed to modify the foundation itself.

## 2. Core Agent & UI Strategies

### Dynamic Multi-Step Planning
- The agent will dynamically create and execute multi-step plans to accomplish complex tasks, rather than being limited to single script executions. The agent, not manual metadata, is responsible for all orchestration.

### Decoupled UI & Master-Detail Interaction
- **Agent Workspace:** The agent will be decoupled from the UI's "active workspace." It will operate from its own dedicated "Agent Scripts Path," configured in the application settings. This allows the agent to have a broad knowledge base of all available tools, independent of the UI state.
- **Plan View:** When the agent creates a multi-step plan, the UI will display a new "Plan View" component, showing each step and its status (Pending, In Progress, Complete).
- **Master-Detail UI:** The `PlanView` will act as the "master" list. The existing `ScriptInspector` will serve as the "detail" view, showing the parameters and description for the step currently selected in the `PlanView`.

### Efficient Output Summarization
- To avoid token-heavy processing in the agent's context, the **C# `CoreScript.Engine` will be responsible for pre-summarizing script outputs.**
- For tables, the execution result will include `rowCount`, `columnHeaders`, and a truncated view of the first 5 rows.
- For console logs, the result will include `lineCount` and the first 5 lines.
- The agent's role is simplified to reading this metadata and intelligently presenting it to the user, guiding them to the appropriate UI tabs (Summary or Console) for the full data.

### The Script Manifest
- To ensure the agent can discover scripts quickly and efficiently from its dedicated workspace, we will use a `scripts_manifest.json` file. A utility script will parse the descriptive metadata (Description, Categories, etc.) from all `.cs` files and compile it into this single, machine-readable file.

## 3. Phased Implementation Plan

**Phase 1: Decouple the Agent (Next Steps)**

1.  **Create Agent Scripts Path Setting (NEXT STEP):** Implement a UI in the Paracore settings for the user to define the absolute path to the agent's dedicated script workspace.
2.  **Update Backend to Use Path:** The agent's backend will be modified to receive and use this path.
3.  **Create Manifest Parser Utility:** Write the Python script (`create_manifest.py`) that scans the specified workspace path and generates the `scripts_manifest.json` file.
4.  **Adapt Agent to Use Manifest:** The `list_available_scripts` tool will be updated to read from the manifest, making script discovery instantaneous.

**Phase 2: Implement the Multi-Step UI**

1.  **Develop `PlanView` Component:** Create the new `PlanView.tsx` React component.
2.  **Implement Master-Detail Logic:** Update the `AgentView.tsx` and `ScriptInspector.tsx` to connect them, allowing the inspector to display details for the selected plan step.
3.  **Integrate Plan Execution:** Connect the frontend to the backend to display plan progress in real-time.

**Phase 3: Implement Intelligent Outputs**

1.  **Enhance `CoreScript.Engine`:** Modify the C# execution engine to produce the structured, summarized result objects (with `rowCount`, `lineCount`, etc.).
2.  **Update Agent's `tool_node`:** The `tool_node` will be updated to process these new result objects.
3.  **Update `SYSTEM_PROMPT`:** Instruct the agent on how to formulate responses based on the pre-summarized data and how to guide users to the correct tabs.

