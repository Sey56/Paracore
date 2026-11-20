using CoreScript;
using CoreScript.Engine.Core;
using Grpc.Core;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Paracore.Server.Services
{
    public class CoreScriptProxyService : CoreScriptRunner.CoreScriptRunnerBase
    {
        private readonly AddinBridgeService _bridge;

        /// <summary>
        /// Roslyn intellisense is ALWAYS answered here, by the desktop-owned sidecar
        /// (user ruling 2026-11-20). It needs Revit DLLs on disk (PARACORE_REVIT_DIR)
        /// but not a running Revit, and an add-in round trip per keystroke is exactly
        /// the interference that made completions change when the ribbon was toggled.
        /// There is deliberately no environment switch to re-enable that relay.
        /// </summary>
        private static readonly bool RelayAll =
            string.Equals(
                Environment.GetEnvironmentVariable("PARACORE_LOCAL_MODE"),
                "relay", StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Gallery metadata, script parameters and compile answers are Roslyn work
        /// over source text. Answering them here keeps the gallery and the
        /// configurator usable with no Revit process. Set PARACORE_LOCAL_MODE=relay
        /// to restore the add-in path for A/B comparison.
        /// </summary>
        private static readonly bool LocalMetadata = !RelayAll;

        private const string RevitRequiredMessage =
            "Revit is not connected. Open Revit with the Paracore add-in to run scripts, execute the REPL, or use live-model commands.";

        private readonly ReplCatalogRouter _catalog;
        private readonly LocalMetadataService _metadata;

        public CoreScriptProxyService(
            AddinBridgeService bridge,
            LocalMetadataService metadata,
            ReplCatalogRouter catalog)
        {
            _bridge = bridge;
            _metadata = metadata;
            _catalog = catalog;
        }

        public override Task<BuildScriptResponse> BuildScript(BuildScriptRequest request, ServerCallContext context)
        {
            return LocalMetadata
                ? Task.FromResult(_metadata.BuildScript(request))
                : _bridge.RelayTaskAsync<BuildScriptRequest, BuildScriptResponse>("BuildScript", request);
        }

        public override Task<GetStatusResponse> GetStatus(GetStatusRequest request, ServerCallContext context)
        {
            // The desktop app gates its whole UI on `paracoreConnected`. That flag means
            // "the sidecar is reachable", NOT "Revit is running" — the two are separate in
            // the proto. Relaying this to Revit made the UI grey out whenever Revit was
            // closed, which is exactly the offline intellisense scenario. Answer it here.
            // When the add-in IS connected, relay so document/version details stay accurate.
            if (_bridge.IsAddinConnected)
                return _bridge.RelayTaskAsync<GetStatusRequest, GetStatusResponse>("GetStatus", request);

            return Task.FromResult(new GetStatusResponse
            {
                ParacoreConnected = true,
                RevitOpen = false,
                RevitVersion = string.Empty,
                DocumentOpen = false,
                DocumentTitle = string.Empty,
                DocumentType = "None",
                RevitInstallPath = Environment.GetEnvironmentVariable("PARACORE_REVIT_DIR") ?? string.Empty,
                AddinServerPath = string.Empty,
                IsPro = false,
                SessionConsent = "unsettled",
            });
        }

        public override Task<ExecuteScriptResponse> ExecuteScript(ExecuteScriptRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ExecuteScriptRequest, ExecuteScriptResponse>("ExecuteScript", request);
        }

        public override Task<GetScriptMetadataResponse> GetScriptMetadata(GetScriptMetadataRequest request, ServerCallContext context)
        {
            return LocalMetadata
                ? Task.FromResult(_metadata.GetScriptMetadata(request))
                : _bridge.RelayTaskAsync<GetScriptMetadataRequest, GetScriptMetadataResponse>("GetScriptMetadata", request);
        }

        public override Task<GetScriptParametersResponse> GetScriptParameters(GetScriptParametersRequest request, ServerCallContext context)
        {
            return LocalMetadata
                ? Task.FromResult(_metadata.GetScriptParameters(request))
                : _bridge.RelayTaskAsync<GetScriptParametersRequest, GetScriptParametersResponse>("GetScriptParameters", request);
        }

        public override Task<GetCombinedScriptResponse> GetCombinedScript(GetCombinedScriptRequest request, ServerCallContext context)
        {
            return LocalMetadata
                ? Task.FromResult(_metadata.GetCombinedScript(request))
                : _bridge.RelayTaskAsync<GetCombinedScriptRequest, GetCombinedScriptResponse>("GetCombinedScript", request);
        }

        public override Task<GetBulkMetadataResponse> GetBulkMetadata(GetBulkMetadataRequest request, ServerCallContext context)
        {
            return LocalMetadata
                ? Task.FromResult(_metadata.GetBulkMetadata(request))
                : _bridge.RelayTaskAsync<GetBulkMetadataRequest, GetBulkMetadataResponse>("GetBulkMetadata", request);
        }

        public override Task<GetContextResponse> GetContext(GetContextRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<GetContextRequest, GetContextResponse>("GetContext", request);
        }

        public override Task<GetScriptManifestResponse> GetScriptManifest(GetScriptManifestRequest request, ServerCallContext context)
        {
            // The add-in's own implementation returns the literal "[]" -- there is no
            // manifest to read. Answer it here rather than requiring Revit for nothing.
            return Task.FromResult(new GetScriptManifestResponse { ManifestJson = "[]" });
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
            // The add-in only echoes the path; Python does the actual scaffolding.
            return Task.FromResult(new CreateWorkspaceResponse
            {
                WorkspacePath = request.ScriptPath ?? string.Empty
            });
        }

        public override Task<StopSyncSessionResponse> StopSyncSession(StopSyncSessionRequest request, ServerCallContext context)
        {
            // The add-in's implementation is a no-op returning success.
            return Task.FromResult(new StopSyncSessionResponse { IsSuccess = true });
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
            // No in-memory cache exists in the offline sidecar: each compile is a
            // fresh Roslyn emit. Nothing to clear, so answer success locally.
            return Task.FromResult(new ClearAssemblyCacheResponse
            {
                IsSuccess = true,
                Message = "No offline assembly cache to clear."
            });
        }

        public override Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request, ServerCallContext context)
        {
            return _bridge.RelayTaskAsync<ExecuteReplRequest, ExecuteReplResponse>("ExecuteRepl", request);
        }

        public override async Task<GetReplCompletionsResponse> GetReplCompletions(
            GetReplCompletionsRequest request, ServerCallContext context)
        {            try
            {
                var answer = await ReplCompletionProvider.GetCompletionSetAsync(
                    request.Code, request.CaretOffset, _catalog,
                    context.CancellationToken).ConfigureAwait(false);

                var response = new GetReplCompletionsResponse
                {
                    IsSuccess = true,
                    RangeStart = answer.RangeStart,
                    RangeEnd = answer.RangeEnd,
                };
                foreach (var item in answer.Items)
                {
                    response.Items.Add(new ReplCompletionItem
                    {
                        Label = item.Label,
                        InsertText = item.InsertText,
                        Kind = item.Kind,
                        Detail = item.Detail ?? string.Empty,
                        SortText = item.SortText,
                    });
                }
                return response;
            }
            catch (Exception ex)
            {
                // Intellisense must degrade to "no suggestions", never break the editor.
                return new GetReplCompletionsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message,
                };
            }
        }

        public override async Task<GetReplDiagnosticsResponse> GetReplDiagnostics(
            GetReplDiagnosticsRequest request, ServerCallContext context)
        {            try
            {
                var diagnostics = await ReplCompletionProvider.GetDiagnosticsAsync(
                    request.Code, context.CancellationToken).ConfigureAwait(false);

                var response = new GetReplDiagnosticsResponse { IsSuccess = true };
                foreach (var d in diagnostics)
                {
                    response.Items.Add(new CoreScript.ReplDiagnostic
                    {
                        StartLine = d.StartLine,
                        StartColumn = d.StartColumn,
                        EndLine = d.EndLine,
                        EndColumn = d.EndColumn,
                        Message = d.Message,
                        Severity = d.Severity,
                    });
                }
                return response;
            }
            catch (Exception ex)
            {
                return new GetReplDiagnosticsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message,
                };
            }
        }

        public override async Task<GetReplHoverResponse> GetReplHover(
            GetReplHoverRequest request, ServerCallContext context)
        {            try
            {
                var info = await ReplCompletionProvider.GetHoverAsync(
                    request.Code, request.CaretOffset, context.CancellationToken).ConfigureAwait(false);
                var response = new GetReplHoverResponse { IsSuccess = true };
                if (info != null)
                {
                    response.Info = new ReplHoverInfo
                    {
                        Signature = info.Signature,
                        Documentation = info.Documentation ?? string.Empty,
                        Kind = info.Kind,
                        StartLine = info.StartLine,
                        StartColumn = info.StartColumn,
                        EndLine = info.EndLine,
                        EndColumn = info.EndColumn,
                    };
                }
                return response;
            }
            catch (Exception ex)
            {
                return new GetReplHoverResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message,
                };
            }
        }
    }
}
