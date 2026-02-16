using CoreScript;
using CoreScript.Engine.Logging;
using Grpc.Core;
using Paracore.Addin.Handlers;
using System.Threading.Tasks;

namespace Paracore.Addin.Services
{
    public class CoreScriptRunnerService : CoreScriptRunner.CoreScriptRunnerBase
    {
        private readonly ScriptExecutionHandler _executionHandler;
        private readonly MetadataHandler _metadataHandler;
        private readonly ContextHandler _contextHandler;
        private readonly FileSystemHandler _fileSystemHandler;

        public CoreScriptRunnerService(
            ScriptExecutionHandler executionHandler, 
            MetadataHandler metadataHandler, 
            ContextHandler contextHandler,
            FileSystemHandler fileSystemHandler)
        {
            _executionHandler = executionHandler;
            _metadataHandler = metadataHandler;
            _contextHandler = contextHandler;
            _fileSystemHandler = fileSystemHandler;
        }

        public override Task<BuildScriptResponse> BuildScript(BuildScriptRequest request, ServerCallContext context)
        {
            return _executionHandler.BuildScript(request);
        }

        public override Task<GetStatusResponse> GetStatus(GetStatusRequest request, ServerCallContext context)
        {
            return Task.FromResult(_contextHandler.GetStatus());
        }

        public override Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, ServerCallContext context)
        {
            return _executionHandler.ExecuteScript(request, context);
        }

        public override Task<GetScriptMetadataResponse> GetScriptMetadata(GetScriptMetadataRequest request, ServerCallContext context)
        {
            return Task.FromResult(_metadataHandler.GetScriptMetadata(request));
        }

        public override Task<GetScriptParametersResponse> GetScriptParameters(GetScriptParametersRequest request, ServerCallContext context)
        {
            return Task.FromResult(_metadataHandler.GetScriptParameters(request));
        }

        public override Task<GetCombinedScriptResponse> GetCombinedScript(GetCombinedScriptRequest request, ServerCallContext context)
        {
            return Task.FromResult(_metadataHandler.GetCombinedScript(request));
        }

        public override Task<GetBulkMetadataResponse> GetBulkMetadata(GetBulkMetadataRequest request, ServerCallContext context)
        {
            return Task.FromResult(_metadataHandler.GetBulkMetadata(request));
        }

        public override Task<GetContextResponse> GetContext(GetContextRequest request, ServerCallContext context)
        {
            return _contextHandler.GetContext();
        }

        public override Task<GetScriptManifestResponse> GetScriptManifest(GetScriptManifestRequest request, ServerCallContext context)
        {
            return Task.FromResult(_metadataHandler.GetScriptManifest(request));
        }

        public override Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request, ServerCallContext context)
        {
            return _contextHandler.ValidateWorkingSet(request);
        }

        public override Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request, ServerCallContext context)
        {
            return _contextHandler.ComputeParameterOptions(request);
        }

        public override Task<SelectElementsResponse> SelectElements(SelectElementsRequest request, ServerCallContext context)
        {
            return _contextHandler.SelectElements(request);
        }

        public override Task<PickObjectResponse> PickObject(PickObjectRequest request, ServerCallContext context)
        {
            return _contextHandler.PickObject(request);
        }

        public override Task<RenameScriptResponse> RenameScript(RenameScriptRequest request, ServerCallContext context)
        {
            return Task.FromResult(_fileSystemHandler.RenameScript(request));
        }

        public override Task<CreateWorkspaceResponse> CreateAndOpenWorkspace(CreateWorkspaceRequest request, ServerCallContext context)
        {
            return Task.FromResult(_fileSystemHandler.CreateAndOpenWorkspace(request));
        }

        public override Task<StopSyncSessionResponse> StopSyncSession(StopSyncSessionRequest request, ServerCallContext context)
        {
            return Task.FromResult(_fileSystemHandler.StopSyncSession(request));
        }

        public override Task<GetCategoryParametersResponse> GetCategoryParameters(GetCategoryParametersRequest request, ServerCallContext context)
        {
            return _contextHandler.GetCategoryParameters(request);
        }

        public override Task<GetModelCategoriesResponse> GetModelCategories(GetModelCategoriesRequest request, ServerCallContext context)
        {
            return _contextHandler.GetModelCategories(request);
        }

        public override Task<GetWatchdogStatusResponse> GetWatchdogStatus(GetWatchdogStatusRequest request, ServerCallContext context)
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
                    Timestamp = w.LatestReport.Timestamp.ToString("o")
                });
            }

            return Task.FromResult(response);
        }

        public override Task<RegisterWatchdogSourceResponse> RegisterWatchdogSource(RegisterWatchdogSourceRequest request, ServerCallContext context)
        {
            return _executionHandler.RegisterWatchdogSource(request);
        }

        public override Task<UnregisterWatchdogSourceResponse> UnregisterWatchdogSource(UnregisterWatchdogSourceRequest request, ServerCallContext context)
        {
            return _executionHandler.UnregisterWatchdogSource(request);
        }
    }
}
