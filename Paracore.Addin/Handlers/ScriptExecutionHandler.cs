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
                    response.StructuredOutput.Add(new CoreScript.StructuredOutputItem { Type = item.Type, Data = item.Data });
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
                                    Title = ""
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
