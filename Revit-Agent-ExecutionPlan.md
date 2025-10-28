# Revit Agent: Execution Plan

## 1. Vision & Goal

To build a conversational, agentic AI assistant within the Paracore application. This "Revit Agent" will be capable of understanding user commands in natural language, reasoning about a task, perceiving the state of the Revit model and other external data sources, formulating a plan, and executing actions by leveraging the existing C# script library as its set of tools. The entire process will be governed by a strict "Human-in-the-Loop" (HITL) system, ensuring the user has final approval over any changes to the Revit model.

---

## 2. Core Architecture

The system will be composed of three main components, with the agent's intelligence centralized in the Python backend.

*   **Paracore (`rap-web`):** The frontend for all user interaction. It will provide the chat interface, the agent's thought process visualization, the HITL approval UI, and all necessary settings pages.
*   **Agent Server (`rap-server`):** The "brain" of the operation. This existing Python/FastAPI server will be enhanced with a new, modular `agent` component. It will host the LangGraph-based agent, manage communication with the LLM, orchestrate the agentic loop, and call tools.
*   **Revit Connector (`RServer.Addin`):** The "hands" of the agent. This C# Revit add-in will act as a pure, non-intelligent execution and context engine. It responds to gRPC calls from `rap-server` to provide information about the model (MCP) and to execute C# scripts.

### Communication Flow

```
+----------------------+     HTTP     +--------------------+     gRPC     +---------------------+
| Paracore (UI)        |<------------>| rap-server (Agent) |<------------>| RServer.Addin       |
| (React/Tauri)        |             | (Python/LangGraph) |             | (C# Revit Connector)|
+----------------------+             +----------+---------+             +---------------------+
                                                |
                                                | HTTPS
                                                |
                                      +---------v---------+
                                      | LLM Provider      |
                                      | (OpenAI, Gemini...) |
                                      +-------------------+
```

---

## 3. The Agentic Loop

The agent will operate on a stateful, cyclical `Perceive -> Reason -> Act` loop, with a critical checkpoint for user validation.

1.  **Perceive:** The agent gathers context. This can be from the user's prompt, the conversation history, the state of the Revit model (via the Internal MCP), or external data sources (via External MCPs/Tools).
2.  **Reason:** The LLM processes all this context to understand the user's intent. It then formulates a step-by-step plan and decides which tool to use next, along with the required parameters.
3.  **Human-in-the-Loop (HITL):** Before any action that modifies the Revit model is taken, the agent **must** pause. It presents the intended action and parameters to the user for explicit approval.
4.  **Act:** Upon user approval, the agent executes the tool (e.g., makes a gRPC call to `RServer.Addin` to run a C# script). The result of the action (success, failure, or data output) is captured.
5.  **Repeat:** The result is fed back into the agent's context, and the loop begins again at the **Perceive** step.

---

## 4. Key Components & Implementation Details

### 4.1. `rap-server` (The Agent's Brain)

*   **Frameworks:** Python, FastAPI, LangChain, LangGraph.
*   **Modularization:** All new agent logic will reside in a new `rap-server/server/agent/` directory to avoid polluting the existing codebase. This module will be loaded into the main FastAPI app using an `APIRouter`.
*   **LangGraph Implementation:**
    *   **State:** A stateful graph will be defined to manage the agent's memory, including conversation history, user intent, and the results of tool calls.
    *   **Nodes:** The graph will consist of at least two primary nodes:
        1.  `AgentNode`: The reasoner that calls the LLM to decide the next step.
        2.  `ToolExecutorNode`: The action-taker that executes tools (both Revit and external).
    *   **Edges:** Conditional edges will route the flow between reasoning and acting. A crucial edge will be the interruptible one leading to the `ToolExecutorNode` to enable HITL.

### 4.2. `RServer.Addin` (The Revit Connector)

*   **Role:** To be a pure, stateless gRPC server that responds to requests from `rap-server`. It will contain no AI logic.
*   **Tool Discovery Endpoint:**
    *   A new gRPC endpoint, `ListAvailableTools()`, will be created.
    *   This endpoint will use the existing `MetadataExtractor` to scan the C# scripts, generate a JSON schema-like description (name, description, parameters) for each, and return it to `rap-server`.
*   **Internal Model Context Protocol (MCP):**
    *   A new set of gRPC endpoints will be created to allow the agent to "perceive" the model.
    *   Examples: `GetElementById(id)`, `FindElementsByCategory(category)`, `GetParametersOfElement(id)`, `GetActiveViewInfo()`.

### 4.3. `rap-web` (The User Interface)

*   **Agent Tab:** A new primary "Agent" tab will be added to the main UI.
*   **Chat Interface:** This will be the primary interaction point for the user to issue commands.
*   **Thought & Approval Panel:** A dedicated panel will visualize the agent's current plan and display the HITL confirmation prompt (e.g., "I am about to run `Create_Sheet`... [Approve] [Deny]").
*   **Settings: Agent Configuration:** A new settings page for:
    *   Selecting the LLM provider (e.g., OpenAI, Gemini).
    *   Entering the user-specific API key (to be stored securely on the local client).
*   **Settings: Custom Tools:** A new settings page allowing users to register their own external data sources (External MCPs) by providing a name, URL, credentials, and a natural language description for the agent.

---

## 5. Phased Development Plan

This project will be executed in incremental phases to ensure stability and gather feedback.

### Phase 0: Project Setup

*   **`rap-server`:**
    *   Create the `server/agent` directory structure.
    *   Add `langchain`, `langgraph`, and `langchain-openai` (or similar) to `requirements.txt`.
    *   Create the `agent_router.py` and include it in `main.py`.
*   **`rap-web`:**
    *   Create the basic, non-functional "Agent" tab and a placeholder chat UI.

### Phase 1: The Read-Only Agent (Observer)

*   **Goal:** Ask the agent a question about the Revit model and get a correct answer.
*   **`RServer.Addin`:**
    *   Implement the initial set of Internal MCP endpoints (e.g., `FindElementsByCategory`, `GetElementCount`).
*   **`rap-server`:**
    *   Implement the gRPC client logic to call the new MCP endpoints.
    *   Create a simple LangChain chain (not a full graph yet) that uses the MCP tools to answer questions.
*   **`rap-web`:**
    *   Wire up the chat UI to the new agent endpoint in `rap-server`.

### Phase 2: The Single-Tool Agent (Doer)

*   **Goal:** Tell the agent to perform a single action, approve it, and see the result in Revit.
*   **`RServer.Addin`:**
    *   Implement the `ListAvailableTools()` gRPC endpoint.
*   **`rap-server`:**
    *   Implement the full LangGraph agent with state, reasoner node, and tool executor node.
    *   Dynamically load the Revit C# scripts as tools by calling `ListAvailableTools()`.
    *   Implement the HITL interrupt logic.
*   **`rap-web`:**
    *   Build the UI for the HITL approval prompt.
    *   Implement the callback to `rap-server` to approve/deny the action.

### Phase 3: The Multi-Step Planner & External Tools

*   **Goal:** Give the agent a complex, multi-step task that requires external knowledge.
*   **`rap-server`:**
    *   Enhance the LangGraph agent with persistent memory between turns.
    *   Add a pre-built generic tool, such as `WebSearch`.
    *   Implement the backend logic to manage user-defined custom tools.
*   **`rap-web`:**
    *   Build the settings UI for registering and managing custom data sources (External MCPs).
    *   Improve the "thought" panel to show progress through a multi-step plan.

---

## 6. Future Considerations

*   **Visual Feedback:** Explore ways to provide visual feedback in the Revit model, such as temporarily highlighting elements the agent is about to modify.
*   **Advanced Agents:** Investigate multi-agent systems where specialized agents could collaborate on a complex design task.
*   **Vector Databases:** For very large projects or document sets, integrate a vector database for more efficient context retrieval.
