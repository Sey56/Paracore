# RAP Agent: Unified Architecture & Implementation Plan

**Last Updated:** November 18, 2025

This document provides the single source of truth for the RAP agent's architecture, combining high-level vision, concrete implementation plans, and analysis of the current system.

---

## 1. Vision & Core Principles

The RAP agent is a conversational AI designed to automate tasks in Revit. It understands user intent, orchestrates C# script execution, and provides intelligent feedback.

*   **Context-Awareness:** The agent must eventually understand the state of the Revit model to enable chained commands.
*   **Token Efficiency:** The architecture must aggressively minimize LLM token usage.
*   **Human-in-the-Loop (HITL):** Critical actions, especially script execution, must be explicitly approved by the user.
*   **Modularity:** The system is built with a clear separation of concerns, allowing for independent development of the frontend, agent backend, and C# execution engine.

---

## 2. System Components

The agent is part of the broader RAP ecosystem.

*   **`rap-web` (React Frontend):** Provides the chat UI (`AgentView.tsx`) and the core automation UI (script inspector, etc.). It is the primary interface for the user.
*   **`rap-server` (Python Backend):** Hosts the agent logic (built with FastAPI and LangGraph) and acts as a mediator, communicating with the frontend via HTTP and the Revit Add-in via gRPC.
*   **`RServer.Addin` (Revit Add-in):** A C# add-in that hosts the `CoreScript.Engine`. It is responsible for all script processing, execution, and parameter extraction. It is the only component that interacts directly with the Revit API.
*   **`CoreScript.Engine` (C# Library):** The engine for dynamically executing C# scripts.

---

## 3. Current Agent Workflow & State

The agent's logic is orchestrated by a state machine (LangGraph) defined in `rap-server/server/agent`.

### 3.1. Agent State (`AgentState`)

This `TypedDict` in `state.py` represents the agent's memory for the duration of a conversation. It holds:

*   **Configuration:** LLM settings, auth tokens, script paths.
*   **Task Context:** The user's request, scripts identified for the task.
*   **Selection & Parameters:** The script the user has chosen and its parameters.
*   **Post-Execution:** Summaries and raw output from script runs.
*   **Control Signals:** Internal flags (`next_conversational_action`) to guide the LLM's next response.

### 3.2. Agent Tools (`tools.py`)

The agent has access to a set of predefined tools:

*   **`search_scripts_tool` (Legacy):** Searches for scripts by reading a manifest from disk. **This tool is inefficient and will be deprecated.**
*   **`get_script_parameters_tool`:** Fetches UI parameters for a given script by calling an endpoint on the `rap-server`.
*   **`run_script_by_name` (HITL Trigger):** This tool does **not** execute a script directly. Instead, it's a signal to the `rap-web` frontend to display a confirmation modal to the user. User approval in the frontend is what triggers the actual script execution via the core automation framework.

### 33.3. Conversational Flow (Nodes)

The `graph.py` file defines the flow between different states:

1.  **`agent_node`:** The main LLM invocation. It decides whether to respond to the user, call a tool, or transition to another state.
2.  **`tool_node`:** Executes the requested tool (e.g., `get_script_parameters_tool`).
3.  **`get_parameters_node`:** A specialized node for handling the parameter retrieval flow.

---

## 4. Target Architecture & Implementation Plan

The following sections describe the agreed-upon target architecture and the steps required to implement it.

### 4.1. Post-Execution Summary Workflow (Backend Implementation)

**Objective:** Provide the agent with a concise, intelligent summary of script results without sending the entire raw output to the LLM. All summary logic resides in `rap-server`.

*   **Step 1: Raw Output from C#:** The `RServer.Addin` executes the script and returns the full, raw `ExecuteScriptResponse` (containing `output` and `structured_output`) without any summary.
*   **Step 2: Frontend Forwards Raw Output:** After a successful execution, `AgentView.tsx` sends a system message to the agent, attaching the raw execution result in the `raw_output_for_summary` field of the `/agent/chat` request.
*   **Step 3: Summary Generation in Backend:**
    *   A new utility, `rap-server/server/agent/summary_utils.py`, contains the function `generate_summary(raw_execution_result)`.
    *   This function inspects the `structured_output` for tables and the `output` for console logs.
    *   **Rules:** If the output is large (e.g., > 5 rows/lines), it creates a summary object (e.g., `{'type': 'table', 'row_count': 50}`). Otherwise, it returns `None`.
*   **Step 4: Summary Injected into State:** The `agent_router.py` calls `generate_summary` and places the result into the `execution_summary` field of the `AgentState`.
*   **Step 5: Agent's Intelligent Response:** The `agent_node` uses the `execution_summary` (if present) to give a concise response (e.g., "The script created a table with 50 rows. You can see the full table in the Summary tab."). If the summary is `None`, it uses the small raw output to formulate its response.

### 4.2. Deprecating `search_scripts_tool` (Work In Progress)

**Objective:** Move away from the inefficient, LLM-based `search_scripts_tool` to a more robust, action-based semantic filtering mechanism.

*   **Problem:** The current tool relies on an LLM to filter a manifest, which is slow, expensive, and prone to keyword matching instead of true semantic understanding. The prompt needs to be highly refined to focus on the script's *action* (e.g., "create", "modify") rather than just the objects it mentions ("wall").
*   **Immediate Action:** Refine the `semantic_search_system_prompt` in `rap-server/server/agent/graph.py` to be much stricter about action-based filtering. This is a stop-gap measure.
*   **Long-Term Goal:** The ultimate goal is to replace this entire workflow with a more deterministic search method, potentially using embedding-based search or a more structured metadata schema.

---

## 5. Future Architectural Goals

### 5.1. Multi-Step Task Orchestration

**Goal:** Enable the agent to decompose a complex request (e.g., "create a foundation, then add columns") into a sequence of script executions.

*   **Plan Generation:** The agent will produce a `multi_step_plan` (a list of scripts and their parameters) and store it in the `AgentState`.
*   **Interactive UI:** The frontend will display this plan, allowing the user to click on each step to inspect and modify its parameters in the `ScriptInspector`.
*   **Sequential Execution:** Upon approval, the agent will execute the steps sequentially, processing the summary of one step before starting the next.

### 52. Generic, Reusable Tools

**Goal:** Evolve from using many single-purpose scripts to a smaller set of powerful, generic C# tools that the agent can combine.

*   **Example Tools:** `Get_Element_Parameters.cs`, `Set_Element_Parameters.cs`, `Create_Element.cs`.
*   **Agent Logic Evolution:** The agent's primary task will shift from "finding a script" to "planning a sequence of tool calls." This is a significant leap in agent intelligence and capability.
