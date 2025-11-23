using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Google.Protobuf;
using Grpc.Core;
using CoreScript;
using CoreScript.Engine.Core; // Added for ParameterExtractor
using CoreScript.Engine.Logging;
using RServer.Addin.Context;
using RServer.Addin.Helpers; // Added for EphemeralWorkspaceManager
using RServer.Addin.ViewModels;
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text.Json;

namespace RServer.Addin.Services
{
    public class CoreScriptRunnerService : CoreScriptRunner.CoreScriptRunnerBase
    {
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
                RserverConnected = true,
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

            if (string.IsNullOrWhiteSpace(scriptContentStr))
            {
                _logger.Log("[CoreScriptRunnerService] Script content is empty.", LogLevel.Debug);
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
                    ServerViewModel.Instance.DispatchScript(scriptContentStr, parametersJsonStr, serverContext);
                    _logger.Log("[CoreScriptRunnerService] DispatchScript called. Waiting for completion.", LogLevel.Debug);

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

            var response = new ExecuteScriptResponse
            {
                IsSuccess = finalResult.IsSuccess,
                Output = string.Join("\n", outputMessages),
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

            response.InternalData = finalResult.InternalData ?? "";

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
                foreach (var p in extractedParams)
                {
                    response.Parameters.Add(new CoreScript.ScriptParameter
                    {
                        Name = p.Name,
                        Type = p.Type,
                        DefaultValueJson = p.DefaultValueJson,
                        Description = p.Description,
                        Options = { p.Options }
                    });
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
                string rootPath = request.ScriptPath;
                if (!System.IO.Directory.Exists(rootPath))
                {
                    response.ErrorMessage = $"Script path does not exist: {rootPath}";
                    return Task.FromResult(response);
                }

                var scriptMetadataList = new List<CoreScript.ScriptMetadata>();
                
                // Level 1: Domains (e.g. Architectural, Documentation)
                var domainDirectories = System.IO.Directory.GetDirectories(rootPath);

                foreach (var domainDir in domainDirectories)
                {
                    if (System.IO.Path.GetFileName(domainDir).StartsWith(".")) continue;
                    if (domainDir.EndsWith("bin") || domainDir.EndsWith("obj")) continue;

                    // Level 2: Script Sources (e.g. Walls, Sheets)
                    var sourceDirectories = System.IO.Directory.GetDirectories(domainDir);

                    foreach (var sourceDir in sourceDirectories)
                    {
                        if (System.IO.Path.GetFileName(sourceDir).StartsWith(".")) continue;
                        
                        // Level 3: Scripts (Single-file or Multi-file) inside the Script Source
                        ScanScriptSource(sourceDir, rootPath, scriptMetadataList);
                    }
                }

                // Serialize to JSON matching the legacy format expected by frontend/agent
                var dictList = scriptMetadataList.Select(m => new 
                {
                    name = m.Name,
                    type = m.ScriptType,
                    absolutePath = System.IO.Path.Combine(rootPath, m.FilePath), // Reconstruct absolute path
                    metadata = new 
                    {
                        description = m.Description,
                        displayName = m.Name,
                        author = m.Author,
                        categories = m.Categories,
                        usage_examples = m.UsageExamples,
                        dependencies = m.Dependencies,
                        document_type = m.DocumentType,
                        lastRun = m.LastRun
                    }
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

        private void ScanScriptSource(string sourcePath, string rootPath, List<CoreScript.ScriptMetadata> scripts)
        {
            try
            {
                // 1. Single-file Scripts: .cs files directly in the Script Source folder
                var csFiles = System.IO.Directory.GetFiles(sourcePath, "*.cs", System.IO.SearchOption.TopDirectoryOnly);
                foreach (var filePath in csFiles)
                {
                    if (System.IO.Path.GetFileName(filePath).StartsWith(".")) continue;
                    
                    try
                    {
                        string content = System.IO.File.ReadAllText(filePath);
                        var metadata = _metadataExtractor.ExtractMetadata(content);
                        
                        if (string.IsNullOrEmpty(metadata.Name))
                            metadata.Name = System.IO.Path.GetFileNameWithoutExtension(filePath);

                        string relativePath = System.IO.Path.GetRelativePath(rootPath, filePath);

                        scripts.Add(new CoreScript.ScriptMetadata
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
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.Log($"[CoreScriptRunnerService] Failed to parse single script {filePath}: {ex.Message}", LogLevel.Warning);
                    }
                }

                // 2. Multi-file Scripts: Folders directly in the Script Source folder
                var subDirs = System.IO.Directory.GetDirectories(sourcePath);
                foreach (var dir in subDirs)
                {
                    if (System.IO.Path.GetFileName(dir).StartsWith(".")) continue;
                    if (dir.EndsWith("bin") || dir.EndsWith("obj")) continue;

                    // Any folder here is treated as a Multi-file Script
                    // We try to combine its contents to extract metadata
                    if (IsMultiFileScript(dir, out var metadataSourceContent))
                    {
                        try
                        {
                            var metadata = _metadataExtractor.ExtractMetadata(metadataSourceContent);
                            
                            if (string.IsNullOrEmpty(metadata.Name))
                                metadata.Name = System.IO.Path.GetFileName(dir);

                            string relativePath = System.IO.Path.GetRelativePath(rootPath, dir);

                            scripts.Add(new CoreScript.ScriptMetadata
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
                            });
                        }
                        catch (Exception ex)
                        {
                            _logger.Log($"[CoreScriptRunnerService] Failed to parse multi-file script {dir}: {ex.Message}", LogLevel.Warning);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Log($"[CoreScriptRunnerService] Error scanning script source {sourcePath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private bool IsMultiFileScript(string dirPath, out string metadataSourceContent)
        {
            metadataSourceContent = "";
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
            }
            else
            {
                // Fallback: If no top-level script is clearly identified (e.g. all classes),
                // we might just use the first file or combine them.
                // For metadata purposes, let's try the combined version as a fallback.
                metadataSourceContent = CoreScript.Engine.Core.SemanticCombinator.Combine(scriptFiles);
            }

            return true;
        }
    }
}