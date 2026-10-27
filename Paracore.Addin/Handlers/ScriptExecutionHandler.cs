using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using CoreScript.Engine.Runtime;
using Grpc.Core;
using Paracore.Addin.Context;
using Paracore.Addin.Models;
using Paracore.Addin.Services;
using Paracore.Addin.ViewModels;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Paracore.Addin.App;

namespace Paracore.Addin.Handlers
{
    public partial class ScriptExecutionHandler
    {
        private readonly RevitContext _revitContext;
        private readonly ILogger _logger;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptParser _scriptParser;
        private static readonly SemaphoreSlim ExecutionLock = new(1);

        public ScriptExecutionHandler(RevitContext revitContext, ILogger logger, IScriptCombiner scriptCombiner, IScriptParser scriptParser)
        {
            _revitContext = revitContext;
            _logger = logger;
            _scriptCombiner = scriptCombiner;
            _scriptParser = scriptParser;
        }

        private UIApplication? _uiApp => _revitContext.UIApplication;

        // ════════════════════════════════════════════════════════════════════════════════
        // THE GALLERY FILE POLICY — and why it is NOT the REPL's policy
        // ════════════════════════════════════════════════════════════════════════════════
        // ⚠⚠ THERE ARE TWO FILE POLICIES ON PURPOSE. DO NOT UNIFY THEM.
        //
        //   * ReplHandler (ExecuteRepl) — agent-AUTHORED one-off snippets. No file writing at
        //     all. A snippet has no `Params` class and no `[OutputFile]` contract, so its only
        //     possible reason to touch a file is to interfere with one.
        //
        //   * ScriptExecutionHandler (ExecuteScript, this file) — PRE-AUTHORED gallery tools.
        //     Writing an output IS the tool's job: `RoomFinishUpdater` writes a CSV to a path
        //     the user declared in `Params`. Banning writes here would break every existing
        //     export tool and make Forge unable to test the very tools it is meant to verify.
        //
        //   So this list refuses only what NO gallery tool needs: the IRREVERSIBLE operations —
        //   delete, move, and truncate-in-place. Writing a file's contents stays allowed.
        //
        // ⚠ MEASURED 2026-10-27 across all 33 scripts in `paracore-gallery`
        //   (the count is `**/Scripts/*.cs`; it is the same corpus
        //   `paracore-gallery/tools/check-file-policy.py` scans, so the two cannot disagree):
        //     32 touch no file at all, or only read (`File.Exists`);
        //      1 writes (`RoomFinishUpdater.cs:176` -> `File.WriteAllLines`);
        //      0 delete, 0 move, 0 truncate.
        //   ⚠ This block previously said 34 = 33 + 1. The TOTAL was wrong, not the split —
        //   a count is a measurement, and this one was never taken. Re-measured above.
        //   So this costs zero existing scripts. That measurement is the whole justification —
        //   if a future script needs one of these, the answer is a design conversation, not a
        //   quiet exception.
        //
        // ⚠⚠ THIS IS NOT THE PYTHON LAYER'S MIRROR. `mcp_core.tool_helpers` scans agent C#
        //   before it is sent; this is the backstop for a DIRECT gRPC caller, which never
        //   passes through an MCP at all. Neither can be dropped: the Python one gives the
        //   friendlier message, this one is the only layer a hand-rolled client cannot skip.
        private static readonly (string Pattern, string Reason)[] _galleryFilePolicy =
        {
            (@"File\.Delete\s*\(",       "delete a file"),
            (@"File\.Move\s*\(",         "move a file"),
            (@"File\.Replace\s*\(",      "swap one file for another"),
            (@"File\.OpenWrite\s*\(",    "overwrite a file in place, leaving stale bytes behind"),
            (@"Directory\.Delete\s*\(",  "delete a folder"),
            (@"Directory\.Move\s*\(",    "move a folder"),
            // ⚠ `\b` is load-bearing: without it `FileMode\.Create` also matches
            //   `FileMode.CreateNew`, which is the SAFE call this message recommends.
            (@"FileMode\.Create\b",      "truncate a file by opening it for create"),
            (@"FileMode\.Truncate\b",    "truncate an existing file"),
            // ⚠ Refused outright, not because a stream writer is always wrong, but because
            //   `new StreamWriter(path)` truncates and a regex cannot tell it apart from
            //   `new StreamWriter(stream)`. Nothing needs it: `File.WriteAllText` and
            //   `FileMode.CreateNew` cover every legitimate case, and both are allowed.
            (@"new\s+StreamWriter\s*\(", "truncate a file with StreamWriter")
        };

        private const string GalleryFilePolicyMessage =
            "Blocked by the Paracore file policy: {0}.\n\n"
            + "A gallery tool MAY create a file, read a file, and write its output. It may NEVER "
            + "delete or move a file or folder, and it may not truncate one in place — deleting "
            + "files is the user's job, and this refusal is the whole point of the rule.\n\n"
            + "Allowed: File.WriteAllText / WriteAllLines / WriteAllBytes / AppendAllText, "
            + "File.Exists, File.ReadAllText, Directory.GetFiles, Directory.CreateDirectory, "
            + "and new FileStream(path, FileMode.CreateNew).\n\n"
            + "⚠ This applies to an AGENT-driven run (run_tool / dry_run). The same tool started "
            + "by a person in the desktop app is not affected.";

        /// <summary>
        /// The first gallery-policy violation in the script, or null. Agent-driven runs only.
        /// </summary>
        private static string? FindGalleryFileViolation(string scriptContent)
        {
            foreach (string body in ScriptBodies(scriptContent))
                foreach (var (pattern, reason) in _galleryFilePolicy)
                    if (System.Text.RegularExpressions.Regex.IsMatch(body, pattern))
                        return reason;
            return null;
        }

        /// <summary>
        /// The C# text of each file in the <c>ExecuteScript</c> payload.
        ///
        /// ⚠ Scanned PER FILE rather than combined: a violation is always inside one file's text,
        /// and the patterns never span a file boundary — so combining would only add a dependency
        /// on <c>IScriptCombiner</c> for no gain. The JSON fallback matches
        /// <c>ConfirmationRequirements.FromPayload</c>: a payload that is not a file array is
        /// treated as one script, which is also what <c>CodeRunner</c> does.
        /// </summary>
        private static IEnumerable<string> ScriptBodies(string scriptContent)
        {
            if (string.IsNullOrWhiteSpace(scriptContent))
                yield break;

            JsonNode? node = null;
            try { node = JsonNode.Parse(scriptContent); }
            catch { /* not JSON — fall through and treat it as one script */ }

            if (node is JsonArray arr)
            {
                foreach (var item in arr)
                {
                    if (item is not JsonObject obj) continue;
                    string? content = obj["content"]?.GetValue<string>();
                    if (!string.IsNullOrEmpty(content)) yield return content;
                }
                yield break;
            }

            yield return scriptContent;
        }

        public async Task<BuildScriptResponse> BuildScript(BuildScriptRequest request)
        {
            _logger.Log("[ScriptExecutionHandler] Entering BuildScript.", LogLevel.Debug);
            try
            {
                var assemblyBytes = ServerViewModel.Instance.BuildScript(request.ScriptContent);
                return new BuildScriptResponse
                {
                    IsSuccess = true,
                    CompiledAssembly = Google.Protobuf.ByteString.CopyFrom(assemblyBytes)
                };
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ScriptExecutionHandler] Error in BuildScript: {ex.Message}");
                return new BuildScriptResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        public async Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, CancellationToken token = default)
        {
            _logger.Log("[ScriptExecutionHandler] Entering ExecuteScript.", LogLevel.Debug);
            ExecutionResult finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = "Execution not started" };
            if (_uiApp == null)
            {
                return new ExecuteScriptResponse { IsSuccess = false, ErrorMessage = "Revit UI Application is not available." };
            }

            // ── Session gate (one-time per Revit session) ──
            // ⚠ Returns a Decision, not a bool (2026-10-25): the caller must be able to tell
            //   "a person allowed this session" from "there was no gate at all" — see
            //   SessionGate.Decision. `gate.Status` is reported on every response below.
            SessionGate.Decision gate = await CoreScriptExecutionDispatcher.Instance
                .ExecuteInUIContext<SessionGate.Decision>(() =>
                {
                    return SessionGate.EnsureApproved(request.Source ?? "paracore");
                });

            if (!gate.Approved)
                return new ExecuteScriptResponse
                {
                    IsSuccess = false,
                    ErrorMessage = "Code execution denied for this Revit session. Restart Revit to reset.",
                    UserRejected = true,
                    SessionConsent = gate.Status
                };

            var serverContext = new ServerContext(_uiApp);
            _logger.Log("[ScriptExecutionHandler] ServerContext created.", LogLevel.Debug);
            string scriptContentStr = request.ScriptContent;
            string parametersJsonStr = request.ParametersJson.ToStringUtf8();
            byte[]? compiledAssembly = request.CompiledAssembly?.ToByteArray();
            bool hasCompiledAssembly = compiledAssembly != null && compiledAssembly.Length > 0;

            // ── The gallery file policy — ABOVE the [Confirm] prompt, and NOT exempt on dry run ──
            // ⚠⚠ PLACED HERE, BEFORE THE [Confirm] BLOCK, DELIBERATELY. Two reasons:
            //   1. A refused script must not first ask the person to type a confirmation word.
            //   2. ⚠⚠ A DRY RUN MUST NOT BE EXEMPT. The [Confirm] gate below exempts dry runs
            //      because a dry run is rolled back — but a ROLLBACK UNDOES THE TRANSACTION, NOT
            //      A FILE WRITE. `File.Delete` inside a dry run deletes the file for real and the
            //      rollback afterwards cannot bring it back. Sitting above the dry-run branch is
            //      what keeps dry_run the SAFE path it is advertised to be, rather than the
            //      cheapest way to make an agent destroy a file.
            if (IsAgentCall(request.Source))
            {
                string? fileViolation = FindGalleryFileViolation(scriptContentStr);
                if (fileViolation != null)
                {
                    _logger.Log($"[ScriptExecutionHandler] File policy refusal: {fileViolation}.", LogLevel.Warning);
                    return new ExecuteScriptResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = string.Format(GalleryFilePolicyMessage, fileViolation),
                        SessionConsent = gate.Status,
                        Confirmation = ConfirmationStatus.NotEvaluated
                    };
                }

                if (string.IsNullOrWhiteSpace(scriptContentStr) && hasCompiledAssembly)
                {
                    // ⚠ Say it out loud rather than imply a clean bill of health we did not give:
                    //   a compiled assembly with no source cannot be scanned at all.
                    _logger.Log(
                        "[ScriptExecutionHandler] File policy NOT evaluated — a compiled assembly arrived with no source to scan.",
                        LogLevel.Warning);
                }
            }

            // ── [Confirm("WORD")] — the HUMAN-ONLY gate for agent-driven runs ──────────
            // ⚠⚠ The engine's own gate (CodeRunner) enforces "a value was supplied and correct",
            // but it cannot tell WHO supplied it — and the word is readable straight out of the
            // script source, so an agent can simply type it itself. For an AGENT source we
            // therefore do not trust the supplied value at all: we ask the person, and only on
            // approval do we inject the value for the engine's gate to see. The engine stays the
            // single enforcement point; this is where the human answer comes from.
            // ⚠ This MUST run BEFORE the 45 s completion timer below. A prompt placed inside the
            // execution would blow that timer, and the caller would be told "timed out" while the
            // script then ran anyway the moment the person answered.
            //
            // ⚠⚠ `confirmationStatus` is the answer to "DID A PERSON APPROVE THIS?" — the one thing a
            // caller could not previously tell apart from "there was no gate at all", because both
            // came back as is_success/user_rejected with nothing in between. It is reported on EVERY
            // response so no caller has to infer it.
            string confirmationStatus = ConfirmationStatus.NotEvaluated;
            if (!IsAgentCall(request.Source))
            {
                confirmationStatus = ConfirmationStatus.NotAgentRun;
            }
            else if (ConfirmationRequirements.IsDryRunInPayload(parametersJsonStr))
            {
                // ⚠⚠ A DRY RUN IS OUT OF SCOPE — and it must be, or the two halves of the rule
                // disagree. CodeRunner deliberately exempts dry runs (rolled back, and refusing them
                // would remove the only safe way to preview a destructive script). Prompting here
                // would gate a run the engine considers ungated, and cost the agent its safe path.
                // The exemption is read through the SHARED helper so the scope is stated once.
                confirmationStatus = ConfirmationStatus.DryRunExempt;
            }
            else if (string.IsNullOrWhiteSpace(scriptContentStr))
            {
                // ⚠ An AGENT run we cannot inspect (a compiled assembly with no source). The gate
                // cannot be armed from a script we do not have — so say so, rather than report a
                // clean "not_required" for a run that was never checked.
                confirmationStatus = ConfirmationStatus.Unavailable;
            }
            else
            {
                Dictionary<string, string> requirements;
                try
                {
                    requirements = ConfirmationRequirements.FromPayload(
                        scriptContentStr, _scriptCombiner, new ParameterExtractor(_logger));
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[ScriptExecutionHandler] Could not read [Confirm] requirements: {ex.Message}");
                    return new ExecuteScriptResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = "⛔ Confirmation could not be verified — nothing was executed.",
                        UserRejected = true,
                        SessionConsent = gate.Status,
                        Confirmation = ConfirmationStatus.Unavailable
                    };
                }

                if (requirements.Count == 0)
                {
                    confirmationStatus = ConfirmationStatus.NotRequired;
                }
                else
                {
                    string toolName = ReadScriptName(parametersJsonStr);
                    _logger.Log($"[ScriptExecutionHandler] [Confirm] {requirements.Count} requirement(s) for '{toolName}' — asking the user.", LogLevel.Debug);

                    // ⚠ Not named `approved` — that name is already the SessionGate result above.
                    var confirmApproved = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext<Dictionary<string, string>>(() =>
                    {
                        var ok = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var kv in requirements)
                        {
                            string word = ConfirmationRequirements.Literal(kv.Value);
                            if (!ConfirmationPrompt.Ask(toolName, kv.Key, word))
                                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                            ok[kv.Key] = word;
                        }
                        return ok;
                    });

                    if (confirmApproved.Count == 0)
                    {
                        _logger.Log("[ScriptExecutionHandler] [Confirm] declined by the user — nothing executed.", LogLevel.Debug);
                        return new ExecuteScriptResponse
                        {
                            IsSuccess = false,
                            ErrorMessage = "⛔ Confirmation declined — nothing was executed.",
                            UserRejected = true,
                            SessionConsent = gate.Status,
                            Confirmation = ConfirmationStatus.UserDeclined
                        };
                    }

                    parametersJsonStr = InjectConfirmations(parametersJsonStr, confirmApproved);
                    confirmationStatus = ConfirmationStatus.UserConfirmed;
                    _logger.Log($"[ScriptExecutionHandler] [Confirm] approved by the user for '{toolName}'.", LogLevel.Debug);
                }
            }

            if (string.IsNullOrWhiteSpace(scriptContentStr) && !hasCompiledAssembly)
            {
                _logger.Log("[ScriptExecutionHandler] Script content is empty and no compiled assembly provided.", LogLevel.Debug);
                finalResult = new ExecutionResult
                {
                    IsSuccess = false,
                    ErrorMessage = "Empty script content received."
                };
            }
            else
            {
                _logger.Log("[ScriptExecutionHandler] Waiting for execution lock.", LogLevel.Debug);
                await ExecutionLock.WaitAsync(token);
                _logger.Log("[ScriptExecutionHandler] Acquired execution lock.", LogLevel.Debug);
                Action<ExecutionResult>? handler = null;
                try
                {
                    var completionSource = new TaskCompletionSource<ExecutionResult>();
                    Guid targetExecutionId = Guid.Empty;

                    handler = result =>
                    {
                        if (result.ExecutionId == targetExecutionId && targetExecutionId != Guid.Empty)
                        {
                            completionSource.TrySetResult(result);
                        }
                    };

                    ServerViewModel.Instance.OnExecutionComplete += handler;
                    ServerViewModel.Instance.LastClientSource = request.Source;

                    if (hasCompiledAssembly)
                    {
                        targetExecutionId = ServerViewModel.Instance.DispatchBinaryScript(compiledAssembly, parametersJsonStr, serverContext);
                        _logger.Log($"[ScriptExecutionHandler] DispatchBinaryScript called (ID: {targetExecutionId}). Waiting for completion.", LogLevel.Debug);
                    }
                    else
                    {
                        targetExecutionId = ServerViewModel.Instance.DispatchScript(scriptContentStr, parametersJsonStr, serverContext);
                        _logger.Log($"[ScriptExecutionHandler] DispatchScript called (ID: {targetExecutionId}). Waiting for completion.", LogLevel.Debug);
                    }
                    var timeoutTask = Task.Delay(TimeSpan.FromSeconds(45), token);
                    var finishedTask = await Task.WhenAny(completionSource.Task, timeoutTask);

                    if (finishedTask == completionSource.Task)
                    {
                        finalResult = await completionSource.Task;
                        ServerViewModel.Instance.LastExecutedScriptName = finalResult.ScriptName;
                        _logger.Log("[ScriptExecutionHandler] Script execution completed.", LogLevel.Debug);
                    }
                    else
                    {
                        finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = "Execution timed out." };
                        _logger.Log("[ScriptExecutionHandler] Script execution timed out.", LogLevel.Debug);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[ScriptExecutionHandler] Exception during script execution: {ex.Message}");
                    if (ex.StackTrace != null) _logger.LogError(ex.StackTrace);
                    finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = $"Server error: {ex.Message}" };
                }
                finally
                {
                    if (handler != null)
                    {
                        ServerViewModel.Instance.OnExecutionComplete -= handler;
                    }
                    ExecutionLock.Release();
                    _logger.Log("[ScriptExecutionHandler] Released execution lock.", LogLevel.Debug);
                }
            }

            var outputMessages = serverContext?.PrintLog ?? new List<string>();
            var errorMessages = serverContext?.ErrorLog ?? new List<string>();

            var combinedOutput = string.Join("\n", outputMessages);

            var response = new ExecuteScriptResponse
            {
                IsSuccess = finalResult.IsSuccess,
                Output = combinedOutput,
                ErrorMessage = finalResult.ErrorMessage ?? "",
                // ⚠ Set on EVERY path out of this method that reaches the gate — see ConfirmationStatus.
                Confirmation = confirmationStatus,
                // ⚠ Same rule for the session gate: a caller must be able to tell a run a PERSON
                //   approved from a run with no gate at all — see SessionGate.Decision.
                SessionConsent = gate.Status,
            };

            if (finalResult.ErrorDetails != null)
            {
                response.ErrorDetails.AddRange(finalResult.ErrorDetails);
            }
            response.ErrorDetails.AddRange(errorMessages);

            if (serverContext?.StructuredOutputLog != null)
            {
                foreach (var item in serverContext.StructuredOutputLog)
                {
                    response.StructuredOutput.Add(new CoreScript.StructuredOutputItem { Type = item.Type, Data = item.Data, CapExempt = item.CapExempt });
                }
            }

            if (finalResult.StructuredOutput != null && finalResult.StructuredOutput.Count > response.StructuredOutput.Count)
            {
                foreach (var jsonStr in finalResult.StructuredOutput)
                {
                    try
                    {
                        var temp = JsonSerializer.Deserialize<StructuredOutputPoco>(jsonStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        if (temp != null)
                        {
                            // If any item with same type exists, update it.
                            var existing = response.StructuredOutput.FirstOrDefault(i => i.Type == temp.Type);

                            if (existing != null)
                            {
                                existing.Data = temp.Data ?? "";
                            }
                            else
                            {
                                response.StructuredOutput.Add(new CoreScript.StructuredOutputItem
                                {
                                    Type = temp.Type ?? "",
                                    Data = temp.Data ?? "",
                                    Title = "",
                                    CapExempt = temp.CapExempt
                                });
                            }
                        }
                    }
                    catch { }
                }
            }

            // Pipeline diagnostics: prefer from CodeRunner result, fallback to context
            var diags = finalResult.PipelineDiagnostics?.Count > 0
                ? finalResult.PipelineDiagnostics
                : serverContext?.PipelineDiagnostics;
            if (diags != null)
                response.PipelineDiagnostics.AddRange(diags);

            response.InternalData = "";
            return response;
        }

        private static bool IsAgentCall(string? source)
            => (source ?? "paracore").Contains("agent", StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// The <c>__script_name__</c> reserved parameter, so the prompt can name the tool being run.
        /// </summary>
        private static string ReadScriptName(string parametersJson)
        {
            try
            {
                var node = JsonNode.Parse(parametersJson);
                if (node is JsonArray arr)
                {
                    foreach (var item in arr)
                    {
                        if (item is JsonObject o && o["name"]?.ToString() == "__script_name__")
                            return o["value"]?.ToString() ?? "Unknown tool";
                    }
                }
                else if (node is JsonObject jo && jo["__script_name__"] != null)
                {
                    return jo["__script_name__"]!.ToString();
                }
            }
            catch { }
            return "Unknown tool";
        }

        /// <summary>
        /// Writes the approved confirmation values into the parameter payload so the engine's gate
        /// sees a matching value. ⚠ The payload is a JSON ARRAY for Forge calls and a plain OBJECT
        /// for others — both shapes are handled, because <c>ParameterService.MapParameters</c>
        /// branches on the JSON root.
        /// </summary>
        private static string InjectConfirmations(string parametersJson, Dictionary<string, string> approved)
        {
            JsonNode? root = null;
            try { root = string.IsNullOrWhiteSpace(parametersJson) ? null : JsonNode.Parse(parametersJson); }
            catch { root = null; }

            if (root is JsonArray arr)
            {
                foreach (var kv in approved)
                {
                    JsonObject? hit = null;
                    foreach (var item in arr)
                    {
                        if (item is JsonObject o &&
                            string.Equals(o["name"]?.ToString(), kv.Key, StringComparison.OrdinalIgnoreCase))
                        {
                            hit = o;
                            break;
                        }
                    }

                    if (hit != null) hit["value"] = kv.Value;
                    else arr.Add(new JsonObject { ["name"] = kv.Key, ["value"] = kv.Value });
                }
                return arr.ToJsonString();
            }

            if (root is JsonObject obj)
            {
                foreach (var kv in approved) obj[kv.Key] = kv.Value;
                return obj.ToJsonString();
            }

            var fresh = new JsonArray();
            foreach (var kv in approved) fresh.Add(new JsonObject { ["name"] = kv.Key, ["value"] = kv.Value });
            return fresh.ToJsonString();
        }

        /// <summary>
        /// Retrieves the actual casing of a file or directory as it exists on the Windows file system.
        /// <see cref="System.IO.DirectoryInfo"/> and <see cref="System.IO.FileInfo"/> often inherit the 
        /// casing of the string provided to them rather than querying the disk.
        /// </summary>
        private string GetActualPathCasing(string path)
        {
            try
            {
                if (System.IO.Directory.Exists(path))
                {
                    var parentPath = System.IO.Path.GetDirectoryName(path);
                    if (string.IsNullOrEmpty(parentPath)) return System.IO.Path.GetFileName(path); // Drive root

                    var parentDir = new System.IO.DirectoryInfo(parentPath);
                    var searchName = System.IO.Path.GetFileName(path);
                    var actualDir = parentDir.GetDirectories(searchName).FirstOrDefault();
                    return actualDir != null ? actualDir.Name : searchName;
                }
                else if (System.IO.File.Exists(path))
                {
                    var parentPath = System.IO.Path.GetDirectoryName(path);
                    if (string.IsNullOrEmpty(parentPath)) return System.IO.Path.GetFileName(path); // Drive root

                    var parentDir = new System.IO.DirectoryInfo(parentPath);
                    var searchName = System.IO.Path.GetFileName(path);
                    var actualFile = parentDir.GetFiles(searchName).FirstOrDefault();
                    return actualFile != null ? actualFile.Name : searchName;
                }

                return System.IO.Path.GetFileName(path);
            }
            catch (Exception)
            {
                return System.IO.Path.GetFileName(path);
            }
        }
    }
}
