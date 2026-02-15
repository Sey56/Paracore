using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using CoreScript.Engine.Runtime;
using Grpc.Core;
using Paracore.Addin.Context;
using Paracore.Addin.ViewModels;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.UI;

namespace Paracore.Addin.Handlers
{
    public class ScriptExecutionHandler
    {
        private readonly UIApplication? _uiApp;
        private readonly ILogger _logger;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptParser _scriptParser;
        private static readonly SemaphoreSlim ExecutionLock = new(1);

        public ScriptExecutionHandler(UIApplication? uiApp, ILogger logger, IScriptCombiner scriptCombiner, IScriptParser scriptParser)
        {
            _uiApp = uiApp;
            _logger = logger;
            _scriptCombiner = scriptCombiner;
            _scriptParser = scriptParser;
        }

        public async Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request)
        {
            _logger.Log($"[ScriptExecutionHandler] Scanning for watchdogs in: {request.Path}", LogLevel.Info);
            var response = new RegisterWatchdogSourceResponse { IsSuccess = true };

            try
            {
                if (!System.IO.Directory.Exists(request.Path))
                {
                    return new RegisterWatchdogSourceResponse { IsSuccess = false, ErrorMessage = "Source path does not exist." };
                }

                int count = 0;
                var projects = System.IO.Directory.GetDirectories(request.Path);
                foreach (var projectPath in projects)
                {
                    string scriptsPath = System.IO.Path.Combine(projectPath, "Scripts");
                    if (!System.IO.Directory.Exists(scriptsPath)) continue;

                    var csFiles = System.IO.Directory.GetFiles(scriptsPath, "*.cs");
                    if (csFiles.Length == 0) continue;

                    try
                    {
                        var scriptFiles = csFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                        {
                            FileName = System.IO.Path.GetFileName(f),
                            Content = System.IO.File.ReadAllText(f)
                        }).ToList();

                        string combined = _scriptCombiner.Combine(scriptFiles);
                        
                        // Queue silently
                        if (_uiApp != null)
                        {
                            var serverContext = new ServerContext(_uiApp);
                            // We must include the absolute path in parameters so ScriptApi.Watchdog() works
                            var parameters = new Dictionary<string, object>
                            {
                                { "__absolute_path__", projectPath.Replace('\\', '/') },
                                { "__script_name__", System.IO.Path.GetFileName(projectPath) }
                            };
                            string paramsJson = JsonSerializer.Serialize(parameters);

                            CoreScriptExecutionDispatcher.Instance.QueueScriptFromServer(combined, paramsJson, serverContext, isSilent: true);
                            count++;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Log($"[ScriptExecutionHandler] Failed to queue watchdog in {projectPath}: {ex.Message}", LogLevel.Warning);
                    }
                }

                response.WatchdogsRegistered = count;
                _logger.Log($"[ScriptExecutionHandler] Queued {count} watchdogs for silent registration.", LogLevel.Info);
            }
            catch (Exception ex)
            {
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
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

        public async Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, ServerCallContext context)
        {
            _logger.Log("[ScriptExecutionHandler] Entering ExecuteScript.", LogLevel.Debug);
            ExecutionResult finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = "Execution not started" };
            if (_uiApp == null)
            {
                return new ExecuteScriptResponse { IsSuccess = false, ErrorMessage = "Revit UI Application is not available." };
            }
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
                await ExecutionLock.WaitAsync(context.CancellationToken);
                _logger.Log("[ScriptExecutionHandler] Acquired execution lock.", LogLevel.Debug);
                Action<ExecutionResult>? handler = null;
                try
                {
                    var completionSource = new TaskCompletionSource<ExecutionResult>();
                    handler = result => completionSource.TrySetResult(result);
                    ServerViewModel.Instance.OnExecutionComplete += handler;
                    ServerViewModel.Instance.LastClientSource = request.Source;
                    
                    if (hasCompiledAssembly)
                    {
                        ServerViewModel.Instance.DispatchBinaryScript(compiledAssembly, parametersJsonStr, serverContext);
                        _logger.Log("[ScriptExecutionHandler] DispatchBinaryScript called. Waiting for completion.", LogLevel.Debug);
                    }
                    else
                    {
                        ServerViewModel.Instance.DispatchScript(scriptContentStr, parametersJsonStr, serverContext);
                        _logger.Log("[ScriptExecutionHandler] DispatchScript called. Waiting for completion.", LogLevel.Debug);
                    }
                    var timeoutTask = Task.Delay(TimeSpan.FromSeconds(45), context.CancellationToken);
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
                        var item = JsonSerializer.Deserialize<CoreScript.StructuredOutputItem>(jsonStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        if (item != null && !response.StructuredOutput.Any(existing => existing.Type == item.Type && existing.Data == item.Data))
                        {
                            response.StructuredOutput.Add(item);
                        }
                    }
                    catch { }
                }
            }

            response.InternalData = finalResult.InternalData ?? "";
            return response;
        }
    }
}
