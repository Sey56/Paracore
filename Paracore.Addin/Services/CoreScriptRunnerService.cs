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
    }
}
