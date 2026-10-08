using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using CoreScript.Engine.Runtime;
using Grpc.Core;
using Paracore.Addin.App;
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

namespace Paracore.Addin.Handlers
{
    /// <summary>
    /// Paracore Pro half of <see cref="ScriptExecutionHandler"/>: the Sentinels
    /// (watchdog) RPC handlers.
    /// <para>
    /// This file ships in the Pro repo only. The shared ScriptExecutionHandler.cs stays
    /// identical between the free and the Pro add-in; the free add-in compiles no watchdog
    /// code at all and its InternalTaskRunner answers these RPCs with "requires Paracore Pro".
    /// </para>
    /// </summary>
    public partial class ScriptExecutionHandler
    {

        public async Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request)
        {
            _logger.Log($"[ScriptExecutionHandler] Scanning for watchdogs in: {request.Path}", LogLevel.Info);
            RegisterWatchdogSourceResponse response = new RegisterWatchdogSourceResponse { IsSuccess = true };
            try
            {
                // FAST PATH: Direct .wtool file registration (when arming a single binary sentinel)
                if (request.Path.EndsWith(".wtool", StringComparison.OrdinalIgnoreCase) && System.IO.File.Exists(request.Path))
                {
                    return RegisterSingleWtool(request.Path, request.ParametersJson.ToStringUtf8());
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

                                // V4.2 FIX: Using JsonNode to safely preserve rich metadata without disposal issues
                                var wtoolParams = JsonNode.Parse(paramsElem.GetRawText())?.AsArray() ?? new JsonArray();

                                // NEW: Override with UI snapshot parameters if provided
                                string incomingParamsJson = request.ParametersJson.ToStringUtf8();
                                if (!string.IsNullOrWhiteSpace(incomingParamsJson) && incomingParamsJson != "null")
                                {
                                    try
                                    {
                                        var incomingParams = JsonNode.Parse(incomingParamsJson)?.AsArray();
                                        if (incomingParams != null)
                                        {
                                            foreach (var incomingNode in incomingParams)
                                            {
                                                var incomingName = incomingNode?["name"]?.GetValue<string>();
                                                if (incomingName != null)
                                                {
                                                    // Find matching param in wtoolParams and replace its value/defaultValueJson
                                                    var match = wtoolParams.FirstOrDefault(p => p?["name"]?.GetValue<string>() == incomingName);
                                                    if (match != null)
                                                    {
                                                        if (incomingNode?["value"] != null)
                                                        {
                                                            match["value"] = incomingNode["value"]?.DeepClone();
                                                        }
                                                        if (incomingNode?["defaultValueJson"] != null)
                                                        {
                                                            match["defaultValueJson"] = incomingNode["defaultValueJson"]?.DeepClone();
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (Exception parseEx)
                                    {
                                        _logger.LogError($"[ScriptExecutionHandler] Error parsing incoming parameters for {wtoolPath}: {parseEx.Message}");
                                    }
                                }

                                // DISK-AWARE NAMING: Retrieve actual casing from the file system
                                string actualFileName = GetActualPathCasing(wtoolPath);

                                wtoolParams.Add(new JsonObject { ["name"] = "__absolute_path__", ["defaultValueJson"] = wtoolPath.Replace('\\', '/'), ["type"] = "string" });
                                wtoolParams.Add(new JsonObject { ["name"] = "__script_name__", ["defaultValueJson"] = actualFileName, ["type"] = "string" });
                                wtoolParams.Add(new JsonObject { ["name"] = "__is_watchdog_registration__", ["defaultValueJson"] = "true", ["type"] = "boolean" });

                                string paramsJson = wtoolParams.ToJsonString();

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
                                    details.Add($"Loaded Binary Sentinel: '{actualFileName}'");
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
                    // DISK-AWARE NAMING: Retrieve actual casing from the file system
                    string folderName = GetActualPathCasing(projectPath);
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

                                string incomingParamsJson = request.ParametersJson.ToStringUtf8();
                                JsonArray uiParams = new JsonArray();

                                if (!string.IsNullOrWhiteSpace(incomingParamsJson) && incomingParamsJson != "null")
                                {
                                    try
                                    {
                                        uiParams = JsonNode.Parse(incomingParamsJson)?.AsArray() ?? new JsonArray();
                                    }
                                    catch { }
                                }

                                uiParams.Add(new JsonObject { ["name"] = "__absolute_path__", ["defaultValueJson"] = projectPath.Replace('\\', '/'), ["type"] = "string" });
                                uiParams.Add(new JsonObject { ["name"] = "__script_name__", ["defaultValueJson"] = folderName, ["type"] = "string" });
                                uiParams.Add(new JsonObject { ["name"] = "__is_watchdog_registration__", ["defaultValueJson"] = "true", ["type"] = "boolean" });

                                string paramsJson = uiParams.ToJsonString();

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
        private RegisterWatchdogSourceResponse RegisterSingleWtool(string wtoolPath, string incomingParamsJson)
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

                        // V4.2 FIX: Using JsonNode to safely preserve rich metadata without disposal issues
                        var wtoolParams = JsonNode.Parse(paramsElem.GetRawText())?.AsArray() ?? new JsonArray();

                        // NEW: Override with UI snapshot parameters if provided
                        if (!string.IsNullOrWhiteSpace(incomingParamsJson) && incomingParamsJson != "null")
                        {
                            try
                            {
                                var incomingParams = JsonNode.Parse(incomingParamsJson)?.AsArray();
                                if (incomingParams != null)
                                {
                                    foreach (var incomingNode in incomingParams)
                                    {
                                        var incomingName = incomingNode?["name"]?.GetValue<string>();
                                        if (incomingName != null)
                                        {
                                            var match = wtoolParams.FirstOrDefault(p => p?["name"]?.GetValue<string>() == incomingName);
                                            if (match != null)
                                            {
                                                if (incomingNode?["value"] != null) match["value"] = incomingNode["value"]?.DeepClone();
                                                if (incomingNode?["defaultValueJson"] != null) match["defaultValueJson"] = incomingNode["defaultValueJson"]?.DeepClone();
                                            }
                                        }
                                    }
                                }
                            }
                            catch (Exception parseEx)
                            {
                                _logger.LogError($"[ScriptExecutionHandler] Error parsing incoming parameters for {wtoolPath}: {parseEx.Message}");
                            }
                        }

                        // DISK-AWARE NAMING: Retrieve actual casing from the file system
                        string actualFileName = GetActualPathCasing(wtoolPath);

                        wtoolParams.Add(new JsonObject { ["name"] = "__absolute_path__", ["defaultValueJson"] = wtoolPath.Replace('\\', '/'), ["type"] = "string" });
                        wtoolParams.Add(new JsonObject { ["name"] = "__script_name__", ["defaultValueJson"] = actualFileName, ["type"] = "string" });
                        wtoolParams.Add(new JsonObject { ["name"] = "__is_watchdog_registration__", ["defaultValueJson"] = "true", ["type"] = "boolean" });

                        string paramsJson = wtoolParams.ToJsonString();

                        if (_uiApp != null)
                        {
                            var serverContext = new ServerContext(_uiApp);
                            CoreScriptExecutionDispatcher.Instance.QueueBinaryScriptFromServer(
                                assemblyBytes,
                                paramsJson,
                                serverContext,
                                isSilent: true,
                                priority: ExecutionPriority.Normal);

                            _logger.Log($"[ScriptExecutionHandler] Loaded Binary Sentinel (direct): '{actualFileName}'", LogLevel.Info);

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
    }
}
