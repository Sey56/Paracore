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
        /// <summary>
        /// The answer to "may an AI agent execute code in this Revit session?".
        /// ⚠ ONE home for these strings (rule 14). The values are mirrored in
        /// <c>protos/corescript.proto</c> — <c>ExecuteScriptResponse.session_consent</c> and
        /// <c>ExecuteReplResponse.session_consent</c> — which is where the wire contract is
        /// documented. Add or rename a value in BOTH places.
        /// </summary>
        public static class SessionConsent
        {
            /// <summary>The gate was never reached — the run failed before it was consulted.</summary>
            public const string NotEvaluated = "";

            /// <summary>Not an agent run, so no dialog was involved.</summary>
            public const string NotRequired = "not_required";

            /// <summary>The dialog was shown on THIS call and a person clicked Allow.</summary>
            public const string Granted = "granted";

            /// <summary>A person allowed it earlier in this session; no dialog on this call.</summary>
            public const string AlreadyGranted = "already_granted";

            /// <summary>A person clicked Block (or dismissed the dialog). Nothing may run.</summary>
            public const string Denied = "denied";

            /// <summary>
            /// The SESSION has no decision yet — nobody has been asked.
            /// ⚠⚠ Reported by <see cref="CurrentStatus"/> so a DIFFERENT MCP process can
            /// learn the state WITHOUT executing anything (see GetStatusResponse).
            /// ⚠ Distinct from <see cref="NotEvaluated"/>, which describes ONE RUN that
            /// never reached the gate; this describes the whole session.
            /// </summary>
            public const string Unsettled = "unsettled";
        }

        /// <summary>
        /// The gate's verdict AND the reason for it.
        /// ⚠⚠ WHY A STATUS, NOT A <c>bool</c> (2026-10-25): a bare bool left the caller unable to
        /// tell "a person allowed this session" from "there was no gate at all" — the same
        /// ambiguity <c>ExecuteScriptResponse.confirmation</c> was added to remove, one gate over.
        /// It is reported on EVERY response, including successful ones, so no caller has to infer.
        /// </summary>
        public readonly struct Decision
        {
            public Decision(bool approved, string status)
            {
                Approved = approved;
                Status = status;
            }

            public bool Approved { get; }

            /// <summary>One of <see cref="SessionConsent"/>.</summary>
            public string Status { get; }
        }

        // ⚠⚠ volatile, and read WITHOUT the lock by CurrentStatus. The UI thread holds
        //   _lock for the whole of dialog.Show(), so a reader that waited on the lock would
        //   block behind the very dialog it is trying to report — which is exactly the
        //   state a second MCP needs to see. bool reads/writes are atomic; volatile just
        //   stops the JIT caching a stale value in a register.
        private static volatile bool _approved = false;
        private static volatile bool _denied = false;
        private static readonly object _lock = new();

        /// <summary>
        /// The SESSION's verdict, readable WITHOUT executing anything and WITHOUT taking the
        /// lock. One of <see cref="SessionConsent.Granted"/> / <see cref="SessionConsent.Denied"/>
        /// / <see cref="SessionConsent.Unsettled"/>.
        ///
        /// ⚠⚠ WHY (2026-10-25, operator): the gate is per SESSION, not per MCP — once one
        /// MCP's operator grants it, every other MCP may run with no dialog. But each MCP
        /// process only learned that from a response IT happened to receive, so a second MCP
        /// started out assuming "ungated", capped its first call at the consent wait, and
        /// then blamed a consent dialog for a timeout that was really a long automation.
        /// This property lets any MCP ASK instead of guess — it is surfaced on
        /// <c>GetStatusResponse.session_consent</c>.
        /// </summary>
        public static string CurrentStatus
        {
            get
            {
                if (_approved) return SessionConsent.Granted;
                if (_denied) return SessionConsent.Denied;
                return SessionConsent.Unsettled;
            }
        }

        /// <summary>
        /// Returns the session verdict. Manual execution (source does NOT contain "agent")
        /// always passes. Agent execution shows the TaskDialog ONCE per session.
        /// </summary>
        /// <param name="source">
        /// Identifies the caller. Sources containing "agent" trigger the gate.
        /// Expected values: "mcp_agent", "paracore_agent", "paracore", etc.
        /// </param>
        public static Decision EnsureApproved(string source)
        {
            // Manual execution (REPL, Gallery, Playlists) — always allowed
            bool isAgent = source?.Contains("agent") == true;
            if (!isAgent) return new Decision(true, SessionConsent.NotRequired);

            // Agent execution — one-time approval per session
            if (_approved) return new Decision(true, SessionConsent.AlreadyGranted);
            if (_denied) return new Decision(false, SessionConsent.Denied);

            lock (_lock)
            {
                if (_approved) return new Decision(true, SessionConsent.AlreadyGranted);
                if (_denied) return new Decision(false, SessionConsent.Denied);

                string title = "Paracore — AI Agent Code Execution";

                string mainInstruction = "An AI agent wants to execute code in Revit.";

                string mainContent = "An AI agent (an MCP server, Claude Desktop, "
                    + "Cursor, or another LLM-powered tool) is requesting to execute C# code "
                    + "in this Revit document.\n\n"
                    + "This code can read and modify the Revit model. "
                    + "Only allow this if you trust the AI agent and the instructions you gave it.\n\n"
                    + "Allow for this Revit session?";

                // ⚠⚠ THE TWO CAPTIONS BELOW ARE A ROUTING KEY, NOT DECORATION (2026-10-19).
                //   The dialog watcher answers every modal dialog whose buttons intersect
                //   KEEP_LABELS / DISCARD_LABELS — ok, close, continue, yes, accept, keep,
                //   cancel, no, delete… "OK" is in KEEP_LABELS, so the old
                //   CommonButtons = Ok | Cancel was pressed by rule 1 of decide(): the gate
                //   approved ITSELF and this prompt was pure decoration.
                //   These captions are therefore deliberately DISJOINT from both lists:
                //   dialog_watcher.scan_dialogs() then drops the dialog before decide() is
                //   ever reached, and only a human can answer it.
                //   ⚠ Renaming a caption to "OK"/"Yes"/"Allow"/"Close" silently re-arms the
                //   auto-approval and nothing errors — `scripts/check-sessiongate-labels.py`
                //   is the gate that fails when you do.
                const string AllowCaption = "Allow agent code in this session";
                const string BlockCaption = "Block agent code in this session";

                var dialog = new TaskDialog(title)
                {
                    MainInstruction = mainInstruction,
                    MainContent = mainContent,
                    // ⚠ No CommonButtons at all: a standard Ok/Cancel/Close is a label the
                    //   watcher would recognise. Command links are the only Revit control
                    //   that carries custom text.
                    CommonButtons = TaskDialogCommonButtons.None,
                    // X / Esc stays available so the dialog can never trap the operator;
                    //   dismissing it returns Cancel and FAILS CLOSED (session denied).
                    AllowCancellation = true,
                };
                dialog.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, AllowCaption);
                dialog.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, BlockCaption);

                // ⚠⚠ THE DEFAULT BUTTON MUST BE SET *AFTER* THE LINKS EXIST (measured
                //   2026-10-25 18:33). Revit validates the value against the buttons
                //   already added, so setting it in the initializer above — before
                //   AddCommandLink has run — throws
                //     ArgumentException: "Corresponding button not found.
                //                         Parameter name: defaultButton"
                //   at Show() time. The gate then never appears AND every agent call
                //   fails closed. Deny is still the default: CommandLink2 = Block.
                dialog.DefaultButton = TaskDialogResult.CommandLink2;

                bool allowed = (dialog.Show() == TaskDialogResult.CommandLink1);

                if (allowed)
                {
                    _approved = true;
                    return new Decision(true, SessionConsent.Granted);
                }

                _denied = true;
                return new Decision(false, SessionConsent.Denied);
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
