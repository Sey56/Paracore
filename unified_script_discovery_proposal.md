# Proposed Improvement: Unified Script Discovery

You've correctly identified a major performance bottleneck and a key area for architectural improvement. Overloading the agent with a massive manifest from a single folder would indeed degrade performance, increase costs, and likely reduce the accuracy of its script selections.

Your idea of compartmentalizing scripts into domain-specific folders is the right direction. It leads to a more scalable and efficient system.

Building on your concept, I propose a more integrated solution that avoids the complexity of managing multiple "specialized agents" and instead makes our single agent much smarter and more aligned with the existing UI.

## Current Situation Overview:

*   The agent currently searches for scripts within a single, dedicated folder path (`toolLibraryPath`) configured in the frontend.
*   This folder contains the actual C# scripts and their `manifest.json`.
*   The entire `manifest.json` is loaded and used by the agent to find the best script for a given task.

## User's Concern and Vision:

*   Having too many scripts in a single folder will result in a very large `manifest.json`, creating a "burden" for the LLM (increased token usage, cost, latency, potential accuracy issues).
*   The desire is to have specialized agents. This is achieved by changing the `toolLibraryPath` to a smaller, domain-specific folder (e.g., for "Sheets" scripts, "Walls" scripts, etc.). This makes the agent behave as a "Sheets agent" or a "Wall agent."
*   The core principle is that Revit API is vast, and a single agent cannot effectively handle *all* possible automation scenarios with hundreds of scripts. Specialization with a smaller, curated set of scripts is preferred.

## My Initial Proposal (and why it might not fit the current vision):

I previously suggested unifying all user-loaded script sources for the agent. While this approach enhances convenience by syncing agent knowledge with the UI, it goes against your current vision of agent specialization and keeping the script manifest concise for the LLM. It would reintroduce the problem of a large, comprehensive manifest if a user loads many diverse script folders.

## Revised Understanding and Acknowledgment:

I now understand that the primary goal is not to merge *all* script sources, but to **enable easy, user-driven specialization** of the agent's knowledge base. The current mechanism of changing the `agent_scripts_path` in the frontend and having the agent operate *only* within that specified path is the desired behavior for specialization.

The constraint is that the list of scripts available to the agent (from its `agent_scripts_path`) should remain focused and manageable, as "cramming hundreds and hundreds of scripts" would indeed be counterproductive given the LLM's limitations and the complexity of Revit API.

### Current Implementation & How it Supports Specialization:

The current setup already allows for this specialization:
1.  You (the user) specify a `toolLibraryPath` (which becomes `agent_scripts_path`) in the frontend.
2.  The agent uses *only* the manifest derived from this path.
3.  By changing this path, you effectively "specialize" the agent to a particular domain (e.g., "Sheets scripts", "Wall scripts").

### Summary of Current State and Next Steps:

*   The agent is now correctly handling multi-turn conversations and state resets after execution summaries.
*   The current mechanism for defining the agent's script knowledge base (via `agent_scripts_path`) aligns with your specialization goal. You control which subset of scripts the agent "knows" about by configuring this path.

**Next Steps (based on this revised understanding):**

Since the current system already supports the specialization you desire by allowing you to control the `agent_scripts_path`, we can proceed with refining the agent's behavior within this specialized context.

What specific aspect of the agent's behavior or interaction would you like to improve next, keeping in mind this specialization model?