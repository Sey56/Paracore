using CoreScript;
using Grpc.Core;
using System.Threading.Tasks;

namespace Paracore.Server.Services
{
    public class CoreScriptProxyService : CoreScriptRunner.CoreScriptRunnerBase
    {
        private readonly AddinBridgeService _bridge;

        public CoreScriptProxyService(AddinBridgeService bridge)
        {
            _bridge = bridge;
        }

        public override Task<BuildScriptResponse> BuildScript(BuildScriptRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<BuildScriptRequest, BuildScriptResponse>("BuildScript", request);
        }

        public override Task<GetStatusResponse> GetStatus(GetStatusRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetStatusRequest, GetStatusResponse>("GetStatus", request);
        }

        public override Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ExecuteScriptRequest, ExecuteScriptResponse>("ExecuteScript", request);
        }

        public override Task<GetScriptMetadataResponse> GetScriptMetadata(GetScriptMetadataRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetScriptMetadataRequest, GetScriptMetadataResponse>("GetScriptMetadata", request);
        }

        public override Task<GetScriptParametersResponse> GetScriptParameters(GetScriptParametersRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetScriptParametersRequest, GetScriptParametersResponse>("GetScriptParameters", request);
        }

        public override Task<GetCombinedScriptResponse> GetCombinedScript(GetCombinedScriptRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetCombinedScriptRequest, GetCombinedScriptResponse>("GetCombinedScript", request);
        }

        public override Task<GetBulkMetadataResponse> GetBulkMetadata(GetBulkMetadataRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetBulkMetadataRequest, GetBulkMetadataResponse>("GetBulkMetadata", request);
        }

        public override Task<GetContextResponse> GetContext(GetContextRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetContextRequest, GetContextResponse>("GetContext", request);
        }

        public override Task<GetScriptManifestResponse> GetScriptManifest(GetScriptManifestRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetScriptManifestRequest, GetScriptManifestResponse>("GetScriptManifest", request);
        }

        public override Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ValidateWorkingSetRequest, ValidateWorkingSetResponse>("ValidateWorkingSet", request);
        }

        public override Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ComputeParameterOptionsRequest, ComputeParameterOptionsResponse>("ComputeParameterOptions", request);
        }

        public override Task<SelectElementsResponse> SelectElements(SelectElementsRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<SelectElementsRequest, SelectElementsResponse>("SelectElements", request);
        }

        public override Task<PickObjectResponse> PickObject(PickObjectRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<PickObjectRequest, PickObjectResponse>("PickObject", request);
        }

        public override Task<RenameScriptResponse> RenameScript(RenameScriptRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<RenameScriptRequest, RenameScriptResponse>("RenameScript", request);
        }

        public override Task<CreateWorkspaceResponse> CreateAndOpenWorkspace(CreateWorkspaceRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<CreateWorkspaceRequest, CreateWorkspaceResponse>("CreateAndOpenWorkspace", request);
        }

        public override Task<StopSyncSessionResponse> StopSyncSession(StopSyncSessionRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<StopSyncSessionRequest, StopSyncSessionResponse>("StopSyncSession", request);
        }

        public override Task<GetCategoryParametersResponse> GetCategoryParameters(GetCategoryParametersRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetCategoryParametersRequest, GetCategoryParametersResponse>("GetCategoryParameters", request);
        }

        public override Task<GetModelCategoriesResponse> GetModelCategories(GetModelCategoriesRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetModelCategoriesRequest, GetModelCategoriesResponse>("GetModelCategories", request);
        }

        public override Task<GetWatchdogStatusResponse> GetWatchdogStatus(GetWatchdogStatusRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetWatchdogStatusRequest, GetWatchdogStatusResponse>("GetWatchdogStatus", request);
        }

        public override Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<RegisterWatchdogSourceRequest, RegisterWatchdogSourceResponse>("RegisterWatchdogSource", request);
        }

        public override Task<UnregisterWatchdogSourceResponse> UnregisterWatchdogSource(UnregisterWatchdogSourceRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<UnregisterWatchdogSourceRequest, UnregisterWatchdogSourceResponse>("UnregisterWatchdogSource", request);
        }

        public override Task<UpdateElementParameterResponse> UpdateElementParameter(UpdateElementParameterRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<UpdateElementParameterRequest, UpdateElementParameterResponse>("UpdateElementParameter", request);
        }

        public override Task<BatchUpdateElementParametersResponse> BatchUpdateElementParameters(BatchUpdateElementParametersRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<BatchUpdateElementParametersRequest, BatchUpdateElementParametersResponse>("BatchUpdateElementParameters", request);
        }

        public override Task<ClearAssemblyCacheResponse> ClearAssemblyCache(ClearAssemblyCacheRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ClearAssemblyCacheRequest, ClearAssemblyCacheResponse>("ClearAssemblyCache", request);
        }

        public override Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ExecuteReplRequest, ExecuteReplResponse>("ExecuteRepl", request);
        }
    }
}
