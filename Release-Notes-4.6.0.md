# Paracore v4.6.0 Release Notes

---

## Agent — Sessions, Thinking Steps & Visibility

### Agent Sessions
The agent now supports multiple named chat sessions, persisted across app restarts. Create a new session, switch between them, or delete old ones. Each session remembers its full conversation history and thread ID independently. Previously there was a single chat that persisted or was cleared — now you can have separate conversations for different tasks without losing context.

### Thinking Steps
The agent now shows what it's doing *before* producing code. When it explores the Revit model, searches the parameter schema, or reads extension method docs, each step appears in the chat as it happens. Previously the agent went silent and then presented the final code in a HITL modal with no visibility into its reasoning process.

### Token Usage
Per-session token usage (input + output tokens, request count) is now tracked and persisted. Users can see how much each session has consumed.

### Other Agent Improvements
**Mid-stream abort:** Interrupting a running generation now properly aborts the stream and preserves the interrupting message in chat history.


## Security

### Agent Execution Warning — Revit TaskDialog
The first time an AI agent (Paracore Agent, MCP server, Claude Desktop, Cursor, etc.) tries to execute code in a new Revit session, a TaskDialog appears asking you to allow it. This is once per session — approve it and all agent sources are cleared for the rest of that session. Denying blocks agent execution until Revit restarts.

Manual execution (REPL, Gallery, Playlists) is not gated — your own code runs immediately, no dialog.

**Why this is necessary:** AI agents generate code autonomously. This ensures you're aware and in control the first time an agent executes code in your model each session.

### Two-Tier Code Safety Scanner
All AI-generated code is scanned before it reaches Revit. System-level operations (`Process.Start`, `Environment.Exit`, registry access, assembly loading, file deletion) are blocked unconditionally — these have no legitimate use in any Paracore context. Network access (`HttpClient`, raw sockets) is blocked for AI-generated code but remains available in user-written REPL scripts. 22 additional anti-patterns are detected (raw Revit API calls where Paracore extensions should be used, hardcoded unit math, incorrect `Transact()` usage).

---

## UI & UX

### Persistent Output Panel
Execution output (Println, tables, charts) now lives in a fixed side panel with History and Analytics tabs — visible across REPL, Gallery, Agent, and Playlists. Previously it was a draggable bottom panel fighting for vertical space. Now the split is horizontal only, always visible, no dragging needed to see results.

### Gallery — Toolbar & Configure Flow
Script cards no longer carry individual action buttons. A unified toolbar sits at the top. Selecting a script doesn't automatically open its parameters — click **Configure** to edit inputs in-place. Everything stays where you are instead of jumping to a different panel.

### Playlists — Gallery-Style Redesign
Playlists now use the same card-based gallery layout as scripts, with inline step configuration and a unified toolbar.

---

## Core Engine

### LINQ Pipeline Diagnostics
`GetElements<T>()` now reports element counts at every stage of a LINQ chain. Users can see how many elements survive each `.Where()`, `.GroupBy()`, or `.Select()`.