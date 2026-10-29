using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using Paracore.Addin.Context;
using Paracore.Addin.Models;
using Paracore.Addin.Services;
using System;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Paracore.Addin.App;

namespace Paracore.Addin.Handlers
{
    public class ReplHandler
    {
        private readonly RevitContext _revitContext;

        public ReplHandler(RevitContext revitContext)
        {
            _revitContext = revitContext;
        }

        private UIApplication? _uiApp => _revitContext.UIApplication;

        // Patterns banned in read-only exploration mode.
        //
        // ⚠⚠ THIS IS A MISTAKE-CATCHER, NOT A SANDBOX (widened 2026-10-27).
        //   It used to be 11 Paracore-only patterns, so a snippet of
        //   `new Transaction(Doc, ...)` + `Parameter.Set(...)` ran inside explore and
        //   wrote the model — measured live by a pre-release review. `Doc.Delete(id)`
        //   passed too: the old entry was ".Delete()" with EMPTY parens, which a call
        //   with an argument never matches.
        //
        //   What it still CANNOT catch, by design: reflection
        //   (`typeof(Parameter).GetMethod("Set")`), a name assembled at runtime, and
        //   anything that is not a model write — scripts have System and System.IO
        //   pre-imported, and RestSharp is a referenced assembly. A Roslyn script runs
        //   full-trust inside Revit; there is no read-only transaction mode to switch on.
        //   The real boundary is SessionGate's per-session consent dialog.
        //
        // ⚠ MIRROR: `paracore/mcp/mcp_core/tool_helpers.py`
        //   (`_READ_ONLY_WRITE_PATTERNS`) refuses the same shapes one layer earlier, with
        //   a message that names the offending line. That layer covers every MCP caller;
        //   this one is the backstop for a DIRECT gRPC caller that uses no MCP at all.
        //   A pattern added to one belongs in the other.
        private static readonly string[] _writePatterns = new[]
        {
            // Paracore method surface
            ".SetVal(", ".SetNum(", ".SetParam(",
            // ".Delete(" already covers ".Delete()" — the empty-parens entry this
            // list used to carry was the reason `Doc.Delete(id)` walked straight past.
            ".Delete(", ".Hide()", ".Unhide()", ".Isolate()",
            "Transact(",
            // Raw Revit API — transactions. "Transaction(" also covers "SubTransaction(".
            "Transaction(", "TransactionGroup(",
            // Raw parameter / document writes
            ".Set(", ".Regenerate(", "Doc.Save", ".SaveAs(", "Doc.Close(",
            // Element creation and transforms
            "NewFamilyInstance", "Wall.Create", "Floor.Create", "Roof.Create",
            "Ceiling.Create", "Grid.Create", "Level.Create", "doc.Create",
            ".CopyElements(", ".MoveElement(", ".RotateElement(", ".MirrorElement("
        };

        private static bool ContainsWriteOperations(string code)
        {
            // ⚠ Scan the CODE, not the prose — the same rule FindAgentPolicyViolation and the
            //   Python guard already follow. Without this, a read-only snippet containing the
            //   comment "never do new Transaction(Doc)" was refused as if it opened one.
            //   Measured 2026-10-29 from the frozen MCP: the Python layer allowed the query and
            //   THIS layer refused it, so the fix was real in one place and inert in the other.
            string scanned = StripCodeNoise(code);
            foreach (var pattern in _writePatterns)
                if (scanned.Contains(pattern)) return true;
            return false;
        }

        // ── Agent file / network policy ─────────────────────────────────────────
        // ⚠⚠ THE RULE (operator, 2026-10-27), and it is deliberately NOT "no files":
        //   an agent MAY create a new file — an output — and MAY read files. It may
        //   NEVER replace, move or delete an existing one, "even if it is the one it
        //   created earlier", because a replace cannot tell an output from something
        //   important. The user deletes files; the agent does not. Network is off.
        //
        //   So the blessed write is `FileMode.CreateNew`, which THROWS when the path
        //   already exists. The agent then picks the next free name (_001, _002). The
        //   protection is .NET's, not a substring scan's — this list only has to stop
        //   the APIs that would route around it.
        //
        //   ⚠ Applies to AGENT SOURCES ONLY. A human running a gallery tool from the
        //   REPL keeps full file access — RoomFinishUpdater reads a CSV and writes one,
        //   and that is the person's own action, not an agent's.
        //   ⚠ MIRROR: `mcp_core/tool_helpers.py::_AGENT_FILE_POLICY` carries the same
        //   patterns one layer earlier so the agent gets a clean refusal instead of an
        //   "Execution Failed". `paracore-gen/tests/test_tool_helpers.py` parses THIS
        //   file and fails if the two lists diverge.
        private static readonly (string Pattern, string Reason)[] _agentPolicyPatterns = new[]
        {
            // Destruction / relocation
            (@"File\.Delete\s*\(",        "delete a file"),
            (@"Directory\.Delete\s*\(",   "delete a directory"),
            (@"File\.Move\s*\(",          "move or rename a file"),
            (@"Directory\.Move\s*\(",     "move or rename a directory"),
            (@"File\.Replace\s*\(",       "replace a file"),
            (@"File\.Copy\s*\(",          "copy a file over another"),
            (@"File\.SetAttributes\s*\(", "change file attributes"),
            (@"File\.OpenWrite\s*\(",     "open a file for writing (truncates it)"),
            // Opens that can touch an existing file. CreateNew is the ONLY safe mode.
            (@"FileMode\.Create(?!New)",  "open a file for writing (truncates or replaces it)"),
            (@"FileMode\.Truncate",       "truncate a file"),
            (@"FileMode\.Open",           "open an EXISTING file for writing"),
            // One-shot writers — all CreateOrOpen, so all can replace
            (@"File\.WriteAllText\s*\(",  "write a file (replaces it if it exists)"),
            (@"File\.WriteAllBytes\s*\(", "write a file (replaces it if it exists)"),
            (@"File\.WriteAllLines\s*\(", "write a file (replaces it if it exists)"),
            (@"File\.AppendAllText\s*\(", "append to a file"),
            (@"File\.AppendAllLines\s*\(", "append to a file"),
            (@"File\.AppendText\s*\(",    "append to a file"),
            (@"new\s+StreamWriter\s*\(",  "StreamWriter(path) truncates an existing file"),
            // Network
            (@"RestSharp",                "reach the network"),
            (@"HttpClient",               "reach the network"),
            (@"WebClient",                "reach the network"),
            (@"WebRequest",               "reach the network"),
            (@"new\s+Socket\s*\(",        "open a socket"),
            (@"TcpClient",                "open a socket"),
            (@"UdpClient",                "open a socket"),
            // Process / registry / assembly loading
            (@"Process\.Start\s*\(",      "start another process"),
            (@"Microsoft\.Win32\.Registry", "touch the Windows registry"),
            (@"RegistryKey",              "touch the Windows registry"),
            (@"Assembly\.Load",           "load another assembly"),
            // ⚠⚠ REFLECTION ENTRY POINTS (added 2026-10-27, pre-release review). Every scan
            //    above was defeated by building the TARGET name at runtime:
            //        typeof(object).Assembly.GetType("System." + "IO." + "File")
            //        Activator.CreateInstance(Type.GetType("System.Net.Http." + "HttpClient"))
            //    String splitting hides the target, but it cannot hide the MECHANISM — the
            //    entry point still has to be named. So these block the entry points rather
            //    than the target types. ⚠ MIRRORED in mcp_core/tool_helpers.py, in this order;
            //    test_tool_helpers.py fails if the two lists differ.
            (@"Type\.GetType\s*\(",       "resolve a type at runtime (reflection)"),
            (@"\.Assembly\b",             "reach the reflection API"),
            (@"Assembly\.(Load|GetType|CreateInstance)", "load or resolve an assembly"),
            (@"Activator",                "construct a type at runtime (reflection)"),
            (@"System\.Reflection",       "use the reflection API"),
            (@"GetMethod",                "look up a method at runtime (reflection)"),
            (@"MethodInfo",               "use the reflection API"),
            (@"InvokeMember",             "invoke a member by name (reflection)"),
            (@"DynamicMethod",            "emit a method at runtime"),
            (@"DllImport",                "call native code"),
            (@"Marshal\.",                "reach unmanaged memory"),
            // A single blocking call cannot be interrupted by the loop-level timeout.
            (@"Thread\.Sleep\s*\(",       "sleep (blocks Revit; the timeout cannot interrupt it)"),
            // ⚠⚠ THE REST OF THE REFLECTION FAMILY (added 2026-10-27, review round 6). The
            //    entries above named `Type.GetType`, `Activator`, `.Assembly`, `GetMethod` —
            //    and the review walked past every one of them with `AppDomain.GetAssemblies()`
            //    → `GetTypes()` → `GetConstructor(...).Invoke(...)` plus `dynamic`, reaching a
            //    real HTTP GET. Naming SOME entry points is a hint, not a restriction: to hide
            //    a target name you still have to ENUMERATE the assembly, RESOLVE the member and
            //    CONSTRUCT the object, so all three families are refused.
            //    ⚠ MIRRORED in mcp_core/tool_helpers.py::_AGENT_FILE_POLICY, same order;
            //    test_tool_helpers.py fails if the two lists differ.
            (@"AppDomain",                "enumerate assemblies/types at runtime (reflection)"),
            (@"GetAssemblies\s*\(",       "enumerate loaded assemblies (reflection)"),
            (@"GetTypes\s*\(",            "enumerate types (reflection)"),
            (@"GetConstructor\s*\(",      "look up a constructor at runtime (reflection)"),
            (@"GetConstructors\s*\(",     "look up constructors at runtime (reflection)"),
            (@"GetMembers\s*\(",          "look up members at runtime (reflection)"),
            (@"GetFields\s*\(",           "look up fields at runtime (reflection)"),
            (@"GetProperties\s*\(",       "look up properties at runtime (reflection)"),
            (@"GetProperty\s*\(",         "look up a property at runtime (reflection)"),
            (@"GetField\s*\(",            "look up a field at runtime (reflection)"),
            (@"GetMember\s*\(",           "look up a member at runtime (reflection)"),
            (@"GetNestedType",            "enumerate nested types (reflection)"),
            (@"CreateDelegate",           "turn a method into a delegate the scan cannot see"),
            (@"ConstructorInfo",          "use the reflection API"),
            // Network, the namespace form: the named clients above are only the common ones.
            (@"System\.Net",              "reach the network"),
            (@"HttpRequestMessage",       "reach the network"),
            (@"Dns\.",                    "reach the network"),
            (@"SmtpClient",               "reach the network"),
            // Process and threads.
            (@"ProcessStartInfo",         "start another process"),
            (@"new\s+Thread\s*\(",        "start a background thread inside Revit's process"),
            (@"System\.Runtime\.InteropServices", "call native code"),
            // The instance form of the destructive file ops, bounded to one statement so a
            // FileInfo used for READING (.Exists, .Length, .FullName) stays allowed.
            (@"FileInfo\b[^;]{0,200}\.(Delete|MoveTo|Replace)", "delete or move a file"),
            (@"DirectoryInfo\b[^;]{0,200}\.(Delete|MoveTo|Replace)", "delete or move a directory")
        };

        private const string AgentPolicyMessage =
            "Blocked by the Paracore agent file policy: {0}.\n\n"
            + "Agent code MAY create a new file and MAY read files. It may NEVER replace, "
            + "move or delete an existing file — not even one it wrote earlier in this "
            + "session — and it may not use the network. Deleting files is the user's job.\n\n"
            + "To write an output, create it with FileMode.CreateNew and pick a new name if "
            + "it already exists (report.csv, then report_001.csv, report_002.csv, …):\n\n"
            + "  var bytes = System.Text.Encoding.UTF8.GetBytes(text);\n"
            + "  using (var fs = new FileStream(path, FileMode.CreateNew))\n"
            + "      fs.Write(bytes, 0, bytes.Length);\n\n"
            + "CreateNew THROWS when the path exists. That is the protection, not a bug to "
            + "work around: choose another name and try again.\n\n"
            + "⚠ What this list refuses IS refused — but it is a list, not a sandbox. The whole "
            + "reflection family is refused (AppDomain, GetTypes/GetAssemblies, GetConstructor, "
            + "GetProperty, Activator, System.Reflection, .Assembly, DllImport, Marshal), so a "
            + "type name assembled from string pieces cannot be resolved to reach File, "
            + "HttpClient or Process. Still open: a delegate obtained from a framework method, "
            + "code hidden in an interpolated-string hole, and a loop inside a framework call. "
            + "⚠ The consent dialog decides WHO may run agent code; it is a decision, not a "
            + "second line of defence — do not rely on it as one.";

        /// <summary>
        /// The first agent-policy violation in `code`, or null. Agent sources only — see
        /// <see cref="_agentPolicyPatterns"/> for why this is not a blanket file ban.
        /// </summary>
        private static string FindAgentPolicyViolation(string code)
        {
            // ⚠ Scan the CODE, not the prose — see StripCodeNoise. Without this a comment that
            //   says "never call Process.Start" was refused as if it were the call.
            string scanned = StripCodeNoise(code);

            // ⚠ And scan it a SECOND time with namespace prefixes blanked, because every
            //   constructor rule here is anchored `new\s+<Type>\s*\(`. Measured 2026-10-29:
            //   `new Thread(` was refused and `new System.Threading.Thread(` EXECUTED — the
            //   long name walked past the rule written for the short one. Both texts are
            //   tested, so a rule that keys on the namespace (`System.Net`) keeps its hit.
            string normalized = BlankNamespacePrefixes(scanned);
            bool differs = !string.Equals(normalized, scanned, System.StringComparison.Ordinal);

            foreach (var (pattern, reason) in _agentPolicyPatterns)
            {
                if (System.Text.RegularExpressions.Regex.IsMatch(scanned, pattern))
                    return reason;
                if (differs && System.Text.RegularExpressions.Regex.IsMatch(normalized, pattern))
                    return reason;
            }
            return null;
        }

        /// <summary>
        /// Blanks comment bodies and string/char literal CONTENTS, preserving every offset.
        ///
        /// ⚠⚠ THE SCAN MUST READ CODE, NOT PROSE (2026-10-27, review round 6). Every pattern in
        /// <see cref="_agentPolicyPatterns"/> is a substring test, so the WORD "Process.Start"
        /// inside a comment used to be refused exactly as a call would be — and this product's
        /// own guidance contains sentences like "never write Process.Start". A refusal that
        /// fires on documentation teaches the reader to ignore refusals, which is how a real
        /// hit gets missed. Characters are REPLACED, never removed, so offsets and line numbers
        /// survive. Mirrors <c>strip_code_noise</c> in mcp_core/tool_helpers.py.
        /// </summary>
        private static readonly System.Text.RegularExpressions.Regex _codeNoise =
            new System.Text.RegularExpressions.Regex(
                @"@""(?:[^""]|"""")*""|""(?:\\.|[^""\\\n])*""|'(?:\\.|[^'\\\n])*'|//[^\n]*|/\*.*?\*/",
                System.Text.RegularExpressions.RegexOptions.Singleline);

        private static string StripCodeNoise(string code)
        {
            if (string.IsNullOrEmpty(code)) return code ?? string.Empty;
            return _codeNoise.Replace(code, m =>
                System.Text.RegularExpressions.Regex.Replace(m.Value, @"[^\n]", " "));
        }

        /// <summary>
        /// `new A.B.Type(` → `new      Type(`. The namespace prefix of a constructor call,
        /// replaced by spaces so every offset and line number survives.
        ///
        /// <para>
        /// ⚠⚠ A RULE WRITTEN AGAINST A SHORT NAME IS DEFEATED BY THE LONG ONE (2026-10-29).
        /// Every constructor rule in <see cref="_agentPolicyPatterns"/> is anchored
        /// <c>new\s+&lt;Type&gt;\s*\(</c>, so it only fires when the type name follows `new`
        /// with whitespace between. Measured: <c>new Thread(</c> was refused and
        /// <c>new System.Threading.Thread(</c> ran. Adding <c>(?:\w+\.)*</c> to eleven patterns
        /// would fix eleven cases and leave the twelfth — the one written next month — broken.
        /// Blanking the prefix once fixes the class. Mirrors <c>blank_qualified_new</c> in
        /// mcp_core/tool_helpers.py.
        /// </para>
        /// <para>
        /// ⚠ Newlines inside a prefix are PRESERVED as newlines, so a multi-line call keeps its
        /// line numbers. <c>\s</c> matches a newline, so the rule still fires afterwards.
        /// </para>
        /// </summary>
        private static readonly System.Text.RegularExpressions.Regex _qualifiedNew =
            new System.Text.RegularExpressions.Regex(
                @"\bnew\s+((?:[A-Za-z_]\w*\s*(?:\.|::)\s*)+)([A-Za-z_]\w*)",
                System.Text.RegularExpressions.RegexOptions.Singleline);

        private static string BlankNamespacePrefixes(string code)
        {
            if (string.IsNullOrEmpty(code) || code.IndexOf("new", System.StringComparison.Ordinal) < 0)
                return code ?? string.Empty;

            var buffer = new System.Text.StringBuilder(code);
            bool changed = false;
            foreach (System.Text.RegularExpressions.Match m in _qualifiedNew.Matches(code))
            {
                int start = m.Groups[1].Index;
                for (int i = 0; i < m.Groups[1].Length; i++)
                {
                    char c = buffer[start + i];
                    if (c == '\n' || c == '\r') continue;
                    buffer[start + i] = ' ';
                    changed = true;
                }
            }
            return changed ? buffer.ToString() : code;
        }

        /// <summary>
        /// Runs a READ-ONLY exploration snippet so that every model change it makes is DISCARDED.
        /// <para>
        /// ⚠⚠ WHY A TRANSACTION GROUP, AND WHY IT IS THE REAL FIX (2026-10-27). Layer 2 above is a
        /// regex scan. A pre-release review proved it can be walked around: a Transaction and a
        /// Parameter.Set assembled through reflection ran inside explore_revit_data and the model
        /// changed. No pattern list can close that — the name is assembled at runtime, so there is
        /// nothing to match.
        /// </para>
        /// <para>
        /// A TransactionGroup is not a scan. It is opened BEFORE the snippet runs and rolled back
        /// AFTER it, so every write it made is undone by Revit itself — including one reached
        /// through reflection, including one the snippet committed in its own nested Transaction.
        /// The read is real; the write is simply not in the model afterwards. That is an
        /// invariant, not a best effort, and it is what the reviewer meant by "enforce it in a
        /// real way".
        /// </para>
        /// <para>
        /// ⚠ It is NOT a sandbox for the rest of the machine. A file written by the snippet, a
        /// network call, a process started — none of those are model changes and none are rolled
        /// back. Layer 3 (the agent file policy) is still a scan, and still best effort. The
        /// session consent dialog remains the real boundary.
        /// </para>
        /// <para>
        /// ⚠ Falls back to the scanned path when no group can be opened — no active document, a
        /// document opened read-only, or Revit refusing the group. In that case the scan is all
        /// there is, which is exactly the state this method was written to end, so it is logged.
        /// </para>
        /// </summary>
        private async Task<(bool isSuccess, string output, string error, List<string> structuredOutput)>
            ExecuteReadOnlyWithRollbackAsync(string code, string sessionId, ServerContext context, string licenseTier)
        {
            var doc = _uiApp?.ActiveUIDocument?.Document;
            if (doc == null || doc.IsReadOnly)
            {
                System.Diagnostics.Debug.WriteLine(
                    "[ReplHandler] read-only: no writable document, so no transaction group — "
                    + "the pattern scan is the only guard for this call.");
                return await ReplSessionManager.ExecuteAsync(code, sessionId, context, licenseTier);
            }

            Autodesk.Revit.DB.TransactionGroup group = null;
            try
            {
                group = new Autodesk.Revit.DB.TransactionGroup(doc, "Paracore read-only exploration");
                group.Start();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine(
                    $"[ReplHandler] read-only: transaction group could not be opened ({ex.Message}) — "
                    + "falling back to the pattern scan.");
                group?.Dispose();
                return await ReplSessionManager.ExecuteAsync(code, sessionId, context, licenseTier);
            }

            try
            {
                var result = await ReplSessionManager.ExecuteAsync(code, sessionId, context, licenseTier);

                string rollbackError = TryRollBack(group);
                if (rollbackError != null)
                {
                    // ⚠ The one outcome that must never be silent: the snippet reported success
                    //   AND its writes may still be in the model. Say so, and fail the call.
                    return (false, result.output,
                            (string.IsNullOrEmpty(result.error) ? string.Empty : result.error + "\n\n")
                            + "⚠ READ-ONLY ROLLBACK FAILED — this exploration was supposed to leave "
                            + "the model untouched, and Revit refused to undo it: " + rollbackError
                            + "\n   The model may have been MODIFIED. Re-read it before trusting any "
                            + "count from this call.",
                            result.structuredOutput);
                }
                return result;
            }
            catch (Exception)
            {
                TryRollBack(group);
                throw;
            }
            finally
            {
                try { group.Dispose(); } catch { /* best effort */ }
            }
        }

        /// <summary>Rolls the group back. Returns null on success, or why it failed.</summary>
        private static string TryRollBack(Autodesk.Revit.DB.TransactionGroup group)
        {
            try
            {
                if (group != null && group.GetStatus() == Autodesk.Revit.DB.TransactionStatus.Started)
                    group.RollBack();
                return null;
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }

        public async Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request)
        {
            // ── Layer 1: Session gate (one-time per Revit session) ──
            // ⚠ Returns a Decision, not a bool (2026-10-25): the caller must be able to tell
            //   "a person allowed this session" from "there was no gate at all" — see
            //   SessionGate.Decision. `gate.Status` is reported on every response below.
            SessionGate.Decision gate = await CoreScriptExecutionDispatcher.Instance
                .ExecuteInUIContext<SessionGate.Decision>(() =>
                {
                    return SessionGate.EnsureApproved(request.Source ?? "paracore");
                });

            if (!gate.Approved)
                return new ExecuteReplResponse
                {
                    IsSuccess = false,
                    ErrorMessage = "Code execution denied for this Revit session. Restart Revit to reset.",
                    UserRejected = true,
                    SessionConsent = gate.Status
                };

            // ── Layer 2: Read-only enforcement for exploration ──
            if (request.ExecutionMode == "read_only")
            {
                if (ContainsWriteOperations(request.Code))
                    return new ExecuteReplResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = "Read-only violation: exploration code contains write operations. Use execute_dynamic_query for writes.",
                        ReadOnlyViolation = true,
                        SessionConsent = gate.Status
                    };
            }

            // ── Layer 3: Agent file / network policy ──
            // ⚠ Placed BEFORE the try, like the read-only gate: a refusal must not look
            //   like a script failure. ⚠ This is the backstop — the Python layer refuses
            //   the same patterns first and with a friendlier message (see the mirror
            //   note on _agentPolicyPatterns). It exists so a DIRECT gRPC caller, which
            //   never passes through an MCP, is held to the same rule.
            if (SessionGate.IsAgentSource(request.Source))
            {
                string reason = FindAgentPolicyViolation(request.Code);
                if (reason != null)
                    return new ExecuteReplResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = string.Format(AgentPolicyMessage, reason),
                        SessionConsent = gate.Status
                    };
            }

            try
            {
                var context = new ServerContext(_uiApp);
                var readOnly = request.ExecutionMode == "read_only";

                // Use the dispatcher to run the REPL command on the Revit UI thread
                var result = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(async () =>
                {
                    // ⚠ read_only runs inside a TransactionGroup that is ALWAYS rolled back, so a
                    //   write the pattern scan cannot see (reflection, a runtime-built name) is
                    //   undone by Revit rather than merely unmentioned. See the method's notes.
                    return readOnly
                        ? await ExecuteReadOnlyWithRollbackAsync(
                            request.Code, request.SessionId, context, request.LicenseTier)
                        : await ReplSessionManager.ExecuteAsync(
                            request.Code, request.SessionId, context, request.LicenseTier);
                });

                // Unwrap the nested task result
                var (isSuccess, output, error, structuredOutput) = await result;

                var response = new ExecuteReplResponse
                {
                    IsSuccess = isSuccess,
                    Output = output,
                    ErrorMessage = error,
                    // ⚠ Reported on the success path too — "a person allowed this" and "no gate
                    //   at all" must not look alike to the caller. See SessionGate.Decision.
                    SessionConsent = gate.Status
                };

                if (context.PipelineDiagnostics != null)
                    response.PipelineDiagnostics.AddRange(context.PipelineDiagnostics);

                foreach (var item in structuredOutput)
                {
                    try
                    {
                        var temp = System.Text.Json.JsonSerializer.Deserialize<StructuredOutputPoco>(item,
                            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                        if (temp != null)
                        {
                            response.StructuredOutput.Add(new CoreScript.StructuredOutputItem
                            {
                                Type = temp.Type ?? "",
                                Data = temp.Data ?? "",
                                Title = temp.Title ?? "",
                                CapExempt = temp.CapExempt
                            });
                        }
                    }
                    catch
                    {
                    }
                }

                return response;
            }
            catch (Exception ex)
            {
                return new ExecuteReplResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message,
                    SessionConsent = gate.Status
                };
            }
        }

        /// <summary>
        /// IntelliSense for the REPL playground. Read-only: it compiles the buffer in an
        /// in-memory Roslyn workspace and returns completion suggestions. It never executes
        /// the code and never touches the Revit document.
        ///
        /// ⚠ It deliberately does NOT go through <see cref="CoreScriptExecutionDispatcher"/>:
        /// completion is pure text analysis against already-loaded assemblies, so it needs no
        /// UI-thread hop and no document lock. Keeping it off the dispatcher is what lets it
        /// answer on every keystroke without competing with a running command.
        /// </summary>
        public async Task<GetReplCompletionsResponse> GetReplCompletions(GetReplCompletionsRequest request)
        {
            try
            {
                var completions = await ReplCompletionProvider.GetCompletionsAsync(
                    request.Code, request.CaretOffset);

                var response = new GetReplCompletionsResponse { IsSuccess = true };
                foreach (var item in completions)
                {
                    response.Items.Add(new ReplCompletionItem
                    {
                        Label = item.Label,
                        InsertText = item.InsertText,
                        Kind = item.Kind,
                        Detail = item.Detail ?? string.Empty,
                        SortText = item.SortText
                    });
                }

                return response;
            }
            catch (Exception ex)
            {
                // An editor convenience must never break its caller.
                return new GetReplCompletionsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// Red squiggles for the REPL playground. Read-only: it compiles the buffer in the
        /// same in-memory Roslyn workspace as completion and returns warnings/errors in the
        /// buffer's own coordinates. Like completion, it needs no UI-thread hop.
        ///
        /// ⚠ The engine's <c>ReplDiagnostic</c> record and the generated proto message share a
        /// name; the proto one is qualified below. Renaming either would break the wire.
        /// </summary>
        public async Task<GetReplDiagnosticsResponse> GetReplDiagnostics(GetReplDiagnosticsRequest request)
        {
            try
            {
                var diagnostics = await ReplCompletionProvider.GetDiagnosticsAsync(request.Code);

                var response = new GetReplDiagnosticsResponse { IsSuccess = true };
                foreach (var diagnostic in diagnostics)
                {
                    response.Items.Add(new CoreScript.ReplDiagnostic
                    {
                        StartLine = diagnostic.StartLine,
                        StartColumn = diagnostic.StartColumn,
                        EndLine = diagnostic.EndLine,
                        EndColumn = diagnostic.EndColumn,
                        Message = diagnostic.Message,
                        Severity = diagnostic.Severity
                    });
                }

                return response;
            }
            catch (Exception ex)
            {
                return new GetReplDiagnosticsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// Symbol hover for the REPL playground. Read-only: it resolves the symbol under the
        /// caret in the same in-memory Roslyn workspace as completion and diagnostics, and never
        /// executes the code or touches the Revit document. Like them, it needs no UI-thread hop.
        ///
        /// ⚠ "Nothing to show" is NOT a failure. A caret over whitespace returns a SUCCESSFUL
        /// response with no <see cref="CoreScript.ReplHoverInfo"/>. Reporting that as an error
        /// would surface a message every time the mouse crossed a space.
        /// </summary>
        public async Task<GetReplHoverResponse> GetReplHover(GetReplHoverRequest request)
        {
            try
            {
                var hover = await ReplCompletionProvider.GetHoverAsync(request.Code, request.CaretOffset);

                var response = new GetReplHoverResponse { IsSuccess = true };
                if (hover != null)
                {
                    response.Info = new CoreScript.ReplHoverInfo
                    {
                        Signature = hover.Signature,
                        Documentation = hover.Documentation,
                        Kind = hover.Kind,
                        StartLine = hover.StartLine,
                        StartColumn = hover.StartColumn,
                        EndLine = hover.EndLine,
                        EndColumn = hover.EndColumn
                    };
                }

                return response;
            }
            catch (Exception ex)
            {
                // An editor convenience must never break its caller.
                return new GetReplHoverResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }
    }
}
