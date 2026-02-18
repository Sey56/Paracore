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
            RegisterWatchdogSourceResponse response = new RegisterWatchdogSourceResponse { IsSuccess = true };
            try
            {
                // FAST PATH: Direct .wtool file registration (when arming a single binary sentinel)
                if (request.Path.EndsWith(".wtool", StringComparison.OrdinalIgnoreCase) && System.IO.File.Exists(request.Path))
                {
                    return RegisterSingleWtool(request.Path);
                }

                if (!System.IO.Directory.Exists(request.Path))
                {
                    return new RegisterWatchdogSourceResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = "Path does not exist.",
                        WatchdogsRegistered = 0
                    };
                }

                int count = 0;
                var details = new List<string>();

                // CHECK: Is the request.Path itself a Project? (Has a 'Scripts' folder directly inside)
                bool isSingleProject = System.IO.Directory.Exists(System.IO.Path.Combine(request.Path, "Scripts"));

                var projectsPtr = isSingleProject ? new[] { request.Path } : System.IO.Directory.GetDirectories(request.Path);

                // V4: Also scan for .wtool (Binary Sentinels) in the root path
                var wtoolFiles = System.IO.Directory.GetFiles(request.Path, "*.wtool");
                foreach (var wtoolPath in wtoolFiles)
                {
                    try
                    {
                        string json = System.IO.File.ReadAllText(wtoolPath);
                        using (JsonDocument doc = JsonDocument.Parse(json))
                        {
                            var root = doc.RootElement;
                            if (root.TryGetProperty("assembly", out var assemblyElem) && 
                                root.TryGetProperty("parameters", out var paramsElem))
                            {
                                byte[] assemblyBytes = Convert.FromBase64String(assemblyElem.GetString());
                                
                                // Map parameters to a flat dictionary for the registry
                                var parameters = new Dictionary<string, object>();
                                foreach (var p in paramsElem.EnumerateArray())
                                {
                                    string name = p.GetProperty("name").GetString();
                                    string valJson = p.TryGetProperty("defaultValueJson", out var dj) ? dj.GetString() : "null";
                                    try { parameters[name] = JsonSerializer.Deserialize<object>(valJson); } catch { }
                                }

                                // System metadata
                                parameters["__absolute_path__"] = wtoolPath.Replace('\\', '/');
                                parameters["__script_name__"] = System.IO.Path.GetFileName(wtoolPath);
                                parameters["__is_watchdog_registration__"] = true;

                                string paramsJson = JsonSerializer.Serialize(parameters);

                                if (_uiApp != null)
                                {
                                    var serverContext = new ServerContext(_uiApp);
                                    CoreScriptExecutionDispatcher.Instance.QueueBinaryScriptFromServer(
                                        assemblyBytes,
                                        paramsJson,
                                        serverContext,
                                        isSilent: true,
                                        priority: ExecutionPriority.Normal);

                                    count++;
                                    details.Add($"Loaded Binary Sentinel: '{System.IO.Path.GetFileName(wtoolPath)}'");
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError($"[ScriptExecutionHandler] Failed to load binary sentinel {wtoolPath}: {ex.Message}");
                        details.Add($"Error (Binary): '{System.IO.Path.GetFileName(wtoolPath)}' ({ex.Message})");
                    }
                }

                foreach (var projectPath in projectsPtr)
                {
                    string folderName = System.IO.Path.GetFileName(projectPath);
                    string scriptsPath = System.IO.Path.Combine(projectPath, "Scripts");
                    
                    if (!System.IO.Directory.Exists(scriptsPath))
                    {
                         details.Add($"Skipped: '{folderName}' (No 'Scripts' folder found)");
                         continue;
                    }

                    var csFiles = System.IO.Directory.GetFiles(scriptsPath, "*.cs");
                    if (csFiles.Length == 0)
                    {
                        details.Add($"Skipped: '{folderName}' (No .cs files found in Scripts)");
                        continue;
                    }

                    try
                    {
                        var scriptFiles = csFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                        {
                            FileName = System.IO.Path.GetFileName(f),
                            Content = System.IO.File.ReadAllText(f)
                        }).ToList();

                        string combined = _scriptCombiner.Combine(scriptFiles);
                        
                        // Queue silently if it has Watchdog
                        // Relaxed verification to support both direct Registry calls and ScriptApi helper 'Watchdog()'
                        if ((combined.Contains("WatchdogRegistry.Register") || combined.Contains("Watchdog(")) 
                            && combined.Contains("WatchdogReport"))
                        {
                            if (_uiApp != null)
                            {
                                var serverContext = new ServerContext(_uiApp);
                                // We must include the absolute path in parameters so ScriptApi.Watchdog() works
                                var parameters = new Dictionary<string, object>
                                {
                                    { "__absolute_path__", projectPath.Replace('\\', '/') },
                                    { "__script_name__", System.IO.Path.GetFileName(projectPath) },
                                    { "__is_watchdog_registration__", true }
                                };
                                string paramsJson = JsonSerializer.Serialize(parameters);

                                // V4: NON-BLOCKING Registration with Normal Priority
                                // PriorityQueue in Dispatcher ensures manual scripts (High) jump to the front.
                                CoreScriptExecutionDispatcher.Instance.QueueScriptFromServer(
                                    combined, 
                                    paramsJson, 
                                    serverContext, 
                                    isSilent: true, 
                                    priority: ExecutionPriority.Normal);
                                
                                count++;
                                details.Add($"Loaded: '{folderName}'");
                            }
                        }
                        else
                        {
                             details.Add($"Skipped: '{folderName}' (No Watchdog() or WatchdogReport found)");
                             // Also register as failure so user knows WHY it's not active
                             CoreScript.Engine.Globals.WatchdogRegistry.RegisterFailure(projectPath, folderName, "No Watchdog() or WatchdogReport found in code.");
                        }
                    }
                    catch (Exception ex)
                    {
                        // In single-project mode, we should probably fail harder, but logging is consistent
                        _logger.Log($"[ScriptExecutionHandler] Failed to queue watchdog in {projectPath}: {ex.Message}", LogLevel.Warning);
                        details.Add($"Error: '{folderName}' ({ex.Message})");
                        CoreScript.Engine.Globals.WatchdogRegistry.RegisterFailure(projectPath, folderName, ex.Message);
                    }
                }

                response.WatchdogsRegistered = count;
                response.LoadDetails.AddRange(details);
            }
            catch (Exception ex)
            {
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        /// <summary>
        /// Registers a single .wtool binary sentinel file directly.
        /// Called when the frontend arms an individual binary sentinel by its file path.
        /// </summary>
        private RegisterWatchdogSourceResponse RegisterSingleWtool(string wtoolPath)
        {
            try
            {
                string json = System.IO.File.ReadAllText(wtoolPath);
                using (JsonDocument doc = JsonDocument.Parse(json))
                {
                    var root = doc.RootElement;
                    if (root.TryGetProperty("assembly", out var assemblyElem) &&
                        root.TryGetProperty("parameters", out var paramsElem))
                    {
                        byte[] assemblyBytes = Convert.FromBase64String(assemblyElem.GetString());

                        var parameters = new Dictionary<string, object>();
                        foreach (var p in paramsElem.EnumerateArray())
                        {
                            string name = p.GetProperty("name").GetString();
                            string valJson = p.TryGetProperty("defaultValueJson", out var dj) ? dj.GetString() : "null";
                            try { parameters[name] = JsonSerializer.Deserialize<object>(valJson); } catch { }
                        }

                        parameters["__absolute_path__"] = wtoolPath.Replace('\\', '/');
                        parameters["__script_name__"] = System.IO.Path.GetFileName(wtoolPath);
                        parameters["__is_watchdog_registration__"] = true;

                        string paramsJson = JsonSerializer.Serialize(parameters);

                        if (_uiApp != null)
                        {
                            var serverContext = new ServerContext(_uiApp);
                            CoreScriptExecutionDispatcher.Instance.QueueBinaryScriptFromServer(
                                assemblyBytes,
                                paramsJson,
                                serverContext,
                                isSilent: true,
                                priority: ExecutionPriority.Normal);

                            _logger.Log($"[ScriptExecutionHandler] Loaded Binary Sentinel (direct): '{System.IO.Path.GetFileName(wtoolPath)}'", LogLevel.Info);

                            return new RegisterWatchdogSourceResponse
                            {
                                IsSuccess = true,
                                WatchdogsRegistered = 1
                            };
                        }
                    }
                }

                return new RegisterWatchdogSourceResponse
                {
                    IsSuccess = false,
                    ErrorMessage = "Invalid .wtool format or missing UIApp context.",
                    WatchdogsRegistered = 0
                };
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ScriptExecutionHandler] Failed to load binary sentinel {wtoolPath}: {ex.Message}");
                return new RegisterWatchdogSourceResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message,
                    WatchdogsRegistered = 0
                };
            }
        }

        public async Task<UnregisterWatchdogSourceResponse> UnregisterWatchdogSource(UnregisterWatchdogSourceRequest request)
        {
            try
            {
                int removed = CoreScript.Engine.Globals.WatchdogRegistry.UnregisterAllFromPath(request.Path);
                return await Task.FromResult(new UnregisterWatchdogSourceResponse
                {
                    IsSuccess = true,
                    ErrorMessage = "",
                    WatchdogsRemoved = removed
                });
            }
            catch (Exception ex)
            {
                return await Task.FromResult(new UnregisterWatchdogSourceResponse { IsSuccess = false, ErrorMessage = ex.Message });
            }
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
