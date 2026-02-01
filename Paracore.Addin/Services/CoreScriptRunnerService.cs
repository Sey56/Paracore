using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Google.Protobuf;
using Grpc.Core;
using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using Paracore.Addin.Context;
using Paracore.Addin.Helpers;
using Paracore.Addin.ViewModels;
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json;
using Paracore.Addin.App;

namespace Paracore.Addin.Services
{
    public class CoreScriptRunnerService : CoreScriptRunner.CoreScriptRunnerBase
    {
        public override async Task<BuildScriptResponse> BuildScript(BuildScriptRequest request, ServerCallContext context)
        {
            _logger.Log("[CoreScriptRunnerService] Entering BuildScript.", LogLevel.Debug);
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
                _logger.LogError($"[CoreScriptRunnerService] Error in BuildScript: {ex.Message}");
                return new BuildScriptResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        private readonly UIApplication? _uiApp;
        private readonly ILogger _logger;
        private readonly IMetadataExtractor _metadataExtractor;
        private readonly IParameterExtractor _parameterExtractor;
        private static readonly SemaphoreSlim ExecutionLock = new(1);

        public CoreScriptRunnerService(UIApplication? uiApp, ILogger logger, IMetadataExtractor metadataExtractor, IParameterExtractor parameterExtractor)
        {
            _uiApp = uiApp;
            _logger = logger;
            _metadataExtractor = metadataExtractor;
            _parameterExtractor = parameterExtractor;
        }

        public override Task<GetStatusResponse> GetStatus(GetStatusRequest request, ServerCallContext context)
        {
            _logger.Log("[CoreScriptRunnerService] Entering GetStatus.", LogLevel.Debug);
            bool revitOpen = _uiApp != null;
            string? revitVersion = revitOpen ? _uiApp.Application?.VersionNumber : null;
            bool documentOpen = revitOpen && _uiApp.ActiveUIDocument != null;
            string? documentTitle = documentOpen ? _uiApp.ActiveUIDocument?.Document?.Title : null;

            string documentType = "None";
            if (documentOpen && _uiApp.ActiveUIDocument.Document is Document doc)
            {
                if (doc.IsFamilyDocument)
                {
                    var family = new FilteredElementCollector(doc).OfClass(typeof(Family)).FirstOrDefault() as Family;
                    if (family?.FamilyCategory?.Id != null && family.FamilyCategory.Id.Value == (long)BuiltInCategory.OST_Mass)
                    {
                        documentType = "ConceptualMass";
                    }
                    else
                    {
                        documentType = "Family";
                    }
                }
                else
                {
                    documentType = "Project";
                }
            }

            var status = new GetStatusResponse
            {
                ParacoreConnected = true,
                RevitOpen = revitOpen,
                RevitVersion = revitVersion ?? "",
                DocumentOpen = documentOpen,
                DocumentTitle = documentTitle ?? "",
                DocumentType = documentType
            };

            _logger.Log($"[CoreScriptRunnerService] Revit Status: Open={{revitOpen}}, Version={{revitVersion}}, DocOpen={{documentOpen}}, DocTitle='{{documentTitle}}', DocType={{documentType}}.", LogLevel.Debug);
            return Task.FromResult(status);
        }

        public override async Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, ServerCallContext context)
        {
            _logger.Log("[CoreScriptRunnerService] Entering ExecuteScript.", LogLevel.Debug);
            ExecutionResult finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = "Execution not started" };
            if (_uiApp == null)
            {
                return new ExecuteScriptResponse { IsSuccess = false, ErrorMessage = "Revit UI Application is not available." };
            }
            var serverContext = new ServerContext(_uiApp);
            _logger.Log("[CoreScriptRunnerService] ServerContext created.", LogLevel.Debug);
            string scriptContentStr = request.ScriptContent;
            string parametersJsonStr = request.ParametersJson.ToStringUtf8();
            byte[]? compiledAssembly = request.CompiledAssembly?.ToByteArray();
            bool hasCompiledAssembly = compiledAssembly != null && compiledAssembly.Length > 0;

            // Only require script content if there's no compiled assembly
            if (string.IsNullOrWhiteSpace(scriptContentStr) && !hasCompiledAssembly)
            {
                _logger.Log("[CoreScriptRunnerService] Script content is empty and no compiled assembly provided.", LogLevel.Debug);
                finalResult = new ExecutionResult
                {
                    IsSuccess = false,
                    ErrorMessage = "Empty script content received."
                };
            }
            else
            {
                _logger.Log("[CoreScriptRunnerService] Waiting for execution lock.", LogLevel.Debug);
                await ExecutionLock.WaitAsync(context.CancellationToken);
                _logger.Log("[CoreScriptRunnerService] Acquired execution lock.", LogLevel.Debug);
                Action<ExecutionResult> handler = null;
                try
                {
                    var completionSource = new TaskCompletionSource<ExecutionResult>();
                    handler = result => completionSource.TrySetResult(result);
                    ServerViewModel.Instance.OnExecutionComplete += handler;
                    ServerViewModel.Instance.LastClientSource = request.Source;
                    
                    if (hasCompiledAssembly)
                    {
                        ServerViewModel.Instance.DispatchBinaryScript(compiledAssembly, parametersJsonStr, serverContext);
                        _logger.Log("[CoreScriptRunnerService] DispatchBinaryScript called. Waiting for completion.", LogLevel.Debug);
                    }
                    else
                    {
                        ServerViewModel.Instance.DispatchScript(scriptContentStr, parametersJsonStr, serverContext);
                        _logger.Log("[CoreScriptRunnerService] DispatchScript called. Waiting for completion.", LogLevel.Debug);
                    }
                    var timeoutTask = Task.Delay(TimeSpan.FromSeconds(45), context.CancellationToken);
                    var finishedTask = await Task.WhenAny(completionSource.Task, timeoutTask);

                    if (finishedTask == completionSource.Task)
                    {
                        finalResult = await completionSource.Task;
                        ServerViewModel.Instance.LastExecutedScriptName = finalResult.ScriptName;
                        _logger.Log("[CoreScriptRunnerService] Script execution completed.", LogLevel.Debug);
                    }
                    else
                    {
                        finalResult = new ExecutionResult { IsSuccess = false, ErrorMessage = "Execution timed out." };
                        _logger.Log("[CoreScriptRunnerService] Script execution timed out.", LogLevel.Debug);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[CoreScriptRunnerService] Exception during script execution: {ex.Message}");
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
                    _logger.Log("[CoreScriptRunnerService] Released execution lock.", LogLevel.Debug);
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
                _logger.Log($"[CoreScriptRunnerService] Found {serverContext.StructuredOutputLog.Count} structured output items in context.", LogLevel.Debug);
                foreach (var item in serverContext.StructuredOutputLog)
                {
                    response.StructuredOutput.Add(new CoreScript.StructuredOutputItem { Type = item.Type, Data = item.Data });
                }
            }

            // Sync with result.StructuredOutput if context was somehow inconsistent (Fail-safe)
            if (finalResult.StructuredOutput != null && finalResult.StructuredOutput.Count > response.StructuredOutput.Count)
            {
                _logger.Log($"[CoreScriptRunnerService] Syncing {finalResult.StructuredOutput.Count} items from finalResult.StructuredOutput.", LogLevel.Debug);
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
                    catch { /* Skip invalid JSON */ }
                }
            }

            response.InternalData = finalResult.InternalData ?? "";
            _logger.Log($"[CoreScriptRunnerService] Returning ExecuteScriptResponse. Success: {response.IsSuccess}, Output Length: {response.Output.Length}, Structured Items: {response.StructuredOutput.Count}", LogLevel.Debug);
            return response;
        }

        public override Task<GetScriptMetadataResponse> GetScriptMetadata(GetScriptMetadataRequest request, ServerCallContext context)
        {
            var response = new GetScriptMetadataResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                string combinedScript = CoreScript.Engine.Core.SemanticCombinator.Combine(scriptFiles);
                var extractedMetadata = _metadataExtractor.ExtractMetadata(combinedScript);

                response.Metadata = new CoreScript.ScriptMetadata
                {
                    Name = extractedMetadata.Name,
                    Description = extractedMetadata.Description,
                    Author = extractedMetadata.Author,
                    Website = extractedMetadata.Website,
                    Categories = { extractedMetadata.Categories },
                    LastRun = extractedMetadata.LastRun,
                    Dependencies = { extractedMetadata.Dependencies },
                    DocumentType = extractedMetadata.DocumentType,
                    UsageExamples = { extractedMetadata.UsageExamples }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in GetScriptMetadata: {ex.Message}");
                response.ErrorMessage = $"Failed to extract metadata: {ex.Message}";
            }
            return Task.FromResult(response);
        }

        public override Task<GetScriptParametersResponse> GetScriptParameters(GetScriptParametersRequest request, ServerCallContext context)
        {
            var response = new GetScriptParametersResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                var topLevelScript = CoreScript.Engine.Core.ScriptParser.IdentifyTopLevelScript(scriptFiles);

                if (topLevelScript == null)
                {
                    return Task.FromResult(response);
                }
                var extractedParams = _parameterExtractor.ExtractParameters(topLevelScript.Content);

                // If no parameters found in top-level script, check other files for "class Params"
                if (extractedParams.Count == 0 && scriptFiles.Count > 1)
                {
                   foreach (var file in scriptFiles.Where(f => f.FileName != topLevelScript.FileName))
                   {
                        var otherParams = _parameterExtractor.ExtractParameters(file.Content);
                        if (otherParams.Count > 0)
                        {
                            extractedParams = otherParams;
                             break; // Assume only one Params class definition exists
                        }
                   }
                }

                foreach (var p in extractedParams)
                {
                    var protoParam = new CoreScript.ScriptParameter
                    {
                        Name = p.Name,
                        Type = p.Type,
                        DefaultValueJson = p.DefaultValueJson,
                        Description = p.Description,
                        MultiSelect = p.MultiSelect,
                        VisibleWhen = p.VisibleWhen ?? "",
                        NumericType = p.NumericType ?? "",
                        IsRevitElement = p.IsRevitElement,
                        RevitElementType = p.RevitElementType ?? "",
                        RevitElementCategory = p.RevitElementCategory ?? "",
                        RequiresCompute = p.RequiresCompute,
                        Group = p.Group ?? "",
                        InputType = p.InputType ?? "",
                        Required = p.Required,
                        Suffix = p.Suffix ?? "",
                        Pattern = p.Pattern ?? "",
                        EnabledWhenParam = p.EnabledWhenParam ?? "",
                        EnabledWhenValue = p.EnabledWhenValue ?? "",
                        Unit = p.Unit ?? "",
                        SelectionType = p.SelectionType ?? ""
                    };
                    
                    protoParam.Options.AddRange(p.Options);
                    
                    if (p.Min.HasValue) protoParam.Min = p.Min.Value;
                    if (p.Max.HasValue) protoParam.Max = p.Max.Value;
                    if (p.Step.HasValue) protoParam.Step = p.Step.Value;
                    
                    response.Parameters.Add(protoParam);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in GetScriptParameters: {ex.Message}");
                response.ErrorMessage = $"Failed to extract parameters: {ex.Message}";
            }
            return Task.FromResult(response);
        }

        public override Task<GetCombinedScriptResponse> GetCombinedScript(GetCombinedScriptRequest request, ServerCallContext context)
        {
            var response = new GetCombinedScriptResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                string combinedScript = CoreScript.Engine.Core.SemanticCombinator.Combine(scriptFiles);
                response.CombinedScript = combinedScript;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in GetCombinedScript: {ex.Message}");
                response.ErrorMessage = $"Failed to combine scripts: {ex.Message}";
            }
            return Task.FromResult(response);
        }

        public override async Task<GetContextResponse> GetContext(GetContextRequest request, ServerCallContext context)
        {
            _logger.Log("[CoreScriptRunnerService] Entering GetContext.", LogLevel.Debug);
            if (_uiApp == null)
            {
                _logger.Log("[CoreScriptRunnerService] UIApplication is null.", LogLevel.Warning);
                return new GetContextResponse();
            }

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var response = new GetContextResponse();
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null)
                    {
                        _logger.Log("[CoreScriptRunnerService] ActiveUIDocument is null inside UI context.", LogLevel.Warning);
                        return response;
                    }

                    var doc = uidoc.Document;
                    response.ActiveViewName = uidoc.ActiveView?.Name ?? "Unknown";
                    response.ActiveViewType = uidoc.ActiveView?.ViewType.ToString() ?? "Unknown";
                    response.ActiveViewScale = uidoc.ActiveView?.Scale ?? 0;
                    response.ActiveViewDetailLevel = uidoc.ActiveView?.DetailLevel.ToString() ?? "Unknown";
                    var selection = uidoc.Selection.GetElementIds();
                    response.SelectionCount = selection.Count;
                    response.SelectedElementIds.AddRange(selection.Select(id => (int)id.Value));

                    foreach (var id in selection)
                    {
                        var element = doc.GetElement(id);
                        if (element != null)
                        {
                            var elementInfo = new CoreScript.ElementInfo
                            {
                                Id = (int)id.Value,
                                Category = element.Category?.Name ?? "Unknown"
                            };
                            response.SelectedElements.Add(elementInfo);
                        }
                    }

                    if (doc.ProjectInformation != null)
                    {
                        response.ProjectInfo = new CoreScript.ProjectInfo
                        {
                            Name = doc.ProjectInformation.Name ?? "",
                            Number = doc.ProjectInformation.Number ?? "",
                            Title = doc.Title,
                            FilePath = doc.PathName,
                            IsWorkshared = doc.IsWorkshared,
                            Username = _uiApp.Application.Username
                        };
                    }

                    // Collect all Levels
                    var levels = new FilteredElementCollector(doc)
                        .OfClass(typeof(Level))
                        .Cast<Level>()
                        .ToList();

                    foreach (var level in levels)
                    {
                        response.Levels.Add(new CoreScript.LevelInfo
                        {
                            Id = (int)level.Id.Value,
                            Name = level.Name,
                            Elevation = level.Elevation
                        });
                    }

                    return response;
                });
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in GetContext: {ex.Message}");
                return new GetContextResponse();
            }
        }

        public override Task<CreateWorkspaceResponse> CreateAndOpenWorkspace(CreateWorkspaceRequest request, ServerCallContext context)
        {
            var response = new CreateWorkspaceResponse();
            try
            {
                string workspacePath = EphemeralWorkspaceManager.CreateAndOpenWorkspace(request.ScriptPath, request.ScriptType);
                response.WorkspacePath = workspacePath;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in CreateAndOpenWorkspace: {ex.Message}");
                response.ErrorMessage = $"Failed to create and open workspace: {ex.Message}";
            }
            return Task.FromResult(response);
        }

        public override Task<GetScriptManifestResponse> GetScriptManifest(GetScriptManifestRequest request, ServerCallContext context)
        {
            var response = new GetScriptManifestResponse();
            try
            {
                string manifestPathRequest = request.ScriptPath;
                string rootPath = manifestPathRequest;
                List<string> targetPaths = new List<string>();

                // Handle multi-path format from Agent (ROOT|path1,path2)
                if (manifestPathRequest.Contains("|"))
                {
                    var parts = manifestPathRequest.Split('|');
                    rootPath = parts[0];
                    if (parts.Length > 1 && !string.IsNullOrEmpty(parts[1]))
                    {
                        targetPaths = parts[1].Split(',').ToList();
                    }
                }
                else
                {
                    targetPaths.Add(rootPath);
                }

                if (!System.IO.Directory.Exists(rootPath))
                {
                    response.ErrorMessage = $"Root script path does not exist: {rootPath}";
                    return Task.FromResult(response);
                }

                var scriptInfoList = new List<InternalScriptInfo>();
                
                // 1. Determine the "Source Folders" to scan
                List<string> sourceFolders = new List<string>();
                if (targetPaths.Count == 1 && targetPaths[0] == rootPath)
                {
                    // If just the root is provided, every subdirectory of the root is a "Source Folder"
                    sourceFolders = System.IO.Directory.GetDirectories(rootPath)
                        .Where(d => {
                            string name = System.IO.Path.GetFileName(d);
                            return !name.StartsWith(".") && name != "bin" && name != "obj";
                        }).ToList();
                }
                else
                {
                    sourceFolders = targetPaths;
                }

                // 2. Scan each Source Folder for scripts (No deep recursion)
                foreach (var sourcePath in sourceFolders)
                {
                    if (System.IO.Directory.Exists(sourcePath))
                    {
                        ScanSourceFolder(sourcePath, rootPath, scriptInfoList);
                    }
                }

                // Serialize to JSON matching the legacy format expected by frontend/agent
                var dictList = scriptInfoList.Select(info => new
                {
                    name = info.Metadata.Name,
                    type = info.Metadata.ScriptType,
                    absolutePath = System.IO.Path.Combine(rootPath, info.Metadata.FilePath),
                    metadata = new
                    {
                        description = info.Metadata.Description,
                        displayName = info.Metadata.Name,
                        relativePath = info.Metadata.FilePath,
                        author = info.Metadata.Author,
                        categories = info.Metadata.Categories,
                        usage_examples = info.Metadata.UsageExamples,
                        dependencies = info.Metadata.Dependencies,
                        document_type = info.Metadata.DocumentType,
                        lastRun = info.Metadata.LastRun,
                        is_protected = info.Metadata.IsProtected,
                        is_compiled = info.Metadata.IsCompiled
                    },
                    parameters = info.Parameters.Select(p => new {
                        name = p.Name,
                        type = p.Type,
                        description = p.Description,
                        defaultValue = p.DefaultValueJson,
                        numericType = p.NumericType,
                        unit = p.Unit,
                        min = p.HasMin ? (double?)p.Min : null,
                        max = p.HasMax ? (double?)p.Max : null,
                        step = p.HasStep ? (double?)p.Step : null,
                        options = p.Options,
                        isRevitElement = p.IsRevitElement,
                        revitElementType = p.RevitElementType,
                        revitElementCategory = p.RevitElementCategory,
                        required = p.Required,
                        group = p.Group
                    }).ToList()
                }).ToList();
                response.ManifestJson = JsonSerializer.Serialize(dictList);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in GetScriptManifest: {ex.Message}");
                response.ErrorMessage = $"Failed to generate manifest: {ex.Message}";
            }
            return Task.FromResult(response);
        }

        private class InternalScriptInfo
        {
            public CoreScript.ScriptMetadata Metadata { get; set; }
            public List<CoreScript.ScriptParameter> Parameters { get; set; }
        }

        /// <summary>
        /// Scans a "Source Folder" (e.g. 'Walls' or 'Auditing') for scripts.
        /// Inside a source folder: 
        /// - Every .cs file is a single-file script.
        /// - Every subdirectory is a multi-file script folder.
        /// No further recursion occurs.
        /// </summary>
        private void ScanSourceFolder(string sourcePath, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                // 1. Every .cs file in the source folder is a single-file script
                var csFiles = System.IO.Directory.GetFiles(sourcePath, "*.cs", System.IO.SearchOption.TopDirectoryOnly);
                foreach (var filePath in csFiles)
                {
                    if (System.IO.Path.GetFileName(filePath).StartsWith(".")) continue;
                    AddSingleFileScript(filePath, rootPath, scripts);
                }

                // 2. Every subdirectory in the source folder is a multi-file script
                var subDirs = System.IO.Directory.GetDirectories(sourcePath);
                foreach (var dir in subDirs)
                {
                    string dirName = System.IO.Path.GetFileName(dir);
                    if (dirName.StartsWith(".") || dirName == "bin" || dirName == "obj") continue;

                    if (IsMultiFileScript(dir, out string metadataContent, out List<CoreScript.ScriptParameter> parameters))
                    {
                        AddMultiFileScript(dir, metadataContent, parameters, rootPath, scripts);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Log($"[CoreScriptRunnerService] Error scanning source folder {sourcePath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private void AddSingleFileScript(string filePath, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                string content = System.IO.File.ReadAllText(filePath);
                var metadata = _metadataExtractor.ExtractMetadata(content);
                var paramList = MapToProtoParameters(_parameterExtractor.ExtractParameters(content));

                if (string.IsNullOrEmpty(metadata.Name))
                    metadata.Name = System.IO.Path.GetFileNameWithoutExtension(filePath);
                string relativePath = System.IO.Path.GetRelativePath(rootPath, filePath);

                scripts.Add(new InternalScriptInfo
                {
                    Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = metadata.Name,
                        FilePath = relativePath,
                        ScriptType = "single-file",
                        Description = metadata.Description,
                        Author = metadata.Author,
                        Website = metadata.Website,
                        Categories = { metadata.Categories },
                        LastRun = metadata.LastRun,
                        Dependencies = { metadata.Dependencies },
                        DocumentType = metadata.DocumentType,
                        UsageExamples = { metadata.UsageExamples }
                    },
                    Parameters = paramList
                });
            }
            catch (Exception ex)
            {
                _logger.Log($"[CoreScriptRunnerService] Failed to parse single script {filePath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private void AddMultiFileScript(string dirPath, string metadataSourceContent, List<CoreScript.ScriptParameter> parameters, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                var metadata = _metadataExtractor.ExtractMetadata(metadataSourceContent);

                if (string.IsNullOrEmpty(metadata.Name))
                    metadata.Name = System.IO.Path.GetFileName(dirPath);
                string relativePath = System.IO.Path.GetRelativePath(rootPath, dirPath);

                scripts.Add(new InternalScriptInfo
                {
                    Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = metadata.Name,
                        FilePath = relativePath,
                        ScriptType = "multi-file",
                        Description = metadata.Description,
                        Author = metadata.Author,
                        Website = metadata.Website,
                        Categories = { metadata.Categories },
                        LastRun = metadata.LastRun,
                        Dependencies = { metadata.Dependencies },
                        DocumentType = metadata.DocumentType,
                        UsageExamples = { metadata.UsageExamples }
                    },
                    Parameters = parameters
                });
            }
            catch (Exception ex)
            {
                _logger.Log($"[CoreScriptRunnerService] Failed to parse multi-file script {dirPath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private List<CoreScript.ScriptParameter> MapToProtoParameters(List<CoreScript.Engine.Models.ScriptParameter> extractedParams)
        {
            var protoParams = new List<CoreScript.ScriptParameter>();
            foreach (var p in extractedParams)
            {
                var protoParam = new CoreScript.ScriptParameter
                {
                    Name = p.Name,
                    Type = p.Type,
                    DefaultValueJson = p.DefaultValueJson,
                    Description = p.Description,
                    MultiSelect = p.MultiSelect,
                    VisibleWhen = p.VisibleWhen ?? "",
                    NumericType = p.NumericType ?? "",
                    IsRevitElement = p.IsRevitElement,
                    RevitElementType = p.RevitElementType ?? "",
                    RevitElementCategory = p.RevitElementCategory ?? "",
                    RequiresCompute = p.RequiresCompute,
                    Group = p.Group ?? "",
                    InputType = p.InputType ?? "",
                    Required = p.Required,
                    Suffix = p.Suffix ?? "",
                    Pattern = p.Pattern ?? "",
                    EnabledWhenParam = p.EnabledWhenParam ?? "",
                    EnabledWhenValue = p.EnabledWhenValue ?? "",
                    Unit = p.Unit ?? "",
                    SelectionType = p.SelectionType ?? ""
                };
                
                protoParam.Options.AddRange(p.Options);
                
                if (p.Min.HasValue) protoParam.Min = p.Min.Value;
                if (p.Max.HasValue) protoParam.Max = p.Max.Value;
                if (p.Step.HasValue) protoParam.Step = p.Step.Value;
                
                protoParams.Add(protoParam);
            }
            return protoParams;
        }


        private bool IsMultiFileScript(string dirPath, out string metadataSourceContent, out List<CoreScript.ScriptParameter> parameters)
        {
            metadataSourceContent = "";
            parameters = new List<CoreScript.ScriptParameter>();

            var files = System.IO.Directory.GetFiles(dirPath, "*.cs", System.IO.SearchOption.TopDirectoryOnly);

            if (files.Length == 0)
            {
                return false;
            }
            var scriptFiles = files.Select(f => new CoreScript.Engine.Models.ScriptFile
            {
                FileName = System.IO.Path.GetFileName(f),
                Content = System.IO.File.ReadAllText(f)
            }).ToList();

            // Use the engine's logic to find the main script file (where metadata usually lives)
            var topLevelScript = CoreScript.Engine.Core.ScriptParser.IdentifyTopLevelScript(scriptFiles);

            if (topLevelScript != null)
            {
                metadataSourceContent = topLevelScript.Content;
                parameters = MapToProtoParameters(_parameterExtractor.ExtractParameters(topLevelScript.Content));
            }
            else
            {
                // Fallback: If no top-level script is clearly identified (e.g. all classes),
                // we might just use the first file or combine them.
                // For metadata purposes, let's try the combined version as a fallback.
                metadataSourceContent = CoreScript.Engine.Core.SemanticCombinator.Combine(scriptFiles);
                parameters = MapToProtoParameters(_parameterExtractor.ExtractParameters(metadataSourceContent));
            }
            return true;
        }

        public override async Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request, ServerCallContext context)
        {
            var response = new ValidateWorkingSetResponse();
            if (_uiApp == null)
            {
                _logger.Log("[CoreScriptRunnerService] ValidateWorkingSet: UIApplication is null.", LogLevel.Warning);
                return response;
            }

            try
            {
                var validIds = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null)
                    {
                        _logger.Log("[CoreScriptRunnerService] ValidateWorkingSet: ActiveUIDocument is null.", LogLevel.Warning);
                        return new List<long>(); // Return empty list on failure
                    }

                    var doc = uidoc.Document;
                    var currentlyValidIds = new List<long>();
                    foreach (var id in request.ElementIds)
                    {
                        var element = doc.GetElement(new ElementId(id));
                        if (element != null)
                        {
                            currentlyValidIds.Add(id);
                        }
                    }
                    return currentlyValidIds;
                });

                if (validIds != null)
                {
                    response.ValidElementIds.AddRange(validIds);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Error in ValidateWorkingSet: {ex.Message}");
            }
            return response;
        }

        public override async Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request, ServerCallContext context)
        {
            _logger.Log($"[CoreScriptRunnerService] Entering ComputeParameterOptions for parameter: {request.ParameterName}", LogLevel.Debug);
            var response = new ComputeParameterOptionsResponse { IsSuccess = false };
            
            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            if (string.IsNullOrWhiteSpace(request.ScriptContent))
            {
                response.ErrorMessage = "Script content is empty.";
                return response;
            }

            if (string.IsNullOrWhiteSpace(request.ParameterName))
            {
                response.ErrorMessage = "Parameter name is empty.";
                return response;
            }

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var serverContext = new ServerContext(_uiApp, isReadOnly: true);
                    // 1. Extract the parameter definition to check how to compute options
                    var parameters = _parameterExtractor.ExtractParameters(request.ScriptContent);
                    var targetParam = parameters.FirstOrDefault(p => p.Name == request.ParameterName);
                    
                    if (targetParam == null)
                    {
                        return new List<string>();
                    }

                    // 2. Manual Providers (The "Pro" Logic)
                    var optionsExecutor = new ParameterOptionsExecutor(_logger);
                    if (optionsExecutor.HasOptionsFunction(request.ScriptContent, request.ParameterName))
                    {
                        try
                        {
                            // 2a. Dynamic Range (_Range)
                            if (optionsExecutor.HasRangeFunction(request.ScriptContent, request.ParameterName))
                            {
                                var range = optionsExecutor.ExecuteRangeFunction(
                                    request.ScriptContent,
                                    request.ParameterName,
                                    serverContext
                                ).GetAwaiter().GetResult();

                                if (range.HasValue)
                                {
                                    response.Min = range.Value.Min;
                                    response.Max = range.Value.Max;
                                    response.Step = range.Value.Step;
                                    response.IsSuccess = true;
                                    // Range usually doesn't return options, but if it's Just a range check, we return empty list
                                }
                            }

                            // 2b. Manual Options (_Options / _Filter)
                            // V4 FIX: If a custom provider exists, it is AUTHORITATIVE. 
                            // We do NOT fallback to automatic extraction if it returns empty.
                            // An empty list means "no matches found", not "try something else".
                            var options = optionsExecutor.ExecuteOptionsFunction(
                                request.ScriptContent,
                                request.ParameterName,
                                serverContext
                            ).GetAwaiter().GetResult();
                            
                            return options ?? new List<string>();
                        }
                        catch (InvalidOperationException ex)
                        {
                            _logger.Log($"[CoreScriptRunnerService] Options function error: {ex.Message}", LogLevel.Warning);
                            throw; 
                        }
                    }

                    // 3. Strategy B: Automatic Revit Element Extraction (The "Simple" Fallback)
                    if (targetParam.IsRevitElement && !string.IsNullOrEmpty(targetParam.RevitElementType))
                    {
                        var doc = _uiApp.ActiveUIDocument.Document;
                        var optionsComputer = new ParameterOptionsComputer(doc);
                        _logger.Log($"[CoreScriptRunnerService] Using Automatic ParameterOptionsComputer for {targetParam.Name} (Type: {targetParam.RevitElementType})", LogLevel.Debug);
                        return optionsComputer.ComputeOptions(targetParam.RevitElementType, targetParam.RevitElementCategory);
                    }

                    return new List<string>();
                });

                if (result != null)
                {
                    if (result.Count > 0)
                    {
                        response.Options.AddRange(result);
                        _logger.Log($"[CoreScriptRunnerService] Successfully computed {result.Count} options for {request.ParameterName}", LogLevel.Debug);
                    }
                    else
                    {
                        _logger.Log($"[CoreScriptRunnerService] Successfully computed 0 options (Empty Result) for {request.ParameterName}", LogLevel.Debug);
                    }
                    response.IsSuccess = true;
                }
                else if (response.IsSuccess) 
                {
                    // Case where Range execution succeeded (set manually inside ExecuteInUIContext)
                    _logger.Log($"[CoreScriptRunnerService] Successfully computed range for {request.ParameterName}", LogLevel.Debug);
                }
                else
                {
                    // Provide a more helpful error message
                    var parameters = _parameterExtractor.ExtractParameters(request.ScriptContent);
                    var targetParam = parameters.FirstOrDefault(p => p.Name == request.ParameterName);

                    response.IsSuccess = false;
                    
                    if (targetParam != null && targetParam.IsRevitElement && !string.IsNullOrEmpty(targetParam.RevitElementType))
                    {
                        string categoryMsg = string.IsNullOrEmpty(targetParam.RevitElementCategory) ? "" : $" in category '{targetParam.RevitElementCategory}'";
                        response.ErrorMessage = $"No elements of type '{targetParam.RevitElementType}'{categoryMsg} found in the current document.";
                    }
                    else
                    {
                        response.ErrorMessage = $"The options provider '{request.ParameterName}_Options' (or Range) returned no results.";
                    }

                    _logger.Log($"[CoreScriptRunnerService] {response.ErrorMessage}", LogLevel.Warning);
                }
            }
            catch (Exception ex)
            {
                // Extract the innermost exception message (unwrap AggregateException, etc.)
                var innerException = ex;
                while (innerException.InnerException != null)
                {
                    innerException = innerException.InnerException;
                }
                
                string errorMessage = innerException.Message;
                _logger.LogError($"[CoreScriptRunnerService] Error in ComputeParameterOptions: {errorMessage}");
                response.IsSuccess = false;
                response.ErrorMessage = errorMessage;
            }

            return response;
        }

        public override async Task<SelectElementsResponse> SelectElements(SelectElementsRequest request, ServerCallContext context)
        {
            _logger.Log($"[CoreScriptRunnerService] Entering SelectElements. Target count: {request.ElementIds.Count}", LogLevel.Debug);
            var response = new SelectElementsResponse { IsSuccess = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    var ids = request.ElementIds.Select(id => new ElementId(id)).ToList();
                    uidoc.Selection.SetElementIds(ids);
                    
                    // Optional: Zoom to selection
                    if (ids.Count > 0)
                    {
                        uidoc.ShowElements(ids.First());
                    }
                    return true;
                });

                response.IsSuccess = true;
                _logger.Log("[CoreScriptRunnerService] Selection updated successfully.", LogLevel.Debug);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] Selection failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public override async Task<PickObjectResponse> PickObject(PickObjectRequest request, ServerCallContext context)
        {
            _logger.Log($"[CoreScriptRunnerService] Entering PickObject. Type: {request.SelectionType}", LogLevel.Debug);
            var response = new PickObjectResponse { IsSuccess = false, Cancelled = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    try
                    {
                        // Bring Revit to front (Basic attempt, might need PInvoke for full focus)
                        // However, PickObject usually focuses the window automatically.
                        
                        if (request.SelectionType.Equals("Point", StringComparison.OrdinalIgnoreCase))
                        {
                            XYZ point = uidoc.Selection.PickPoint("Pick a point");
                            // Return formatted string: "X,Y,Z"
                            return $"{point.X},{point.Y},{point.Z}";
                        }
                        else
                        {
                            Autodesk.Revit.UI.Selection.ObjectType objType = Autodesk.Revit.UI.Selection.ObjectType.Element;
                            
                            if (request.SelectionType.Equals("Face", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.Face;
                            else if (request.SelectionType.Equals("Edge", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.Edge;
                            else if (request.SelectionType.Equals("PointOnElement", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.PointOnElement;

                            Reference reference;
                            if (!string.IsNullOrEmpty(request.CategoryFilter))
                            {
                                string cleanName = request.CategoryFilter.Trim();
                                string singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) 
                                                   ? cleanName.Substring(0, cleanName.Length - 1) 
                                                   : cleanName;

                                _logger.Log($"[CoreScriptRunnerService] Resolving Category Filter: '{cleanName}'", LogLevel.Debug);
                                ElementId? targetCategoryId = null;

                                // 1. Strategy: Direct Name Match (Plural/Singular)
                                foreach (Category cat in uidoc.Document.Settings.Categories)
                                {
                                    if (cat.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || 
                                        cat.Name.Equals($"{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                                        cat.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                                        cat.Name.Equals($"{singularName}s", StringComparison.OrdinalIgnoreCase))
                                    {
                                        targetCategoryId = cat.Id;
                                        _logger.Log($"[CoreScriptRunnerService] Resolved '{cleanName}' via Name Match to ID: {targetCategoryId}", LogLevel.Debug);
                                        break;
                                    }
                                }

                                // 2. Strategy: BuiltInCategory Enum Match (Language Independent)
                                if (targetCategoryId == null)
                                {
                                    var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                                    var builtin = categories.FirstOrDefault(c => 
                                        c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase));

                                    if (builtin != default)
                                    {
                                        targetCategoryId = new ElementId(builtin);
                                        _logger.Log($"[CoreScriptRunnerService] Resolved '{cleanName}' via BuiltInCategory to ID: {targetCategoryId}", LogLevel.Debug);
                                    }
                                }

                                // 3. Strategy: Class Type Match (e.g. "Wall", "Floor")
                                Type? targetType = null;
                                if (targetCategoryId == null)
                                {
                                    var revitAssembly = typeof(Element).Assembly;
                                    targetType = revitAssembly.GetTypes().FirstOrDefault(t => 
                                        typeof(Element).IsAssignableFrom(t) && 
                                        (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)));
                                    
                                    if (targetType != null)
                                    {
                                        _logger.Log($"[CoreScriptRunnerService] Resolved '{cleanName}' via Class Type to: {targetType.Name}", LogLevel.Debug);
                                    }
                                }

                                if (targetCategoryId != null || targetType != null)
                                {
                                    var filter = new UniversalSelectionFilter(targetCategoryId, targetType);
                                    reference = uidoc.Selection.PickObject(objType, filter, $"Pick {request.SelectionType} ({request.CategoryFilter})");
                                }
                                else
                                {
                                    _logger.Log($"[CoreScriptRunnerService] Category filter '{request.CategoryFilter}' NOT FOUND in document. Falling back to all.", LogLevel.Warning);
                                    reference = uidoc.Selection.PickObject(objType, $"Pick {request.SelectionType}");
                                }
                            }
                            else
                            {
                                _logger.Log("[CoreScriptRunnerService] No Category Filter provided. Allowing all elements.", LogLevel.Debug);
                                reference = uidoc.Selection.PickObject(objType, $"Pick {request.SelectionType}");
                            }
                            
                            // Return Element ID
                            return reference.ElementId.Value.ToString();
                        }
                    }
                    catch (Autodesk.Revit.Exceptions.OperationCanceledException)
                    {
                        // User pressed Esc
                        return "CANCELLED"; 
                    }
                });

                if (result == "CANCELLED")
                {
                    response.Cancelled = true;
                    response.IsSuccess = false; // Not an error, just cancellation
                }
                else
                {
                    response.Value = result;
                    response.IsSuccess = true;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] PickObject failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public override Task<RenameScriptResponse> RenameScript(RenameScriptRequest request, ServerCallContext context)
        {
            var response = new RenameScriptResponse();
            try
            {
                string oldPath = request.OldPath;
                string newName = request.NewName?.Trim() ?? "";

                // Validate new name
                if (string.IsNullOrWhiteSpace(newName))
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = "New name cannot be empty.";
                    return Task.FromResult(response);
                }

                // Check for invalid characters
                char[] invalidChars = System.IO.Path.GetInvalidFileNameChars();
                if (newName.IndexOfAny(invalidChars) >= 0)
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = $"New name contains invalid characters.";
                    return Task.FromResult(response);
                }

                bool isDirectory = System.IO.Directory.Exists(oldPath);
                bool isFile = System.IO.File.Exists(oldPath);

                if (!isDirectory && !isFile)
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = $"Source script not found at path: {oldPath}";
                    return Task.FromResult(response);
                }

                // Compute new path
                string directory = System.IO.Path.GetDirectoryName(oldPath) ?? "";
                string newPath = "";
                
                if (isDirectory)
                {
                    newPath = System.IO.Path.Combine(directory, newName);
                    if (System.IO.Directory.Exists(newPath))
                    {
                        response.IsSuccess = false;
                        response.ErrorMessage = $"A folder with the name '{newName}' already exists.";
                        return Task.FromResult(response);
                    }
                }
                else
                {
                    newPath = System.IO.Path.Combine(directory, newName + ".cs");
                    if (System.IO.File.Exists(newPath))
                    {
                        response.IsSuccess = false;
                        response.ErrorMessage = $"A script with the name '{newName}' already exists.";
                        return Task.FromResult(response);
                    }
                }

                // Cleanup: Stop watchers and remove from ActiveWorkspaces
                // This prevents orphaned watchers and allows the old workspace to be deleted
                if (ParacoreApp.ActiveWorkspaces.TryGetValue(oldPath, out string? workspacePath))
                {
                    _logger.Log($"[RenameScript] Cleaning up workspace for old path: {oldPath}", LogLevel.Info);
                    ParacoreApp.ActiveWorkspaces.Remove(oldPath);
                }

                // Perform the rename
                if (isDirectory)
                {
                    System.IO.Directory.Move(oldPath, newPath);
                }
                else
                {
                    System.IO.File.Move(oldPath, newPath);
                }

                _logger.Log($"[RenameScript] Renamed '{(isDirectory ? "folder" : "file")}' '{oldPath}' to '{newPath}'", LogLevel.Info);
                response.IsSuccess = true;
                response.NewPath = newPath;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[CoreScriptRunnerService] RenameScript failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return Task.FromResult(response);
        }
    }

    public class UniversalSelectionFilter : Autodesk.Revit.UI.Selection.ISelectionFilter
    {
        private readonly ElementId? _categoryId;
        private readonly Type? _classType;

        public UniversalSelectionFilter(ElementId? categoryId, Type? classType)
        {
            _categoryId = categoryId;
            _classType = classType;
        }

        public bool AllowElement(Element elem)
        {
            // Priority 1: Check Class Type (Robust)
            if (_classType != null)
            {
                return _classType.IsAssignableFrom(elem.GetType());
            }

            // Priority 2: Check Category ID
            if (_categoryId != null)
            {
                return elem.Category != null && elem.Category.Id.Value == _categoryId.Value;
            }

            return true;
        }

        public bool AllowReference(Reference reference, XYZ position)
        {
            return false;
        }
    }
}
