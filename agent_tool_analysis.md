# Analysis of Agent Tool Selection & Semantic Search for Revit Automation

This document explores the general principles of how software agents select and use tools, analyzes the specific challenges and opportunities of using C# scripts as tools in the RAP ecosystem, and provides recommendations for optimizing the current semantic search-based approach.

---

## 1. How Agents Select and Use Tools: The "ReAct" Framework

Most modern agents operate on a principle often called **ReAct (Reason and Act)**. This is a continuous loop where the agent's underlying Large Language Model (LLM) reasons about a problem and then acts upon that reasoning. Tool selection is the core of the "Act" step.

### The Core Loop

1.  **Prompt & Tool Definitions:** The process begins when the user gives the agent a prompt (e.g., "Create a 10-foot-tall wall"). The agent's LLM is provided with this prompt, the conversation history, and, crucially, **a list of available tools**. Each tool in this list is defined by:
    *   A clear, descriptive **name** (e.g., `create_wall`).
    *   A detailed **description** of what the tool does and when to use it (e.g., "Use this tool to create a new wall. It requires the wall's height, level, and start/end points."). This is the most important part for the LLM.
    *   A structured **schema** of the arguments the tool accepts (e.g., `height: float`, `level: string`).

2.  **Reasoning (The "Thought" Step):** The LLM analyzes the user's prompt and compares the user's intent to the descriptions of all available tools. It thinks, "The user wants to 'create a wall.' The `create_wall` tool's description says it's for creating new walls. This is the right tool."

3.  **Action (The "Act" Step):** If the LLM decides a tool is needed, it doesn't just say "use the create wall tool." It generates a specific, machine-readable **tool call**. This is a structured output that contains the exact name of the tool and the arguments it has extracted from the prompt (e.g., `tool_call('create_wall', {'height': 10.0})`).

4.  **Observation:** The agent framework intercepts this tool call, executes the corresponding function (e.g., a Python function), and gets a result. This result, whether it's data or a success/error message, is then passed back into the loop as an "Observation."

5.  **Repeat:** The LLM now looks at the original prompt, its previous "thought," its "action," and the new "observation." It then decides what to do next:
    *   If the task is complete, it generates a final text response for the user.
    *   If the task requires more steps, it might call another tool or ask the user for more information.

---

## 2. The Challenge in RAP: C# Scripts as Tools

Your environment presents a unique and powerful deviation from the standard model:

*   The "tools" are not Python functions the agent can directly import and call.
*   They are external C# scripts that must be executed in a separate process (Revit, via the `RServer.Addin`).

This introduces two primary challenges that your architecture already addresses:

1.  **Discovery:** How does the agent get the list of "tool definitions"? It can't import them.
2.  **Execution:** How does the agent "execute" the tool call? It can't run C# code directly.

Your system solves this with:
*   **Discovery Solution:** A **Script Manifest**. The agent gets a JSON manifest of all available C# scripts. Each entry in this manifest (containing metadata like `name`, `description`, `parameters`) serves as the "tool definition."
*   **Execution Solution:** A **Delegated Tool (`run_script_by_name`)**. The agent's final "action" is to call a special tool that doesn't do the work itself but acts as a trigger for the Human-in-the-Loop (HITL) flow in the frontend, which then delegates the actual execution to the Revit add-in.

---

## 3. Analyzing the Semantic Search Approach for Discovery

Given that you have a large and growing library of scripts, you need an effective way to perform the "Discovery" step. Your current method is semantic search, where the LLM filters the manifest. Let's analyze the pros and cons.

### Pros:

1.  **Maximum Flexibility:** This is the biggest advantage. You don't need to write complex `if/else` logic to route user requests. A user can say "make a wall," "build a wall," or "I need a new partition," and a capable LLM can understand the semantic intent and match it to the description of `Create_Wall.cs`.
2.  **Excellent Scalability & Low Maintenance:** As you add new scripts, you don't need to update any routing code. You just need to ensure the new script has a high-quality description in its metadata. The agent's capabilities grow automatically with the tool library.
3.  **Natural User Experience:** It empowers users to speak naturally without needing to know the exact names of the scripts.

### Cons & Mitigations:

1.  **Token Inefficiency (The Primary Concern):**
    *   **Problem:** The most naive implementation is to inject the *entire script manifest* into the LLM's prompt on every single turn. This is incredibly expensive and will not scale. For a library of 100 scripts, this could add thousands of tokens to every call, quickly exceeding context windows and budget.
    *   **Mitigation (Your Target Architecture):** The **"Just-in-Time" (JIT) manifest architecture** outlined in `Agent_Architecture_Unified.md` is the correct solution. In this model, a less expensive process happens first. For example, the frontend (or a dedicated backend service) performs a cheap, lightweight pre-filter on the full manifest. This could be an embedding-based search or even a simple keyword search. This pre-filter produces a shortlist of maybe 5-10 candidate scripts. Only this shortlist is injected into the agent's prompt for the final, precise semantic selection by the powerful LLM. This dramatically reduces the token load.

2.  **Accuracy & Reliability:**
    *   **Problem:** LLMs can be lazy or make mistakes. They might perform simple keyword matching instead of true action-based reasoning. This is why you observed the agent incorrectly selecting `WallParameters.cs` (which contains the keyword "wall") when asked to *create* a wall.
    *   **Mitigation 1 (High-Quality Descriptions):** This is the most critical factor for success. Script descriptions **must be action-oriented**.
        *   **Bad:** `A script for wall parameters.`
        *   **Good:** `Gets or sets parameters for an existing, specified wall.`
        *   **Bad:** `A script about creating walls.`
        *   **Good:** `Creates a new vertical wall on a given level with a specified height, start point, and end point.`
    *   **Mitigation 2 (Structured Metadata):** Enhance the script metadata beyond a single `description` field. Adding structured fields can create a powerful hybrid search. For example:
        ```json
        "metadata": {
          "description": "Creates a new spiral wall based on a center point, radius, and height.",
          "action_verb": "create",
          "direct_object": "wall",
          "tags": ["wall", "spiral", "architectural"]
        }
        ```
        With this, the JIT pre-filter can first do a hard filter on `action_verb: "create"` and `direct_object: "wall"` before passing the descriptions of the remaining few scripts to the LLM for the final semantic choice.

3.  **Latency:**
    *   **Problem:** Adding an LLM-based selection step adds time to the agent's response.
    *   **Mitigation:** The same token-efficiency strategies also improve latency. Giving the LLM a much smaller list of candidate scripts to choose from makes its job faster and easier.

## Conclusion & Recommendation

Using semantic search for tool discovery is the right approach for a flexible and scalable agent like RAP. It avoids rigid, hard-coded logic and empowers a natural user experience.

However, its primary drawback—token cost—is severe. **Therefore, the highest priority should be to fully implement the "Just-in-Time" manifest architecture.** This approach provides the best of both worlds: a fast, cheap pre-filter narrows down the options, and the powerful (but expensive) LLM is used only for the final, most critical step of selecting the best tool from a small list of relevant candidates.

By combining this architecture with a strict standard for writing high-quality, action-oriented script descriptions, you can build an agent that is both highly capable and efficient.
