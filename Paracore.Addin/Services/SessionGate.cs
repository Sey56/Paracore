using Autodesk.Revit.UI;

namespace Paracore.Addin.Services
{
    /// <summary>
    /// Shared session-level gate for ALL code execution (REPL and scripts).
    /// Shows a TaskDialog ONCE per Revit session. Once approved, all subsequent
    /// execution proceeds without further prompts. If denied, all execution is
    /// blocked until Revit restarts.
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
        /// If neither approved nor denied, shows the TaskDialog ONCE.
        /// </summary>
        /// <param name="source">
        /// Identifies the caller. Sources containing "agent" get the AI-agent
        /// warning message; all others get the generic Paracore message.
        /// Expected values: "mcp_agent", "paracore_agent", "paracore_ui", "paracore"
        /// </param>
        public static bool EnsureApproved(string source)
        {
            if (_approved) return true;
            if (_denied) return false;

            lock (_lock)
            {
                if (_approved) return true;
                if (_denied) return false;

                bool isAgent = source?.Contains("agent") == true;

                string title = isAgent
                    ? "Paracore — AI Agent Code Execution"
                    : "Paracore — Code Execution";

                string mainInstruction = isAgent
                    ? "An AI agent wants to execute code in Revit."
                    : "Paracore needs to execute code in Revit.";

                string mainContent = isAgent
                    ? "An AI agent (the built-in Paracore Agent, an MCP server, Claude Desktop, "
                      + "Cursor, or another LLM-powered tool) is requesting to execute C# code "
                      + "in this Revit document.\n\n"
                      + "This code can read and modify the Revit model. "
                      + "Only allow this if you trust the AI agent and the instructions you gave it.\n\n"
                      + "Allow for this Revit session?"
                    : "Code execution in this Revit document may be triggered by scripts, "
                      + "the REPL console, automations, or AI agents (Paracore Agent, MCP server, "
                      + "Claude Desktop, Cursor, etc.).\n\n"
                      + "Executed code can read and modify the Revit model. "
                      + "Only allow this if you know and trust the source of the execution.\n\n"
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
