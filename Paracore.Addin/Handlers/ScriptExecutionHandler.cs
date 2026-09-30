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
            bool approved = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext<bool>(() =>
            {
                return SessionGate.EnsureApproved(request.Source ?? "paracore");
            });

            if (!approved)
                return new ExecuteScriptResponse
                {
                    IsSuccess = false,
                    ErrorMessage = "Code execution denied for this Revit session. Restart Revit to reset.",
                    UserRejected = true
                };

            var serverContext = new ServerContext(_uiApp);
            _logger.Log("[ScriptExecutionHandler] ServerContext created.", LogLevel.Debug);
            string scriptContentStr = request.ScriptContent;
            string parametersJsonStr = request.ParametersJson.ToStringUtf8();
            byte[]? compiledAssembly = request.CompiledAssembly?.ToByteArray();
            bool hasCompiledAssembly = compiledAssembly != null && compiledAssembly.Length > 0;

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
