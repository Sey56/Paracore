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
                // Optionally return a response with an error message
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
    }
}