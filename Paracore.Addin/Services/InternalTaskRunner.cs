using CoreScript;
using CoreScript.Engine.Logging;
using Paracore.Addin.Handlers;
using Paracore.Addin.ViewModels;
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Text.Json;
using System.Collections.Generic;

namespace Paracore.Addin.Services
{
    /// <summary>
    /// This class contains the LOCAL execution logic for all Corescript gRPC methods.
    /// It is used by the CoreScriptClient to process tasks received from the sidecar.
    /// </summary>
    public class InternalTaskRunner
    {
        private readonly ScriptExecutionHandler _executionHandler;
        private readonly MetadataHandler _metadataHandler;
        private readonly ContextHandler _contextHandler;
        private readonly FileSystemHandler _fileSystemHandler;
        private readonly ReplHandler _replHandler;

        public InternalTaskRunner(
            ScriptExecutionHandler executionHandler,
            MetadataHandler metadataHandler,
            ContextHandler contextHandler,
            FileSystemHandler fileSystemHandler,
            ReplHandler replHandler)
        {
            _executionHandler = executionHandler;
            _metadataHandler = metadataHandler;
            _contextHandler = contextHandler;
            _fileSystemHandler = fileSystemHandler;
            _replHandler = replHandler;
        }

        public Task<BuildScriptResponse> BuildScript(BuildScriptRequest request)
        {
            return _executionHandler.BuildScript(request);
        }

        public GetStatusResponse GetStatus()
        {
            return _contextHandler.GetStatus();
        }

        public Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request)
        {
            return _executionHandler.ExecuteScript(request);
        }

        public GetScriptMetadataResponse GetScriptMetadata(GetScriptMetadataRequest request)
        {
            return _metadataHandler.GetScriptMetadata(request);
        }

        public GetScriptParametersResponse GetScriptParameters(GetScriptParametersRequest request)
        {
            return _metadataHandler.GetScriptParameters(request);
        }

        public GetCombinedScriptResponse GetCombinedScript(GetCombinedScriptRequest request)
        {
            return _metadataHandler.GetCombinedScript(request);
        }

        public GetBulkMetadataResponse GetBulkMetadata(GetBulkMetadataRequest request)
        {
            return _metadataHandler.GetBulkMetadata(request);
        }

        public Task<GetContextResponse> GetContext()
        {
            return _contextHandler.GetContext();
        }

        public GetScriptManifestResponse GetScriptManifest(GetScriptManifestRequest request)
        {
            return _metadataHandler.GetScriptManifest(request);
        }

        public Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request)
        {
            return _contextHandler.ValidateWorkingSet(request);
        }

        public Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request)
        {
            return _contextHandler.ComputeParameterOptions(request);
        }

        public Task<SelectElementsResponse> SelectElements(SelectElementsRequest request)
        {
            return _contextHandler.SelectElements(request);
        }

        public Task<PickObjectResponse> PickObject(PickObjectRequest request)
        {
            return _contextHandler.PickObject(request);
        }

        public RenameScriptResponse RenameScript(RenameScriptRequest request)
        {
            return _fileSystemHandler.RenameScript(request);
        }

        public CreateWorkspaceResponse CreateAndOpenWorkspace(CreateWorkspaceRequest request)
        {
            return _fileSystemHandler.CreateAndOpenWorkspace(request);
        }

        public StopSyncSessionResponse StopSyncSession(StopSyncSessionRequest request)
        {
            return _fileSystemHandler.StopSyncSession(request);
        }

        public Task<GetCategoryParametersResponse> GetCategoryParameters(GetCategoryParametersRequest request)
        {
            return _contextHandler.GetCategoryParameters(request);
        }

        public Task<GetModelCategoriesResponse> GetModelCategories(GetModelCategoriesRequest request)
        {
            return _contextHandler.GetModelCategories(request);
        }

        public GetWatchdogStatusResponse GetWatchdogStatus()
        {
            var active = CoreScript.Engine.Globals.WatchdogRegistry.GetActiveWatchdogs();
            var response = new GetWatchdogStatusResponse();

            foreach (var w in active)
            {
                response.Watchdogs.Add(new WatchdogStatus
                {
                    ScriptPath = w.ScriptPath,
                    ScriptName = w.ScriptName,
                    Summary = w.LatestReport.Summary,
                    Status = w.LatestReport.Status,
                    DetailsJson = w.LatestReport.DetailsJson,
                    Timestamp = w.LatestReport.Timestamp.ToString("o"),
                    ParametersJson = System.Text.Json.JsonSerializer.Serialize(w.SnapshotParameters)
                });
            }

            var failed = CoreScript.Engine.Globals.WatchdogRegistry.GetFailedWatchdogs();
            foreach (var f in failed)
            {
                response.FailedWatchdogs.Add(new FailedWatchdog
                {
                    ScriptPath = f.ScriptPath,
                    ScriptName = f.ScriptName,
                    ErrorMessage = f.ErrorMessage,
                    Timestamp = f.Timestamp.ToString("o")
                });
            }

            return response;
        }

        public Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request)
        {
            return _executionHandler.RegisterWatchdogSource(request);
        }

        public Task<UnregisterWatchdogSourceResponse> UnregisterWatchdogSource(UnregisterWatchdogSourceRequest request)
        {
            return _executionHandler.UnregisterWatchdogSource(request);
        }

        public Task<UpdateElementParameterResponse> UpdateElementParameter(UpdateElementParameterRequest request)
        {
            return _contextHandler.UpdateElementParameter(request);
        }

        public Task<BatchUpdateElementParametersResponse> BatchUpdateElementParameters(BatchUpdateElementParametersRequest request)
        {
            return _contextHandler.BatchUpdateElementParameters(request);
        }

        public ClearAssemblyCacheResponse ClearAssemblyCache()
        {
            ServerViewModel.Instance.ClearAssemblyCache();
            return new ClearAssemblyCacheResponse
            {
                IsSuccess = true,
                Message = "Assembly cache cleared successfully."
            };
        }

        public Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request)
        {
            return _replHandler.ExecuteRepl(request);
        }
    }
}
