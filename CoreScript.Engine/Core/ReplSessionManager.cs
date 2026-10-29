using Microsoft.CodeAnalysis.Scripting;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Context;
using CoreScript.Engine.Logging;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using Microsoft.CodeAnalysis;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ReplSessionManager
    {
        private class ReplSession
        {
            public ScriptState<object> State { get; set; }
            public ExecutionGlobals Globals { get; set; }
            public DateTime LastUsed { get; set; }
        }

        private static readonly Dictionary<string, ReplSession> _sessions = new Dictionary<string, ReplSession>();
        private static readonly object _lock = new object();

        /// <summary>
        /// The wall-clock budget for ONE REPL submission, in seconds.
        /// <para>
        /// ⚠⚠ WHY THIS IS SET HERE AND NOT LEFT TO THE FIELD DEFAULT. <see cref="ExecutionGlobals"/>
        /// defaults to 10 s, which is right for a compiled gallery tool but far too tight for an
        /// agent-written query over a real building. It must also stay UNDER the MCP's gRPC
        /// deadline (grpc_client.DEFAULT_TIMEOUT_S = 120 s) so the script is killed with a clear
        /// TimeoutException BEFORE the client gives up on the reply — otherwise the caller reports
        /// "Revit did not answer" while the script is still running, which is the misdiagnosis
        /// that deadline policy exists to prevent.
        /// </para>
        /// <para>
        /// ⚠ It is RE-APPLIED on every submission (see <see cref="ExecutionGlobals.SetTimeoutBudget"/>).
        /// The session's ExecutionGlobals outlives a single snippet, so without the reset one
        /// script's SetExecutionTimeout(1800) would silently become every later script's budget.
        /// A script that genuinely needs longer still calls SetExecutionTimeout at its first line.
        /// </para>
        /// </summary>
        public const int ReplTimeoutSeconds = 90;

        public static async Task<(bool isSuccess, string output, string error, List<string> structuredOutput)> ExecuteAsync(string code, string sessionId, ICoreScriptContext context, string licenseTier = "free")
        {
            // ⚠ Declared OUTSIDE the try so the catch blocks can reach it. A failure must be
            // able to say what it undid, and that answer only exists after the rollback.
            ScriptRunScope runScope = null;
            try
            {
                LicenseContext.Tier = licenseTier;
                var lowerCode = code.Trim().ToLowerInvariant();

                // 1. Intercept Meta-Commands BEFORE any wrapping or session logic
                if (lowerCode == "reset" || lowerCode == "clear vars" || lowerCode == "reset vars")
                {
                    ResetSession(sessionId);
                    return (true, "REPL session reset. All variables cleared.", string.Empty, new List<string>());
                }

                ReplSession session;
                lock (_lock)
                {
                    _sessions.TryGetValue(sessionId, out session);
                    if (session != null) session.LastUsed = DateTime.UtcNow;
                }

                if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                {
                    if (session == null)
                    {
                        return (true, "No active variables. (Session is empty)", string.Empty, new List<string>());
                    }

                    var vars = session.State.Variables;
                    if (!vars.Any())
                    {
                        return (true, "No active variables found in this session.", string.Empty, new List<string>());
                    }

                    // Roslyn ScriptState keeps shadowed variables (var x = 5; var x = 12 creates two 'x' vars).
                    // We GroupBy name and take the Last() to only show the most recently defined value for each variable name.
                    var uniqueVars = vars.GroupBy(v => v.Name).Select(g => g.Last()).ToList();

                    var sb = new System.Text.StringBuilder();
                    sb.AppendLine("=== Active REPL Variables ===");
                    foreach (var v in uniqueVars)
                    {
                        string typeName = v.Type.Name;
                        string valStr = v.Value?.ToString() ?? "null";

                        // Truncate extremely long string values to avoid blowing up the console
                        if (valStr.Length > 200) valStr = valStr.Substring(0, 200) + "... [truncated]";

                        sb.AppendLine($"[{typeName}] {v.Name} = {valStr}");
                    }
                    return (true, sb.ToString().TrimEnd(), string.Empty, new List<string>());
                }

                if (lowerCode.StartsWith("inspect ") && session != null)
                {
                    var varName = code.Trim().Substring(8).Trim();
                    var vars = session.State.Variables;
                    var targetVar = vars.LastOrDefault(v => v.Name == varName);
                    if (targetVar == null)
                    {
                        return (false, string.Empty, $"Variable '{varName}' not found in active session.", new List<string>());
                    }

                    try
                    {
                        var json = JsonSerializer.Serialize(targetVar.Value, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = ExecutionGlobals.SerializerOptions.PropertyNamingPolicy, Converters = { new RevitElementConverterFactory(), new ElementIdConverter(), new DocumentConverter(), new XYZConverter(), new ParameterConverter() } });
                        return (true, json, string.Empty, new List<string>());
                    }
                    catch (Exception ex)
                    {
                        return (false, string.Empty, $"Failed to inspect '{varName}': {ex.Message}", new List<string>());
                    }
                }

                // --- Path-based Reference Gathering (via ScriptReferenceProvider) ---
                var revitRefs = Rewriters.ScriptReferenceProvider.GetRevitReferences("ReplSessionManager");
                var coreRefs = Rewriters.ScriptReferenceProvider.GetCoreReferences("ReplSessionManager");

                // Prepare script options
                var imports = Rewriters.ScriptReferenceProvider.GetImports(includeRevitSelection: true);
                var allRefs = coreRefs.Concat(revitRefs).ToList();
                // ⚠ TRANSACTION GRANULARITY — the ACCURATE, line-numbered check, run on the
                // REPL path too. It previously existed only on the tool path (CodeRunner), so
                // the MCP agent — which comes through HERE — saw only the MCP-side regex,
                // which warns whenever `foreach` and `.SetVal(` merely appear in the same
                // snippet. MEASURED 2026-10-29: a read-only loop plus a single write AFTER it
                // was reported as an unwrapped loop write — a false positive on correct code,
                // which teaches an agent to ignore the warning that matters.
                _ = TransactionGranularityAdvisory.Warn(context, code, sessionId);

                var options = ScriptOptions.Default
                    .WithReferences(allRefs)
                    .WithImports(imports)
                    // ⚠ WHY DEBUG INFO. A runtime exception's StackTrace carried NO file or
                    // line — Roslyn scripting emits no debug information by default — so a
                    // divide-by-zero reported "Attempted to divide by zero." and nothing else.
                    // That directly contradicted the tool descriptions, which promise error
                    // type, line number and suggested fix; only COMPILE errors had lines.
                    // MEASURED before the fix (2026-10-29):
                    //     STACK=[   at Submission#23.<<Initialize>>d__0.MoveNext()]
                    // With sequence points emitted the frame reads `in script:line N`, and the
                    // `#line 1 "script"` directive above makes N the USER's own line — the
                    // same coordinate system DiagnosticMapper uses for compile errors.
                    .WithEmitDebugInformation(true);

                // Inject pipeline tracking for all LINQ methods — semantic guard
                // first so name collisions that cannot accept tracking
                // (void/string returns like List<T>.Reverse() / string.Join)
                // are left untouched.
                //
                // ⚠⚠ PARSE-KIND MATCH (2026-10-29). This MUST parse with
                // SourceCodeKind.Script — the SAME kind SemanticTrackingGuard uses.
                // Previously this used default (Regular) kind, which wraps bare
                // top-level statements in error-recovery nodes whose SpanStart
                // positions differ from the Script-kind tree the guard parses. The
                // guard correctly identified StringBuilder.Append as "skip" via
                // ShouldSkip, but the skip entry's (SpanStart, "Append") never matched
                // the rewriter's node positions — so the rewriter wrapped it anyway
                // and the user got CS0411 TrackEnumerable<T> on legal code.
                //
                // With both on Script kind, the guard's tree and the rewriter's tree
                // have identical span positions for the same invocations, the skip set
                // matches, and name collisions are correctly left unwrapped.
                var syntaxTree = Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree.ParseText(code,
                    new Microsoft.CodeAnalysis.CSharp.CSharpParseOptions(
                        languageVersion: Microsoft.CodeAnalysis.CSharp.LanguageVersion.Latest,
                        kind: Microsoft.CodeAnalysis.SourceCodeKind.Script));
                var replRoot = syntaxTree.GetRoot();
                var skipCalls = Rewriters.SemanticTrackingGuard.ComputeSkipCalls(replRoot, imports, allRefs);
                var pipelineRewriter = new Rewriters.PipelineTrackingRewriter(skipCalls);
                var rewrittenRoot = pipelineRewriter.Visit(replRoot);

                // Inject the timeout check into every loop body.
                // ⚠⚠ THIS WAS MISSING ON THE REPL PATH (found 2026-10-27). ScriptRewriter runs all
                //   three rewriters for the COMPILED-tool path, but this method ran only the
                //   pipeline one — so ExecutionGlobals.CheckTimeout() was never emitted into an
                //   agent snippet, the deadline armed by SetContext was never tested, and a
                //   `while (true) {}` from an MCP call ran to completion. Measured live: a 25 s
                //   loop returned normally, while calling CheckTimeout() by hand threw at 1 s —
                //   i.e. the mechanism worked and only the injection was absent.
                //   A timeout that is never checked is not a timeout: it is a comment.
                rewrittenRoot = new Rewriters.TimeoutRewriter().Visit(rewrittenRoot);

                code = rewrittenRoot.ToFullString();

                // Inject ScriptApi and resolve Parameter ambiguity, then RE-ANCHOR
                // THE LINE NUMBERING.
                //
                // ⚠ `#line 1 "script"` is not cosmetic. The two prepended using
                // lines used to push every diagnostic down by exactly 2 — measured
                // on five independent failures, every one +2 — so the engine told
                // its callers to look at the wrong line, and the single most
                // reported complaint about this engine was exactly that. With the
                // directive in place GetMappedLineSpan() returns the USER's line.
                //
                // The column cannot be fixed this way (a #line directive never
                // remaps columns, and the rewriter really did insert text at that
                // offset); DiagnosticMapper.MapReplDiagnostics subtracts the
                // injected wrapper prefix instead. Both are needed.
                string fullCode = "using static CoreScript.Engine.Globals.ScriptApi;" + CoreScript.Engine.Globals.ScriptSurface.StaticImportsLine + Environment.NewLine +
                                  "using Parameter = Autodesk.Revit.DB.Parameter;" + Environment.NewLine +
                                  "#line 1 \"script\"" + Environment.NewLine +
                                  code;

                // ── ALL-OR-NOTHING ENVELOPE ───────────────────────────────────────
                // ⚠⚠ THE DEFECT THIS CLOSES (found by review, 2026-10-29). Each
                // auto-transacting write commits ON ITS OWN. A script that wrote and then
                // threw therefore reported FAILURE while leaving its earlier writes in the
                // model — the caller is told "it did not run" and the model says otherwise.
                // Measured: SetVal("Comments", …) followed by a throw left the comment on the
                // door.
                //
                // A TransactionGroup is the all-or-nothing unit Revit gives us: it does not
                // change the granularity of the writes inside (they still commit one by one,
                // so an un-wrapped loop still costs N undo entries — that is a SEPARATE
                // contract, guarded by TransactionGranularityAdvisory), it only makes the
                // whole set reversible. Commit on success, roll back on failure.
                //
                // ⚠ READ-ONLY SCRIPTS ARE EXEMPT — with one honest exception. MightWrite() is a
                // pre-filter over the source with comments and string literals blanked, so a
                // query that merely MENTIONS a write verb (in a comment, a message, a parameter
                // name) opens no group and reads stay bit-identical. What it cannot tell is
                // whether a verb it does find is reachable: a snippet that names a write verb in
                // a dead branch still opens a group, and that group commits empty. Opening one
                // is harmless to the model, but it is not free to the user, so do not claim a
                // query never opens a group.
                runScope = ScriptRunScope.TryBegin(context.Doc, code, sessionId);

                if (session == null)
                {
                    // Intercept "vars" or "list" commands when no session exists
                    if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                    {
                        return (true, "No active variables. (Session is empty)", string.Empty, new List<string>());
                    }

                    // Start new session
                    var globals = new ExecutionGlobals(context, new Dictionary<string, object>(), new Dictionary<string, object>());
                    globals.SetTimeoutBudget(ReplTimeoutSeconds);
                    ExecutionGlobals.SetContext(globals);
                    try
                    {
                        // Create a loader aware of our isolated ALC to prevent Roslyn from
                        // loading a second copy of CoreScript.Engine into its own LoadContext.
                        var loader = new Microsoft.CodeAnalysis.Scripting.Hosting.InteractiveAssemblyLoader();
                        var currentAlc = System.Runtime.Loader.AssemblyLoadContext.GetLoadContext(typeof(ReplSessionManager).Assembly);
                        if (currentAlc != null)
                        {
                            foreach (var asm in currentAlc.Assemblies)
                            {
                                try { loader.RegisterDependency(asm); } catch { }
                            }
                        }

                        // NO globals: parameter — avoids cross-ALC type cast.
                        // Context is accessible via ScriptApi (using static) + ExecutionGlobals.SetContext.
                        var script = CSharpScript.Create(fullCode, options, assemblyLoader: loader);
                        var state = await script.RunAsync();
                        runScope?.MarkSucceeded();
                        session = new ReplSession { State = state, Globals = globals, LastUsed = DateTime.UtcNow };
                    }
                    finally
                    {
                        context.PipelineDiagnostics = new List<int>(globals.PipelineDiagnostics);
                        ExecutionGlobals.ClearContext();
                    }

                }
                else
                {
                    // Intercept "vars" or "list" commands for an active session

                    if (lowerCode == "clear vars" || lowerCode == "reset" || lowerCode == "reset vars")
                    {
                        ResetSession(sessionId);
                        return (true, "REPL session reset. All variables cleared.", string.Empty, new List<string>());
                    }

                    if (lowerCode.StartsWith("inspect "))
                    {
                        var varName = code.Trim().Substring(8).Trim();
                        var vars = session.State.Variables;
                        var targetVar = vars.LastOrDefault(v => v.Name == varName);
                        if (targetVar == null)
                        {
                            return (false, string.Empty, $"Variable '{varName}' not found in active session.", new List<string>());
                        }

                        try
                        {
                            var json = JsonSerializer.Serialize(targetVar.Value, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = ExecutionGlobals.SerializerOptions.PropertyNamingPolicy, Converters = { new RevitElementConverterFactory(), new ElementIdConverter(), new DocumentConverter(), new XYZConverter(), new ParameterConverter() } });
                            return (true, json, string.Empty, new List<string>());
                        }
                        catch (Exception ex)
                        {
                            return (false, string.Empty, $"Failed to inspect '{varName}': {ex.Message}", new List<string>());
                        }
                    }

                    if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                    {
                        var vars = session.State.Variables;
                        if (!vars.Any())
                        {
                            return (true, "No active variables found in this session.", string.Empty, new List<string>());
                        }

                        // Roslyn ScriptState keeps shadowed variables (var x = 5; var x = 12 creates two 'x' vars).
                        // We GroupBy name and take the Last() to only show the most recently defined value for each variable name.
                        var uniqueVars = vars.GroupBy(v => v.Name).Select(g => g.Last()).ToList();

                        var sb = new System.Text.StringBuilder();
                        sb.AppendLine("=== Active REPL Variables ===");
                        foreach (var v in uniqueVars)
                        {
                            string typeName = v.Type.Name;
                            string valStr = v.Value?.ToString() ?? "null";

                            // Truncate extremely long string values to avoid blowing up the console
                            if (valStr.Length > 200) valStr = valStr.Substring(0, 200) + "... [truncated]";

                            sb.AppendLine($"[{typeName}] {v.Name} = {valStr}");
                        }
                        return (true, sb.ToString().TrimEnd(), string.Empty, new List<string>());
                    }

                    // Continue existing session
                    session.Globals.UpdateContext(context);
                    session.Globals.PipelineDiagnostics.Clear();
                    // ⚠ Reset the budget per submission — see ReplTimeoutSeconds. Without this, a
                    //   script that called SetExecutionTimeout(1800) would raise the limit for
                    //   every later snippet in the same REPL session.
                    session.Globals.SetTimeoutBudget(ReplTimeoutSeconds);
                    ExecutionGlobals.SetContext(session.Globals);

                    try
                    {
                        session.State = await session.State.ContinueWithAsync(fullCode, options);
                        runScope?.MarkSucceeded();
                    }
                    finally
                    {
                        context.PipelineDiagnostics = new List<int>(session.Globals.PipelineDiagnostics);
                        ExecutionGlobals.ClearContext();
                    }
                }

                lock (_lock)
                {
                    _sessions[sessionId] = session;
                    PruneSessions();
                }

                // --- Structured Output Capture ---
                var structuredOutput = new List<string>();
                var contextType = context.GetType();
                var logProp = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (logProp != null)
                {
                    var log = logProp.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null)
                    {
                        foreach (var item in log)
                        {
                            structuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                        }
                    }
                }

                // Collect Println output (e.g. from Println calls in the script)
                var printLog = string.Join(Environment.NewLine, context.PrintLog);

                // Process the return value of the expression
                var retVal = session.State.ReturnValue;
                var output = string.Empty;

                if (retVal != null)
                {
                    bool hasStructuredOutput = structuredOutput.Count > 0;
                    bool isEnumerable = retVal is System.Collections.IEnumerable && !(retVal is string);

                    // If a UI component like .Table() was generated, don't dump the raw data to the console too
                    if (hasStructuredOutput && isEnumerable)
                    {
                        output = string.Empty;
                    }
                    // If it's a raw collection, print a truncated list instead of massive JSON blocks.
                    else if (isEnumerable)
                    {
                        try
                        {
                            var list = new List<string>();
                            int count = 1;
                            int maxItems = 50;

                            foreach (var item in (System.Collections.IEnumerable)retVal)
                            {
                                if (count > maxItems)
                                {
                                    list.Add($"... (output truncated. Use .Table() for full inspection)");
                                    break;
                                }

                                if (item is Autodesk.Revit.DB.Element el)
                                {
                                    list.Add($"{count:D2} - {el.Name} ({el.Id.Value})");
                                }
                                else if (item != null)
                                {
                                    string str = item.ToString().Trim();

                                    // Remove ugly curly braces from anonymous types
                                    if (str.StartsWith("{") && str.EndsWith("}"))
                                    {
                                        str = str.Substring(1, str.Length - 2).Trim();
                                    }

                                    list.Add($"{count:D2} - {str}");
                                }
                                else
                                {
                                    list.Add($"{count:D2} - null");
                                }
                                count++;
                            }

                            output = string.Join("\n", list);
                        }
                        catch
                        {
                            output = retVal.ToString();
                        }
                    }
                    // For primitives, strings, and standard objects, use default ToString
                    else
                    {
                        output = retVal.ToString();
                    }
                }

                // Build the pipeline diagnostics line (appended after the main output)
                var diags = context.PipelineDiagnostics;
                var pipelineLine = string.Empty;
                if (diags != null && diags.Count > 0)
                {
                    var diagTokens = diags.Select(d => d switch
                    {
                        -1 => "chart",
                        -2 => "table",
                        -3 => "✓",
                        -4 => "✗",
                        _ => d.ToString()
                    });
                    pipelineLine = "Pipeline: [" + string.Join(" → ", diagTokens) + "]";
                }

                // Combine: printLog, return value, pipeline diagnostics
                var parts = new List<string>();
                if (!string.IsNullOrEmpty(printLog))
                    parts.Add(printLog);
                if (!string.IsNullOrEmpty(output))
                    parts.Add(output);
                if (!string.IsNullOrEmpty(pipelineLine) && ExecutionGlobals.ShowPipeline)
                    parts.Add(pipelineLine);

                var finalOutput = string.Join(Environment.NewLine, parts);

                return (true, finalOutput, string.Empty, structuredOutput);
            }
            catch (Microsoft.CodeAnalysis.Scripting.CompilationErrorException cex)
            {
                // A compile error is the ONE thing the caller most needs to be
                // accurate, so it is reported in the user's own coordinates rather
                // than in the text the engine actually compiled. `code` here is the
                // REWRITTEN submission, which is what MapReplDiagnostics needs to
                // locate (and subtract) the injected wrapper prefixes.
                LicenseContext.Reset();
                // A compile error means NOTHING executed, so there is nothing to undo — but the
                // envelope must still be CLOSED, or the next submission would nest inside it.
                _ = runScope?.RollbackNow();
                var mapped = DiagnosticMapper.MapReplDiagnostics(cex.Diagnostics, code, InjectedPreludeLines);
                string message = mapped.Count > 0
                    ? string.Join(Environment.NewLine, mapped.Select(m => m.ToString()))
                    : cex.Message;
                FileLogger.LogError($"[REPL] Compile error: {message}");
                return (false, string.Empty, message, new List<string>());
            }
            catch (Exception ex)
            {
                LicenseContext.Reset();
                FileLogger.LogError($"[REPL] Error: {ex.Message}");

                // ⚠ A runtime failure must name the line, because the tool descriptions say
                // it does. `ex.Message` alone ("Attempted to divide by zero.") sends the
                // caller hunting through a snippet it cannot see. See WithEmitDebugInformation
                // above for why the frame only became available once debug info was emitted.
                string where = DescribeRuntimeLocation(ex);
                string message = string.IsNullOrEmpty(where)
                    ? ex.Message
                    : ex.Message + Environment.NewLine + where;

                // ⚠ THE FAILURE MUST DESCRIBE THE MODEL, NOT JUST THE EXCEPTION. Undo whatever
                // this script had already committed, and report the OUTCOME of that attempt —
                // a rollback that FAILED is a partial edit, and must never be reported as a
                // clean failure. The exception is passed in because ONE failure mode can defeat
                // the envelope: a write attempted outside any transaction (see RollbackNow).
                string undone = runScope?.RollbackNow(ex.Message) ?? string.Empty;
                if (!string.IsNullOrEmpty(undone))
                    message += Environment.NewLine + Environment.NewLine + undone;

                FileLogger.LogError($"[REPL] Error location: {(string.IsNullOrEmpty(where) ? "<no script frame>" : where.Trim())}");
                FileLogger.LogError($"[REPL] Rollback: {(string.IsNullOrEmpty(undone) ? "<nothing to undo>" : undone.Trim())}");
                return (false, string.Empty, message, new List<string>());
            }
            finally
            {
                // Commits the envelope when the script SUCCEEDED. On the failure path this is
                // a no-op: RollbackNow() has already finished and marked the scope closed.
                runScope?.Dispose();
            }
        }

        /// <summary>
        /// The FIRST stack frame that names the user's script, rendered for a human, or
        /// empty when the trace carries no script frame.
        ///
        /// <para>
        /// ⚠ <b>First, not deepest.</b> Frames below the script are engine internals
        /// (<c>ScriptApi</c>, <c>Tx</c>, <c>SetVal</c>) and name no line the caller wrote —
        /// reporting one of those would be a line number that is technically real and
        /// practically useless. The frame that matters is the caller's own call site.
        /// </para>
        /// <para>
        /// ⚠ <b>Never throws.</b> This runs inside the failure path; an exception here would
        /// replace the real error with a reporting error.
        /// </para>
        /// </summary>
        private static string DescribeRuntimeLocation(Exception ex)
        {
            try
            {
                var trace = ex?.StackTrace;
                if (string.IsNullOrEmpty(trace))
                    return string.Empty;

                foreach (var raw in trace.Split('\n'))
                {
                    var frame = raw.Trim();
                    if (frame.Length == 0)
                        continue;

                    var m = System.Text.RegularExpressions.Regex.Match(
                        frame, @"in\s+script\s*:\s*line\s+(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (m.Success)
                        return "  at your line " + m.Groups[1].Value + " — the script stopped here.";
                }

                return string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }

        /// <summary>
        /// Lines this class prepends to every submission. DiagnosticMapper
        /// subtracts them to map a diagnostic back onto the user's own line.
        /// </summary>
        private const int InjectedPreludeLines = 2;

        private const int MAX_SESSIONS = 40;

        private static void PruneSessions()
        {
            // Every unique session id holds a Roslyn ScriptState (all compiled
            // state + assemblies). MCP servers that use a fresh id per call can
            // accumulate unbounded sessions otherwise — evict the least-recently
            // used once we pass the cap so memory stays bounded.
            if (_sessions.Count <= MAX_SESSIONS) return;
            var evict = _sessions.OrderBy(kv => kv.Value.LastUsed)
                                 .Take(_sessions.Count - MAX_SESSIONS)
                                 .Select(kv => kv.Key).ToList();
            foreach (var k in evict)
            {
                _sessions.Remove(k);
                FileLogger.Log($"[REPL] Pruned idle session '{k}' (memory cap {MAX_SESSIONS}).");
            }
        }

        public static void ResetSession(string sessionId)
        {
            lock (_lock)
            {
                if (_sessions.ContainsKey(sessionId))
                {
                    _sessions.Remove(sessionId);
                    FileLogger.Log($"[REPL] Session '{sessionId}' reset.");
                }
            }
        }

        /// <summary>
        /// The verbs that can change the model. Used ONLY as a cheap pre-filter so a
        /// read-only submission never opens a TransactionGroup — a false NEGATIVE costs
        /// atomicity (the behaviour before this existed), never correctness, because the
        /// group only wraps; it does not perform the writes.
        /// </summary>
        private static readonly string[] WriteVerbs =
        {
            // Paracore methods (auto-transacted)
            "SetVal", "SetNum", "SetParam", "SetTypeVal", "SetTypeNum",
            "Delete(", "Hide(", "Unhide(", "Isolate(",
            "Transact(", "NewType", "SwapSymbol",
            // Raw Revit API write verbs — NOT auto-transacted, but they CAN change the
            // model. If we miss one, MightWrite returns false, the TransactionGroup never
            // opens, and RollbackNow never runs — so a failed raw-API write gets the raw
            // exception with NO rollback sentence at all. That is worse than a false
            // positive on MightWrite.
            "Duplicate(", "Wall.Create(", "doc.Create.", "NewFamilyInstance(",
            // ⚠ "Transaction(" covers `new Transaction(`, `new Autodesk.Revit.DB.Transaction(`
            //   AND `new SubTransaction(` (which ends with it). The old entry was
            //   "new Transaction", which missed every QUALIFIED form — and a script that
            //   opened a raw qualified transaction around raw `p.Set(...)` calls matched no
            //   verb at all, so it ran with no envelope. Measured 2026-10-29.
            "Transaction(", "TransactionGroup(",
            "MoveElement", "ChangeTypeId", "set_Parameter",
        };

        /// <summary>
        /// Comment bodies and string/char literal CONTENTS, blanked with spaces so every
        /// offset and line number survives. Mirrors <c>strip_code_noise</c> in
        /// <c>mcp_core/tool_helpers.py</c>.
        ///
        /// <para>
        /// ⚠⚠ WHY A SUBSTRING FILTER NEEDS THIS (2026-10-29). <see cref="WriteVerbs"/> is an
        /// <c>IndexOf</c> scan over the raw source, so the WORD "SetVal" inside a comment or a
        /// string opened a <c>TransactionGroup</c> with nothing in it. "A false positive only
        /// costs an empty group" was the justification for erring wide, and it is still the
        /// right trade for a real verb — but a verb in PROSE is not a false positive that buys
        /// any safety, it is noise that opens and commits a group on a query.
        /// </para>
        /// </summary>
        private static readonly System.Text.RegularExpressions.Regex _codeNoise =
            new System.Text.RegularExpressions.Regex(
                @"@""(?:[^""]|"""")*""|""(?:\\.|[^""\\\n])*""|'(?:\\.|[^'\\\n])*'|//[^\n]*|/\*.*?\*/",
                System.Text.RegularExpressions.RegexOptions.Singleline |
                System.Text.RegularExpressions.RegexOptions.Compiled);

        private static string StripCodeNoise(string code)
        {
            if (string.IsNullOrEmpty(code)) return code ?? string.Empty;
            return _codeNoise.Replace(code, m =>
                System.Text.RegularExpressions.Regex.Replace(m.Value, @"[^\n]", " "));
        }

        private static bool MightWrite(string code)
        {
            if (string.IsNullOrEmpty(code))
                return false;
            string scanned = StripCodeNoise(code);
            for (int i = 0; i < WriteVerbs.Length; i++)
            {
                if (scanned.IndexOf(WriteVerbs[i], StringComparison.Ordinal) >= 0)
                    return true;
            }
            return false;
        }

        /// <summary>
        /// ALL-OR-NOTHING envelope around ONE REPL submission.
        ///
        /// <para>
        /// ⚠ <b>Why.</b> Each auto-transacting write commits on its own, so a script that
        /// wrote and then threw reported FAILURE while leaving its earlier writes applied.
        /// A <c>TransactionGroup</c> is Revit's all-or-nothing unit: the writes inside still
        /// commit one by one (granularity is unchanged — see
        /// <see cref="TransactionGranularityAdvisory"/>), but the set as a whole can be undone.
        /// </para>
        /// <para>
        /// ⚠ <b>Every outcome is reported, including the bad ones.</b> A rollback that
        /// returns anything other than <c>RolledBack</c> means the model may still hold part
        /// of a failed script; saying "failed" without saying that would be the original
        /// defect wearing a different hat.
        /// </para>
        /// </summary>
        private sealed class ScriptRunScope : IDisposable
        {
            private readonly TransactionGroup _group;
            private bool _succeeded;
            private bool _closed;

            private ScriptRunScope(TransactionGroup group) { _group = group; }

            /// <summary>
            /// Opens the envelope, or returns null when there is nothing to protect: no
            /// document, no write verb in the source, or a group Revit refused to start.
            /// A null scope is the pre-existing behaviour, which is why every use is `?.`.
            /// </summary>
            public static ScriptRunScope TryBegin(Autodesk.Revit.DB.Document doc, string userCode, string scriptName)
            {
#pragma warning disable CA1031 // An envelope that cannot start must not stop the script.
                try
                {
                    if (doc == null || !MightWrite(userCode))
                        return null;

                    string name = "Paracore: " + (string.IsNullOrWhiteSpace(scriptName) ? "script" : scriptName.Trim());
                    if (name.Length > 60) name = name.Substring(0, 60);

                    var group = new TransactionGroup(doc, name);
                    var status = group.Start();
                    if (status != TransactionStatus.Started)
                    {
                        FileLogger.LogWarning($"[REPL] TransactionGroup refused to start ({status}) — running WITHOUT all-or-nothing protection.");
                        group.Dispose();
                        return null;
                    }
                    return new ScriptRunScope(group);
                }
                catch (Exception ex)
                {
                    FileLogger.LogWarning($"[REPL] Could not open the all-or-nothing envelope: {ex.Message} — running without it.");
                    return null;
                }
#pragma warning restore CA1031
            }

            public void MarkSucceeded() { _succeeded = true; }

            /// <summary>
            /// Rolls the envelope back and returns a sentence describing what really happened,
            /// or an empty string when there was nothing to undo.
            /// </summary>
            /// <param name="failureMessage">
            /// The exception message that ended the script, when there was one. ⚠ It is not
            /// decoration: a write attempted OUTSIDE any transaction can be partly applied by
            /// Revit and still throw, and no TransactionGroup can undo a write that was never in
            /// a transaction. In that case the envelope is rolled back correctly and the model is
            /// still changed — so the sentence must not claim otherwise.
            /// </param>
            public string RollbackNow(string failureMessage = null)
            {
                if (_closed || _group == null)
                    return string.Empty;

#pragma warning disable CA1031
                try
                {
                    if (_group.GetStatus() != TransactionStatus.Started)
                    {
                        _closed = true;
                        return string.Empty;
                    }

                    var status = _group.RollBack();
                    _closed = true;

                    if (status == TransactionStatus.RolledBack)
                    {
                        // ⚠⚠ MEASURED 2026-10-29 — THE CLAIM BELOW WAS FALSE.
                        //
                        //   var wt = (WallType)GetElements("WallTypes").First();
                        //   var dup = wt.Duplicate("PC-PROBE-RB");   // <-- outside a transaction
                        //   dup.Delete();
                        //
                        //   Reply: "Execution Failed: Attempt to modify the model outside of
                        //           transaction. at your line 2" + "↩ ROLLED BACK … The model is
                        //           unchanged."
                        //   Measured: wall types 31 -> 32. The type WAS created. Revit applied
                        //   part of a call it then refused, and `Duplicate` left the copy with
                        //   the SOURCE name (397, 972330…972336 all "Exterior - Brick on Mtl.
                        //   Stud", every one unused).
                        //
                        //   The rollback itself was not wrong — there was nothing of ours inside
                        //   a transaction to undo. The SENTENCE was wrong, and a false all-clear
                        //   is the one failure this project treats as unrecoverable: the caller
                        //   stops looking.
                        if (LooksLikeOutsideTransaction(failureMessage))
                        {
                            FileLogger.LogError("[REPL] Rolled back the envelope, but the failure was OUTSIDE a transaction — Revit may have applied part of it.");
                            return "↩ ROLLED BACK — the writes this script had committed inside a transaction were undone."
                                 + Environment.NewLine
                                 + "⚠ BUT the call that failed ran OUTSIDE any transaction. Revit can apply part of such a"
                                 + " call and still throw, so THE MODEL MAY HAVE CHANGED. Verify before continuing"
                                 + " — and wrap raw Revit API writes in Transact(\"…\", () => …).";
                        }

                        FileLogger.Log("[REPL] Rolled back the failed script's committed writes.");
                        return "↩ ROLLED BACK — the writes this script had already committed were undone. The model is unchanged.";
                    }

                    FileLogger.LogError($"[REPL] Rollback returned {status} (expected RolledBack) — THE MODEL MAY HOLD PART OF A FAILED SCRIPT.");
                    return $"⚠ ROLLBACK INCOMPLETE (status {status}) — part of this failed script may still be applied to the model.";
                }
                catch (Exception ex)
                {
                    _closed = true;
                    FileLogger.LogError($"[REPL] Rollback FAILED: {ex.Message}");
                    return $"⚠ ROLLBACK FAILED ({ex.Message}) — this failed script's earlier writes may still be applied.";
                }
#pragma warning restore CA1031
            }

            /// <summary>
            /// True when Revit refused a modification because no transaction was open.
            ///
            /// ⚠ Deliberately a MESSAGE test, not a type test: Revit raises plain
            /// <see cref="Autodesk.Revit.Exceptions.ArgumentException"/>-family exceptions with
            /// this wording, and the engine has no other signal that a call escaped the envelope.
            /// A false positive costs one cautious sentence on a failure that was already a
            /// failure; a false negative costs a false all-clear.
            /// </summary>
            private static bool LooksLikeOutsideTransaction(string message)
            {
                if (string.IsNullOrEmpty(message))
                    return false;
                return message.IndexOf("outside of transaction", StringComparison.OrdinalIgnoreCase) >= 0
                    || message.IndexOf("outside a transaction", StringComparison.OrdinalIgnoreCase) >= 0
                    || message.IndexOf("outside of a transaction", StringComparison.OrdinalIgnoreCase) >= 0;
            }

            public void Dispose()
            {
                if (_group == null)
                    return;

                try
                {
                    if (!_closed)
                    {
                        if (_succeeded)
                        {
                            var status = _group.GetStatus() == TransactionStatus.Started
                                ? _group.Commit()
                                : _group.GetStatus();

                            if (status != TransactionStatus.Committed)
                                FileLogger.LogError($"[REPL] Envelope commit returned {status} — the script reported success but its writes may not all be committed.");
                        }
                        else
                        {
                            // Reached when the method returned without an exception but never
                            // marked success (an early return). Undo, and never silently.
                            _ = RollbackNow();
                        }
                        _closed = true;
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[REPL] Envelope close FAILED: {ex.Message}");
                }
                finally
                {
                    try { _group.Dispose(); } catch { /* disposing must never mask the outcome */ }
                }
            }
        }

    }
}
