# Paracore Agent: Workflow and State Protocol

## 1. Vision: A Stateful, Conversational Design Partner

The Paracore Agent is not a simple command executor. It is a stateful, conversational partner for Revit automation. Its primary purpose is to maintain a context of the user's current focus—the "Working Set"—and perform a continuous series of operations on that context.

This document defines the explicit rules and protocols that govern the agent's behavior to ensure it is predictable, powerful, and not confusing.

---

## 2. The "Working Set": The Agent's Core Context

*   **What It Is:** The Working Set is a list of Revit `ElementId`s that represents the agent's short-term memory. It is the subject of the conversation. The list contains no duplicates.
*   **Purpose:** It allows the user to perform sequential operations on a group of elements without having to re-select or re-describe them in every command.

---

## 3. The Rules of Engagement: How the Agent Decides

To eliminate ambiguity, the agent will follow a strict priority list when deciding which elements to act upon.

#### **Priority #1: The Working Set**
*   **Rule:** If the Working Set is **not empty**, the agent **MUST** assume the user's command (e.g., "change their height," "list parameters") applies to the elements *within the Working Set*.
*   **Behavior:** The backend will automatically inject the Working Set IDs into any script that is designed to receive them. The agent will not ask the user "which elements?"

#### **Priority #2: The User's Revit Selection**
*   **Rule:** If the Working Set is **empty** and the user's command includes words like "selected" or "selection" (e.g., "add the selected walls"), the agent's first job is to run a script to get those selected elements from Revit.
*   **Behavior:** The agent finds and executes a script like `AddToWorkingSet.cs`. This action's purpose is to populate the working set.

#### **Priority #3: The Entire Project (Fallback)**
*   **Rule:** If, and only if, the Working Set is **empty** and the user's query is general (e.g., "list wall parameters"), may the agent fall back to using a script that searches the whole project for an element to act on.
*   **Behavior:** This is a "discovery" mode and should be the last resort to prevent unexpected actions.

---

## 4. State Management: What the Agent Remembers

The agent's memory is carefully managed to be both stateful and clean. There are two types of state:

#### **Persistent State (The Long-Term Conversation)**
This state is **intentionally preserved** across every single turn and command. It is only cleared when the user clears the chat history.
*   `messages`: The full history of the user's and the agent's conversation.
*   `working_set`: The list of `ElementId`s that are the current subject of the conversation.

#### **Transient State (The "Scratchpad" for a Single Action)**
This state is **intentionally cleared** after each action is fully complete.
*   `selected_script_metadata`, `script_parameters_definitions`, `raw_output_for_summary`, and all other fields related to the mechanics of a single turn.

**Why this is powerful:** By clearing the transient details, the agent is always ready for the next command without being biased by the *how* of the previous step. It only remembers *what* you're focused on (the Working Set) and *what's been said* (the conversation history).

---

## 5. Working Set Update Mechanism: The "Intelligent Engine"

The Working Set is updated through two primary mechanisms, providing a balance of automation and explicit control.

#### **Mechanism #1: Automatic Detection by the Engine (Default)**
*   **Concept:** The `CoreScript.Engine` is intelligent. The script writer should **not** have to add special code to their scripts to manage the working set.
*   **Implementation:** The engine's core `Transact` function will now automatically listen to the `Document.DocumentChanged` event that fires during a transaction.
*   **Behavior:**
    *   If the engine detects that **new elements were created** during the script's execution, it will automatically capture their `ElementId`s.
    *   It will then package these IDs into the `internal_data` payload with an **"add"** operation. This allows the user to chain creation commands (e.g., "create walls," then "create doors") and have all new elements accumulate in the working set.
    *   Scripts that only **modify or delete** elements will not automatically affect the working set, preventing unwanted changes.

#### **Mechanism #2: Manual Control by Scripts (For Advanced Cases)**
*   **Concept:** For specific tasks, like adding a user's selection or the results of a filter to the working set, a script needs to have explicit control.
*   **Implementation:** The `SetInternalData(string json)` global function will remain. Specialized scripts, such as `AddToWorkingSet.cs`, will use this function to manually create the `internal_data` JSON payload and specify the desired operation (`add`, `replace`, `remove`).
*   **Behavior:** This gives the user and script writer precise control over the working set when needed, without cluttering simple creation scripts with boilerplate.

---

## 6. The Path Forward

The next implementation step is to refactor the C# `CoreScript.Engine` to implement the "Intelligent Engine" automatic detection. All subsequent Python and frontend code will remain the same, as it already supports the `internal_data` channel. Once this is complete, we will clean up the C# scripts to remove the manual `SetInternalData` calls from creation scripts.
