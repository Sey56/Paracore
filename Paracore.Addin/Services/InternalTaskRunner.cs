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
    public partial class InternalTaskRunner
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

        // ------------------------------------------------------------------
        // Sentinels (watchdog) RPCs.
        //
        // ⚠ FREE (non-Pro) as of 2026-10-08 (user ruling). The watchdog mechanism is generic
        // background execution, so it ships with EVERY tier: the three implementations live in
        // InternalTaskRunner.Sentinels.cs, which is a SHARED file now — not a Pro half.
        //
        // Each hook FILLS a fresh response. Nothing is pre-seeded here on purpose: the old
        // code seeded `IsSuccess = false` + "requires the Paracore Pro Add-in (Sentinels)" and
        // relied on the Pro hook to overwrite it. That message is false now, and a default that
        // exists only to be overwritten is a landmine if a hook ever returns early.
        // ------------------------------------------------------------------

        public GetWatchdogStatusResponse GetWatchdogStatus()
        {
            var response = new GetWatchdogStatusResponse();
            FillWatchdogStatus(response);
            return response;
        }

        partial void FillWatchdogStatus(GetWatchdogStatusResponse response);

        public Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request)
        {
            var response = new RegisterWatchdogSourceResponse();
            FillRegisterWatchdogSource(request, response);
            return Task.FromResult(response);
        }

        partial void FillRegisterWatchdogSource(RegisterWatchdogSourceRequest request, RegisterWatchdogSourceResponse response);

        public Task<UnregisterWatchdogSourceResponse> UnregisterWatchdogSource(UnregisterWatchdogSourceRequest request)
        {
            var response = new UnregisterWatchdogSourceResponse();
            FillUnregisterWatchdogSource(request, response);
            return Task.FromResult(response);
        }

        partial void FillUnregisterWatchdogSource(UnregisterWatchdogSourceRequest request, UnregisterWatchdogSourceResponse response);

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

        public Task<GetReplCompletionsResponse> GetReplCompletions(GetReplCompletionsRequest request)
        {
            return _replHandler.GetReplCompletions(request);
        }

        public Task<GetReplDiagnosticsResponse> GetReplDiagnostics(GetReplDiagnosticsRequest request)
        {
            return _replHandler.GetReplDiagnostics(request);
        }

        public Task<GetReplHoverResponse> GetReplHover(GetReplHoverRequest request)
        {
            return _replHandler.GetReplHover(request);
        }
    }
}
