using Microsoft.CodeAnalysis.Scripting;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
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
                var options = ScriptOptions.Default
                    .WithReferences(allRefs)
                    .WithImports(imports);

                // Inject pipeline tracking for all LINQ methods — semantic guard
                // first so name collisions that cannot accept tracking
                // (void/string returns like List<T>.Reverse() / string.Join)
                // are left untouched.
                var syntaxTree = Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree.ParseText(code);
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
                return (false, string.Empty, ex.Message, new List<string>());
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


    }
}
