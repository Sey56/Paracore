using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Scripting;
using CoreScript.Engine.Context;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using CoreScript.Engine.Core.Rewriters;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;

namespace CoreScript.Engine.Core
{
    public class CodeRunner : ICodeRunner
    {
        private readonly IParameterService _parameterService;
        private readonly IScriptCompiler _scriptCompiler;
        private readonly IScriptParser _scriptParser;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptExecutor _scriptExecutor;
        private readonly IScriptRewriter _scriptRewriter;
        private readonly IParameterExtractor _parameterExtractor;
        private readonly IParameterOptionsExecutor _optionsExecutor;

        // V4: Assembly Cache for blazingly fast repeated runs
        private static readonly Dictionary<string, byte[]> _assemblyCache = new Dictionary<string, byte[]>();
        private static readonly object _cacheLock = new object();

        public CodeRunner()
        {
            var logger = new RunnerLogger();
            _parameterService = new ParameterService();
            _scriptCompiler = new ScriptCompiler();
            _scriptParser = new ScriptParser();
            _scriptCombiner = new ScriptCombiner(_scriptParser);
            _scriptExecutor = new ScriptExecutor();
            _scriptRewriter = new ScriptRewriter();
            _parameterExtractor = new ParameterExtractor(logger);
            _optionsExecutor = new ParameterOptionsExecutor(logger, _parameterService);
        }

        public ExecutionResult Execute(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            FileLogger.Log("🟢 Starting CodeRunner.Execute");

            string topLevelScriptName = "Unknown Script";
            string finalScriptCode = string.Empty; // Store for error mapping
            string scriptPath = string.Empty;

            try
            {
                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                var rawParameters = new Dictionary<string, object>(parameters);

                // Apply license tier from parameters (set by Python backend for enterprise users)
                if (parameters.TryGetValue("__license_tier__", out var tierObj) && tierObj is string tierStr)
                {
                    LicenseContext.Tier = tierStr;
                    FileLogger.Log($"[CodeRunner] License tier set to: {tierStr}");
                }

                if (parameters.ContainsKey("__script_name__"))
                {
                    var forcedName = parameters["__script_name__"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(forcedName))
                    {
                        topLevelScriptName = forcedName;
                    }
                }

                if (parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj != null)
                {
                    scriptPath = pathObj.ToString() ?? string.Empty;
                }

                List<ScriptFile> scriptFiles = new List<ScriptFile>();
                try
                {
                    var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(scriptContent, scriptJsonOptions) ?? new List<ScriptFile>();
                }
                catch
                {
                    scriptFiles.Add(new ScriptFile { FileName = topLevelScriptName + ".cs", Content = scriptContent });
                }

                string combinedUserCode = _scriptCombiner.Combine(scriptFiles);

                // --- V4 CORE FIX: Unit Regression ---
                if (richParams.Count == 0 && !string.IsNullOrEmpty(combinedUserCode))
                {
                    FileLogger.Log("[CodeRunner] No rich parameters provided. Extracting from source code to ensure [Unit] conversion works.");
                    richParams = _parameterExtractor.ExtractParameters(combinedUserCode);
                }

                if (richParams.Count > 0)
                {
                    _parameterService.HardenParameters(parameters, richParams);
                }
                // -------------------------------------

                string modifiedUserCode = _scriptRewriter.Rewrite(combinedUserCode, parameters);

                // V3.1: Start with #line hidden to ensure internal using doesn't count toward line numbers
                finalScriptCode = "#line hidden" + Environment.NewLine +
                                  "using static CoreScript.Engine.Globals.ScriptApi;" + CoreScript.Engine.Globals.ScriptSurface.StaticImportsLine + Environment.NewLine +
                                  "using CoreScript.Engine.Globals;" + Environment.NewLine +
                                  modifiedUserCode;

                try
                {
                    var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                    Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                    File.WriteAllText(debugPath, finalScriptCode);
                }
                catch { }

                var executionGlobals = new ExecutionGlobals(context, parameters, rawParameters);

                // --- V4 ELITE: MAGIC HYDRATION (Pre-calculate Resolution Pools) ---
                foreach (var p in richParams)
                {
                    if (_optionsExecutor.HasOptionsFunction(scriptContent, p.Name))
                    {
                        try
                        {
                            var pool = _optionsExecutor.ExecuteElementOptionsFunction(scriptContent, p.Name, context, parametersJson, richParams).GetAwaiter().GetResult();
                            if (pool != null && pool.Any())
                            {
                                executionGlobals.ResolutionPools[p.Name] = pool;
                                FileLogger.Log($"[CodeRunner] 🪄 Magic Hydration: Pre-calculated pool for '{p.Name}' ({pool.Count} items)");
                            }
                        }
                        catch (Exception ex)
                        {
                            FileLogger.LogError($"[CodeRunner] Failed to pre-calculate pool for '{p.Name}': {ex.Message}");
                        }
                    }
                }

                ExecutionGlobals.SetContext(executionGlobals);

                // --- V4 ELITE: Assembly Caching Logic ---
                string codeHash = _scriptCompiler.GetCodeHash(finalScriptCode);
                byte[]? cachedAssembly = null;
                lock (_cacheLock)
                {
                    if (_assemblyCache.TryGetValue(codeHash, out cachedAssembly))
                    {
                        FileLogger.Log($"[CodeRunner] ⚡ CACHE HIT: Re-using compiled assembly for {topLevelScriptName}");
                    }
                }

                // ── Dry run (reserved parameter) ───────────────────────────────
                // __dry_run__ travels the SAME channel as __script_name__ and
                // __license_tier__ — it is read straight out of the parameters
                // JSON, so no proto field is needed. When true the script is
                // executed inside a TransactionGroup that is ROLLED BACK
                // afterwards, and the elements it touched are reported.
                // The model is left unchanged.
                // Default OFF ⇒ bit-neutral for every existing caller.
                // ⚠ The predicate itself lives in ConfirmationRequirements.IsDryRun, because the
                // add-in's prompt has to exempt dry runs too — and if the two disagreed about what
                // counts as a dry run they would disagree about the gate's SCOPE, which is worse
                // than disagreeing about a word (rule 14).
                parameters.TryGetValue("__dry_run__", out var dryRunObj);
                bool isDryRun = ConfirmationRequirements.IsDryRun(dryRunObj);

                // ── [Confirm("TEXT")] — ENFORCED, not decorative ────────────────
                // ParameterExtractor compiles [Confirm("APPLY")] into
                //     Pattern = "^APPLY$"
                // and until now NOTHING on the execution path ever read Pattern
                // back: it was serialised to the UI (MetadataHandler) and ignored
                // everywhere else. A caller could therefore omit the confirmation —
                // or pass any value at all — and the script ran anyway, which made
                // the one gate a script author can declare an honour system.
                // (FORGE_SPEC §5: "the agent may dry_run; it must never be able to
                // satisfy the confirmation itself"; §6: "Not satisfy [Confirm]".)
                //
                // The shipped UI already enforces exactly this rule client-side
                // (rap-web/src/utils/parameterVisibility.ts — a Pattern parameter
                // must be non-empty AND must match), so enforcing the same rule
                // here cannot reject anything the UI would have accepted.
                //
                // ⚠ A DRY RUN IS DELIBERATELY EXEMPT. It is rolled back, so it
                // cannot satisfy a destructive gate, and refusing it would remove
                // the only safe way to preview a destructive script.
                if (!isDryRun)
                {
                    var unmetConfirmations = new List<string>();

                    // ⚠⚠ THE GATE MUST NOT DEPEND ON WHAT THE CALLER SENT (2026-10-07).
                    // `Pattern` is written in exactly ONE place — ParameterExtractor —
                    // and the extractor runs above only as a FALLBACK, when the caller
                    // sent no rich parameter list at all. Forge always sends a pre-built
                    // array of {"name","value"} entries with NO `pattern` key, so
                    // `richParams` carried no Pattern, this loop matched nothing, and
                    // the gate was permanently OPEN on the MCP path (proved live: a real
                    // run_tool with no confirmation supplied executed normally).
                    // Re-extract from the SOURCE, unconditionally. A gate a caller can
                    // disarm by omitting a field is not a gate.
                    var confirmSpecs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    if (!string.IsNullOrEmpty(combinedUserCode))
                    {
                        try
                        {
                            // ⚠ The rule lives in ONE place — ConfirmationRequirements — because the
                            // add-in's pre-dispatch prompt asks the same question. Two copies would
                            // drift (rule 14).
                            foreach (var kv in ConfirmationRequirements.FromScript(combinedUserCode, _parameterExtractor))
                                confirmSpecs[kv.Key] = kv.Value;
                        }
                        catch (Exception ex)
                        {
                            // FAIL CLOSED. If the source cannot be read we cannot prove it
                            // carries no destructive gate, and a gate that opens when it
                            // errors is not a gate.
                            FileLogger.LogError($"[CodeRunner] [Confirm] could not read confirmations from source: {ex.Message}");
                            var unverifiable = ExecutionResult.Failure(
                                "⛔ Confirmation could not be verified — NOTHING was executed.",
                                new[] { "The script's [Confirm] requirements could not be read from its source." });
                            unverifiable.ErrorMessage = "⛔ Confirmation could not be verified — nothing was executed. " +
                                                        $"Reading the script source failed: {ex.Message}";
                            unverifiable.ScriptName = topLevelScriptName;
                            return unverifiable;
                        }
                    }

                    // Belt-and-braces: also honour any Pattern the caller DID supply.
                    foreach (var sp in richParams)
                    {
                        if (!string.IsNullOrEmpty(sp.Name) && !string.IsNullOrEmpty(sp.Pattern))
                            confirmSpecs[sp.Name] = sp.Pattern;
                    }

                    // ⚠ Log the gate's own activity. Silence used to be indistinguishable
                    // from "the gate is broken" — the whole reason this defect survived a
                    // live test. Zero requirements is now a recorded fact, not an absence.
                    FileLogger.Log(confirmSpecs.Count == 0
                        ? $"[CodeRunner] [Confirm] gate: no [Confirm] requirements in '{topLevelScriptName}'."
                        : $"[CodeRunner] [Confirm] gate: {confirmSpecs.Count} requirement(s) — {string.Join(", ", confirmSpecs.Keys)}");

                    foreach (var spec in confirmSpecs)
                    {
                        string pName = spec.Key;
                        string pattern = spec.Value;

                        string supplied = string.Empty;
                        if (parameters.TryGetValue(pName, out var confirmVal) && confirmVal != null)
                            supplied = confirmVal.ToString()?.Trim() ?? string.Empty;

                        // The UI's hint for the common "^WORD$" form, so the caller is
                        // told the literal to type rather than a regex.
                        string requirement = ConfirmationRequirements.Literal(pattern);

                        if (supplied.Length == 0)
                        {
                            unmetConfirmations.Add($"{pName} — required. Pass exactly: {requirement}");
                            continue;
                        }

                        bool matches;
                        try
                        {
                            // pattern is machine-generated by Regex.Escape and is always
                            // a valid regex; the catch exists only so that a hand-edited
                            // pattern fails CLOSED rather than silently open.
                            matches = Regex.IsMatch(supplied, pattern);
                        }
                        catch (ArgumentException)
                        {
                            matches = false;
                        }

                        if (!matches)
                            unmetConfirmations.Add($"{pName} must be exactly: {requirement}");
                    }

                    if (unmetConfirmations.Count > 0)
                    {
                        FileLogger.LogError($"[CodeRunner] [Confirm] gate refused '{topLevelScriptName}': {string.Join(" | ", unmetConfirmations)}");
                        var refusal = ExecutionResult.Failure(
                            "⛔ Confirmation required — NOTHING was executed.",
                            unmetConfirmations.ToArray());
                        refusal.ErrorMessage = "⛔ Confirmation required — nothing was executed:" + Environment.NewLine +
                                               string.Join(Environment.NewLine, unmetConfirmations);
                        refusal.ScriptName = topLevelScriptName;
                        return refusal;
                    }
                }

                // ── TRANSACTION GRANULARITY — static pre-execution check ──────────
                // ⚠ Runs on the SAME path for BOTH MCPs: paracore-gen's REPL and
                // paracore-forge's dry_run / run_tool all arrive at this method (a
                // gallery tool is executed by the engine, not by its own compiler).
                // The forge validate_tool path does NOT come through here — and does
                // not need to: it compiles only, so it creates no transactions and
                // carries none of this hazard.
                //
                // Placed AFTER the [Confirm] gate on purpose: a refused script never
                // runs, so warning about its structure would only add noise to the
                // one message the agent must act on.
                //
                // ⚠ A WARNING, never a refusal. Rule 3: a gate must not have a
                // failure mode of its own. See the helper for why the check is
                // static rather than read off the run.
                WarnOnUnwrappedLoopWrites(combinedUserCode, context, topLevelScriptName);

                bool dryRunRolledBack = false;
                TransactionStatus dryRunRollbackStatus = TransactionStatus.Uninitialized;
                var dryAdded = new HashSet<ElementId>();
                var dryModified = new HashSet<ElementId>();
                var dryDeleted = new HashSet<ElementId>();

                // ⚠ Counters that make a ZERO diagnosable instead of silent.
                // `dryEventsSeen` counts every DocumentChanged the handler received;
                // `dryEventsOtherDocument` counts the ones the document filter threw
                // away. "events arrived, yet nothing was attributed to this document"
                // is the exact signature of the ReferenceEquals defect fixed below —
                // and it used to be reported as a plain, believable `would_modify: 0`.
                int dryEventsSeen = 0;
                int dryEventsOtherDocument = 0;

                // Which operations actually ran. A dry run could previously say only
                // HOW MANY elements changed, never what was done to them.
                //
                // ⚠ A List, NOT a HashSet. The count of a REPEATED name is the whole signal:
                // an un-wrapped per-element write (a SetVal/SetNum inside a loop with no
                // enclosing Transact) opens one transaction PER ELEMENT, and every one of
                // them carries the same name — "Set Mark" ×143. Deduplicating here throws
                // that away, and the report then reads transactions: ["Set Mark"], which says
                // ONE transaction when there were 143. A set is not a quantity.
                var dryTransactionNames = new List<string>();

                EventHandler<DocumentChangedEventArgs>? dryRunHandler = null;
                TransactionGroup? dryRunGroup = null;

                ExecutionResult result;
                try
                {
                    if (isDryRun)
                    {
                        // DocumentChanged is an APPLICATION-level event — the Revit API
                        // exposes no per-Document variant. Filter to the document we
                        // are actually running in.
                        dryRunHandler = (_, args) =>
                        {
                            dryEventsSeen++;

                            // ⚠⚠ DO NOT "SIMPLIFY" THIS BACK TO ReferenceEquals — that
                            // IS the defect this comment exists to prevent.
                            //
                            // MEASURED on a live Revit 2025, 2026-10-06, against the
                            // document the script was running in:
                            //     object.ReferenceEquals(Doc, Application.Documents[0]) == False
                            //     object.Equals(Doc, Application.Documents[0])          == True
                            //     GetHashCode() equal, PathName identical
                            // Revit hands back a DIFFERENT managed Document wrapper for the
                            // SAME open file depending on the access path, because
                            // Autodesk.Revit.DB.Document OVERRIDES Equals and GetHashCode
                            // (it does not implement IEquatable<Document>). The old
                            // ReferenceEquals guard therefore discarded EVERY event, so
                            // would_modify was ALWAYS 0 — including for a run that renamed
                            // 90 elements. A dry run that reports "no changes" for a script
                            // that changes 90 is worse than no dry run, because it is
                            // believed. Equals is Revit's own identity contract for this type.
                            if (!Equals(args.GetDocument(), context.Doc))
                            {
                                dryEventsOtherDocument++;
                                return;
                            }

                            foreach (var id in args.GetAddedElementIds()) dryAdded.Add(id);
                            foreach (var id in args.GetModifiedElementIds()) dryModified.Add(id);
                            foreach (var id in args.GetDeletedElementIds()) dryDeleted.Add(id);

                            foreach (var txName in args.GetTransactionNames())
                                if (!string.IsNullOrEmpty(txName)) dryTransactionNames.Add(txName);
                        };
                        context.UIApp.Application.DocumentChanged += dryRunHandler;

                        dryRunGroup = new TransactionGroup(context.Doc, $"Dry Run: {topLevelScriptName}");
                        dryRunGroup.Start();
                        FileLogger.Log($"[CodeRunner] 🧪 DRY RUN started for {topLevelScriptName}");
                    }

                    if (cachedAssembly != null)
                    {
                        // Run pre-compiled assembly (Blazingly Fast)
                        result = _scriptExecutor.ExecuteBinary(cachedAssembly, context);
                    }
                    else
                    {
                        // Compile fresh (Slow path)
                        FileLogger.Log($"[CodeRunner] 🐢 CACHE MISS: Compiling {topLevelScriptName}...");
                        var script = _scriptCompiler.CreateScript(finalScriptCode, topLevelScriptName);
                        var state = _scriptExecutor.ExecuteAsync(script).GetAwaiter().GetResult();

                        result = ExecutionResult.Success("Success", state.ReturnValue);

                        // Add to cache for next time
                        try
                        {
                            var assemblyBytes = _scriptCompiler.CompileToBytes(finalScriptCode);
                            lock (_cacheLock) { _assemblyCache[codeHash] = assemblyBytes; }
                            FileLogger.Log($"[CodeRunner] 💾 Cached assembly for future runs ({assemblyBytes.Length} bytes)");
                        }
                        catch (Exception cacheEx)
                        {
                            FileLogger.LogError($"[CodeRunner] Failed to cache assembly: {cacheEx.Message}");
                        }
                    }
                }
                finally
                {
                    if (isDryRun)
                    {
                        try
                        {
                            if (dryRunGroup != null)
                            {
                                if (dryRunGroup.GetStatus() == TransactionStatus.Started)
                                {
                                    // ⚠ MEASURE the rollback — never assert it. RollBack()
                                    // RETURNS the status it reached; the old code discarded
                                    // that value and set dryRunRolledBack = true
                                    // unconditionally, so a rollback that FAILED — i.e. a
                                    // dry run that really did mutate the model — was still
                                    // reported as rolled_back: true.
                                    // Measured on Revit 2025, 2026-10-06: a group holding a
                                    // committed inner transaction returns RolledBack, and the
                                    // content is genuinely restored (verified by re-reading it).
                                    dryRunRollbackStatus = dryRunGroup.RollBack();
                                    dryRunRolledBack = dryRunRollbackStatus == TransactionStatus.RolledBack;
                                    if (!dryRunRolledBack)
                                        FileLogger.LogError($"[CodeRunner] DRY RUN rollback returned {dryRunRollbackStatus} (expected RolledBack) — THE MODEL MAY HAVE BEEN MODIFIED.");
                                }
                                dryRunGroup.Dispose();
                            }
                        }
                        catch (Exception rollbackEx)
                        {
                            // A dry run whose rollback FAILED has mutated the model.
                            // Never swallow this — it is reported to the caller.
                            FileLogger.LogError($"[CodeRunner] DRY RUN rollback FAILED: {rollbackEx.Message}");
                        }

                        if (dryRunHandler != null)
                            context.UIApp.Application.DocumentChanged -= dryRunHandler;

                        FileLogger.Log($"[CodeRunner] 🧪 DRY RUN finished (rolledBack={dryRunRolledBack} status={dryRunRollbackStatus}, events={dryEventsSeen} otherDoc={dryEventsOtherDocument}, add={dryAdded.Count}, mod={dryModified.Count}, del={dryDeleted.Count}, tx=[{string.Join(", ", dryTransactionNames)}])");
                    }
                }

                if (isDryRun)
                {
                    // Declared file/folder parameters live OUTSIDE the Revit document,
                    // so the rollback cannot cover them. Report them: a dry run that
                    // silently omits this is worse than no dry run, because it would
                    // be believed. (InputType strings come from ParameterExtractor.)
                    var notReverted = new List<string>();
                    foreach (var p in richParams)
                    {
                        if (p.InputType != "File" && p.InputType != "SaveFile" && p.InputType != "Folder") continue;
                        if (parameters.TryGetValue(p.Name, out var fileVal) && fileVal != null &&
                            !string.IsNullOrWhiteSpace(fileVal.ToString()))
                        {
                            notReverted.Add($"{p.Name} ({p.InputType}) -> {fileVal}");
                        }
                    }

                    int dryRunTouched = dryAdded.Count + dryModified.Count + dryDeleted.Count;

                    // ⚠ A repeated transaction name IS the un-wrapped-loop signature: one
                    // transaction per element, all named alike. Count them so it is visible.
                    var dryTransactionCounts = dryTransactionNames
                        .GroupBy(n => n, StringComparer.OrdinalIgnoreCase)
                        .Select(g => new { name = g.Key, count = g.Count() })
                        .OrderByDescending(x => x.count)
                        .ToList();

                    var dryRunReport = JsonSerializer.Serialize(new
                    {
                        dry_run = true,
                        rolled_back = dryRunRolledBack,
                        rollback_status = dryRunRollbackStatus.ToString(),
                        would_add = dryAdded.Count,
                        would_modify = dryModified.Count,
                        would_delete = dryDeleted.Count,
                        // ⚠ Observability, so a zero can never again be silent: if
                        // transactions ran but nothing was attributed to this document,
                        // the caller can SEE that the preview is unreliable instead of
                        // reading a believable 0.
                        events_seen = dryEventsSeen,
                        events_other_document = dryEventsOtherDocument,
                        // Unchanged shape and meaning — distinct names only. (See the List
                        // note above for why the raw collection is no longer a set.)
                        transactions = dryTransactionNames.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                        // ⚠ NEW: name → how many times it ran. A count > 1 is the signature of a
                        // per-element write outside an enclosing Transact — each opened its OWN
                        // transaction, so N elements cost N undo entries, not 1.
                        transaction_counts = dryTransactionCounts,
                        repeated_transactions = dryTransactionCounts.Where(x => x.count > 1).ToList(),
                        sample_added_ids = dryAdded.Take(20).Select(id => id.Value).ToList(),
                        sample_modified_ids = dryModified.Take(20).Select(id => id.Value).ToList(),
                        sample_deleted_ids = dryDeleted.Take(20).Select(id => id.Value).ToList(),
                        not_reverted = notReverted
                    });

                    if (!dryRunRolledBack)
                    {
                        // The rollback did not report success ⇒ the model may have been
                        // mutated. This must never be phrased as "model unchanged".
                        context.Println(
                            $"⚠️ DRY RUN ROLLBACK FAILED (status={dryRunRollbackStatus}) — THE MODEL MAY HAVE BEEN MODIFIED. " +
                            $"Touched add {dryAdded.Count}, modify {dryModified.Count}, delete {dryDeleted.Count} element(s).");
                    }
                    else if (dryRunTouched > 0)
                    {
                        var repeated = dryTransactionCounts.Where(x => x.count > 1).ToList();
                        context.Println(
                            $"🧪 DRY RUN — model unchanged (rolled_back=True). " +
                            $"Would add {dryAdded.Count}, modify {dryModified.Count}, delete {dryDeleted.Count} element(s)." +
                            (dryTransactionCounts.Count > 0
                                ? $" Transactions: {string.Join(", ", dryTransactionCounts.Select(x => x.count > 1 ? $"{x.name} ×{x.count}" : x.name))}."
                                : string.Empty));
                        if (repeated.Count > 0)
                        {
                            // ⚠ A WARNING, not a refusal. This is detection; refusing here would
                            // be a gate with a failure mode of its own. The message must say what
                            // to DO, because the agent is the one who can fix it.
                            context.Println(
                                $"⚠️ TRANSACTION GRANULARITY — {repeated.Sum(x => x.count)} transaction(s) share " +
                                $"{repeated.Count} name(s): {string.Join(", ", repeated.Select(x => $"{x.name} ×{x.count}"))}. " +
                                "Each un-wrapped write opens its OWN transaction, so this cost N undo entries instead " +
                                "of 1. Wrap the WHOLE loop in ONE Transact(...) — a Transact() placed INSIDE the loop " +
                                "is the mistake.");
                        }
                    }
                    else if (dryEventsSeen == 0)
                    {
                        context.Println(
                            "🧪 DRY RUN — model unchanged. No document change was reported inside the transaction " +
                            "group, so there was nothing to revert and nothing would change.");
                    }
                    else
                    {
                        // ⚠⚠ THE ZERO THAT LIED. Transactions ran, yet no element change
                        // was attributed to this document. That is the exact signature of
                        // the ReferenceEquals defect fixed above, so report it as
                        // UNRELIABLE rather than as a believable "nothing to do".
                        context.Println(
                            $"🧪 DRY RUN — model unchanged, but ⚠ {dryEventsSeen} transaction(s) ran and NONE was " +
                            "attributed to this document" +
                            (dryEventsOtherDocument > 0
                                ? $" ({dryEventsOtherDocument} were attributed to another document)"
                                : string.Empty) +
                            ". Treat this preview as UNRELIABLE — it is NOT evidence that the script does nothing.");
                    }
                    foreach (var nr in notReverted)
                        context.Println($"🧪 NOT REVERTED: {nr}");
                    context.AddStructuredOutput("dry_run", dryRunReport);
                }

                result.PrintLog = context.PrintLog.ToList();
                result.ScriptName = topLevelScriptName;
                result.PipelineDiagnostics = ExecutionGlobals.Current.Value?.PipelineDiagnostics?.ToList() ?? new List<int>();

                // Structured output handling...
                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var log = structuredOutputLogProperty.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null)
                    {
                        foreach (var item in log)
                        {
                            result.StructuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                        }
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 CodeRunner Exception: " + ex.ToString());

                string summaryMessage;
                List<string> details = new List<string>();

                // Unwrap AggregateException for better reporting
                var actualEx = (ex is AggregateException aex && aex.InnerException != null) ? aex.InnerException : ex;

                if (actualEx is CompilationErrorException cex)
                {
                    summaryMessage = "Compilation Failed";

                    // Use DiagnosticMapper to get correct file/line mappings
                    var mappedErrors = DiagnosticMapper.MapAndDeduplicate(
                        cex.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error),
                        finalScriptCode);

                    details = mappedErrors.Select(e => e.ToString()).ToList();
                }
                else
                {
                    summaryMessage = actualEx.Message;
                }

                var failureResult = ExecutionResult.Failure($"❌ {summaryMessage}", context.PrintLog.ToArray());
                if (details.Any())
                {
                    // Format multiple errors with newlines for clean wrap in frontend
                    failureResult.ErrorMessage = $"❌ {summaryMessage}:{Environment.NewLine}{string.Join(Environment.NewLine, details)}";
                    failureResult.ErrorDetails = details.ToArray();
                }

                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally
            {
                ExecutionGlobals.ClearContext();
            }
        }

        /// <summary>
        /// ⚠ Advisory pre-execution check for the TRANSACTION GRANULARITY footgun.
        ///
        /// The single-element write helpers — <c>SetVal</c>, <c>SetNum</c>,
        /// <c>SetTypeVal</c>, <c>SetTypeNum</c>, <c>Delete</c>, <c>Hide</c>,
        /// <c>Unhide</c>, <c>Isolate</c> — check <c>Document.IsModifiable</c> and open
        /// their OWN transaction when none is open. That is what makes them convenient,
        /// and it is what makes them dangerous inside a loop:
        ///
        ///     foreach (var d in GetElements("Doors")) d.SetVal("Mark", "");   // ⚠ N transactions
        ///
        /// Each pass finds no open transaction, so each pass commits its own. 143 doors
        /// cost 143 undo entries, and Revit's undo stack is finite — past its limit you
        /// can no longer undo back to where you started. The fix is ONE enclosing
        /// <c>Transact</c>, which makes every write run directly for a single undo entry.
        ///
        /// ⚠ The collection helpers (<c>SetParam</c>, <c>SetTypeParam</c>) are declared on
        /// <c>this IEnumerable&lt;T&gt;</c> and already wrap the whole enumeration in ONE
        /// transaction — they are safe. The guard separates the two by RECEIVER TYPE, not
        /// by name, so those are not reported.
        ///
        /// ⚠ STATIC, and deliberately so. It sees the loop whether or not the loop body
        /// executes, which is exactly what the dry-run report cannot do: that one counts
        /// transactions that really ran, so a branch not taken is invisible to it. The two
        /// are complements — this says WHERE, the dry-run count says HOW MANY.
        ///
        /// ⚠ Never throws, never refuses. Any failure degrades to "no warning": advisory
        /// analysis must not be able to break a run.
        /// </summary>
        private void WarnOnUnwrappedLoopWrites(string userCode, ICoreScriptContext context, string scriptName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(userCode))
                    return;

                // Same reference set and imports the real compilation uses, from the one
                // provider that owns them — otherwise the guard would resolve different
                // symbols than the compiler and could report a call that does not exist.
                var imports = ScriptReferenceProvider.GetImports(includeRevitSelection: false);
                var refs = ScriptReferenceProvider.GetCoreReferences("CodeRunner");
                refs.AddRange(ScriptReferenceProvider.GetRevitReferences("CodeRunner"));

                var findings = TransactionLoopGuard.Analyze(userCode, imports, refs);
                if (findings.Count == 0)
                    return;

                const int maxShown = 10;
                var lines = findings
                    .Take(maxShown)
                    .Select(f => $"  line {f.Line}:{f.Column} — {f.Call}() inside {f.LoopKind}");

                context.Println(
                    $"⚠️ TRANSACTION GRANULARITY — {findings.Count} write(s) sit inside a loop with no " +
                    "enclosing Transact(). Each iteration opens its OWN transaction, so N elements cost " +
                    "N undo entries, and the undo stack can run out before you can get back to where you " +
                    "started. Wrap the WHOLE loop in ONE Transact(...) — a Transact() placed INSIDE the " +
                    "loop is the mistake:" + Environment.NewLine +
                    string.Join(Environment.NewLine, lines) +
                    (findings.Count > maxShown
                        ? Environment.NewLine + $"  … and {findings.Count - maxShown} more."
                        : string.Empty));

                FileLogger.LogWarning(
                    $"[CodeRunner] Transaction granularity: {findings.Count} unwrapped loop write(s) in '{scriptName}'.");
            }
            catch (Exception ex)
            {
                // Advisory only. A broken analysis must never break a run.
                FileLogger.LogWarning($"[CodeRunner] Transaction granularity check failed: {ex.Message}");
            }
        }

        public ExecutionResult ExecuteBinary(byte[] assemblyBytes, string parametersJson, ICoreScriptContext context)
        {
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);
            string topLevelScriptName = "Protected Tool";

            FileLogger.Log("=========================================================");
            FileLogger.Log("🚀 [CodeRunner] EXECUTE BINARY TOOL (v3.1 STABLE)");
            FileLogger.Log("=========================================================");

            try
            {
                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                var rawParameters = new Dictionary<string, object>(parameters);

                // Apply license tier from parameters (set by Python backend for enterprise users)
                if (parameters.TryGetValue("__license_tier__", out var tierObj) && tierObj is string tierStr)
                {
                    LicenseContext.Tier = tierStr;
                    FileLogger.Log($"[CodeRunner] License tier set to: {tierStr}");
                }

                // DEBUG: Log all parameters
                FileLogger.Log($"[CodeRunner] Final Parameters Dictionary Keys: {string.Join(", ", parameters.Keys)}");
                foreach (var kvp in parameters)
                {
                    FileLogger.Log($"[CodeRunner] Param '{kvp.Key}' = {kvp.Value} (Type: {kvp.Value?.GetType().Name ?? "null"})");
                }

                if (parameters.ContainsKey("__script_name__"))
                {
                    var forcedName = parameters["__script_name__"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(forcedName))
                    {
                        topLevelScriptName = forcedName;
                    }
                    // Do NOT remove — the Sentinels (Pro) API reads __script_name__ at runtime
                }

                if (richParams.Count > 0)
                {
                    _parameterService.HardenParameters(parameters, richParams);
                }

                ExecutionGlobals.SetContext(new ExecutionGlobals(context, parameters, rawParameters));

                var result = _scriptExecutor.ExecuteBinary(assemblyBytes, context);

                // Enrich result
                result.ScriptName = topLevelScriptName;
                result.PrintLog = context.PrintLog.ToList();

                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var log = structuredOutputLogProperty.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null)
                    {
                        foreach (var item in log)
                        {
                            result.StructuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                        }
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                // Pass the error message through without a prefix — user-facing
                // exceptions like LicenseException already carry their own emoji.
                var failureResult = ExecutionResult.Failure(ex.Message, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally { ExecutionGlobals.ClearContext(); }
        }

        public byte[] CompileToBytes(string scriptContent)
        {
            List<ScriptFile> scriptFiles = new List<ScriptFile>();
            try
            {
                var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(scriptContent, scriptJsonOptions);
            }
            catch { /* Fallback to raw code if not JSON */ }

            string combinedCode;
            if (scriptFiles != null && scriptFiles.Any())
            {
                combinedCode = _scriptCombiner.Combine(scriptFiles);
            }
            else
            {
                combinedCode = scriptContent;
            }

            // Rewrite with empty parameters for build-time (parameters injected at runtime)
            string modifiedUserCode = _scriptRewriter.Rewrite(combinedCode, new Dictionary<string, object>());

            string finalScriptCode = "#line hidden" + Environment.NewLine +
                                  "using static CoreScript.Engine.Globals.ScriptApi;" + CoreScript.Engine.Globals.ScriptSurface.StaticImportsLine + Environment.NewLine +
                                  modifiedUserCode;

            try
            {
                var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                File.WriteAllText(debugPath, finalScriptCode);
            }
            catch { }

            return _scriptCompiler.CompileToBytes(finalScriptCode);
        }

        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _assemblyCache.Clear();
                FileLogger.Log("[CodeRunner] 🧹 Assembly cache cleared manually.");
            }
        }
    }

    internal class RunnerLogger : ILogger
    {
        public void Log(string m, LogLevel l)
        {
            FileLogger.Log(m, l);
        }

        public void LogError(string m)
        {
            FileLogger.LogError(m);
        }
    }
}