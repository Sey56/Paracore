using Autodesk.Revit.UI;

namespace Paracore.Addin.Services
{
    /// <summary>
    /// Session-level gate for AI agent code execution ONLY.
    /// Manual execution (REPL, Gallery, Playlists) passes through immediately.
    /// Agent execution (Paracore Agent, MCP server, Claude Desktop, Cursor, etc.)
    /// shows a TaskDialog ONCE per Revit session. Once approved, all agent
    /// sources are allowed. If denied, all agent execution is blocked until
    /// Revit restarts.
    ///
    /// Must be called from the Revit UI thread.
    /// </summary>
    public static class SessionGate
    {
        private static bool _approved = false;
        private static bool _denied = false;
        private static readonly object _lock = new();

        /// <summary>
        /// Returns true if code execution may proceed.
        /// Manual execution (source does NOT contain "agent") always passes.
        /// Agent execution shows the TaskDialog ONCE per session.
        /// </summary>
        /// <param name="source">
        /// Identifies the caller. Sources containing "agent" trigger the gate.
        /// Expected values: "mcp_agent", "paracore_agent", "paracore", etc.
        /// </param>
        public static bool EnsureApproved(string source)
        {
            // Manual execution (REPL, Gallery, Playlists) — always allowed
            bool isAgent = source?.Contains("agent") == true;
            if (!isAgent) return true;

            // Agent execution — one-time approval per session
            if (_approved) return true;
            if (_denied) return false;

            lock (_lock)
            {
                if (_approved) return true;
                if (_denied) return false;

                string title = "Paracore — AI Agent Code Execution";

                string mainInstruction = "An AI agent wants to execute code in Revit.";

                string mainContent = "An AI agent (the built-in Paracore Agent, an MCP server, Claude Desktop, "
                    + "Cursor, or another LLM-powered tool) is requesting to execute C# code "
                    + "in this Revit document.\n\n"
                    + "This code can read and modify the Revit model. "
                    + "Only allow this if you trust the AI agent and the instructions you gave it.\n\n"
                    + "Allow for this Revit session?";

                var dialog = new TaskDialog(title)
                {
                    MainInstruction = mainInstruction,
                    MainContent = mainContent,
                    CommonButtons = TaskDialogCommonButtons.Ok | TaskDialogCommonButtons.Cancel,
                    DefaultButton = TaskDialogResult.Cancel
                };

                bool allowed = (dialog.Show() == TaskDialogResult.Ok);

                if (allowed)
                    _approved = true;
                else
                    _denied = true;

                return allowed;
            }
        }

        /// <summary>
        /// Resets the session gate. For testing or Revit add-in reload scenarios.
        /// </summary>
        public static void Reset()
        {
            lock (_lock)
            {
                _approved = false;
                _denied = false;
            }
        }
    }
}
