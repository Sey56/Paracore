using CoreScript;
using Grpc.Net.Client;
using Paracore.Addin.Handlers;
using System;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using CoreScript.Engine.Logging;
using Grpc.Core;
using Google.Protobuf;

namespace Paracore.Addin.Services
{
    public class CoreScriptClient
    {
        private readonly InternalTaskRunner _runner;
        private readonly ILogger _logger;

        private CancellationTokenSource? _cts;
        private bool _connected;

        public CoreScriptClient(
            ScriptExecutionHandler executionHandler,
            MetadataHandler metadataHandler,
            ContextHandler contextHandler,
            FileSystemHandler fileSystemHandler,
            ReplHandler replHandler,
            ILogger logger)
        {
            _runner = new InternalTaskRunner(
                executionHandler,
                metadataHandler,
                contextHandler,
                fileSystemHandler,
                replHandler);
            _logger = logger;
        }

        public void Start()
        {
            if (_connected) return;

            _cts = new CancellationTokenSource();
            Task.Run(() => ConnectAndListenAsync(_cts.Token));
            _connected = true;
            _logger.Log("gRPC Client initiated connection to sidecar.", LogLevel.Debug);
        }

        public void Stop()
        {
            _cts?.Cancel();
            _connected = false;
            _logger.Log("gRPC Client connection terminated.", LogLevel.Debug);
        }

        private async Task ConnectAndListenAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    using var channel = GrpcChannel.ForAddress("http://localhost:50051");
                    var bridgeClient = new AddinBridge.AddinBridgeClient(channel);

                    using var call = bridgeClient.Subscribe(new SubscribeRequest { AddinVersion = "4.5.1" }, cancellationToken: token);

                    _logger.Log("Connected to Paracore Sidecar.", LogLevel.Info);

                    await foreach (var envelope in call.ResponseStream.ReadAllAsync(token))
                    {
                        // Offload task execution so we can keep listening
                        _ = HandleTaskAsync(bridgeClient, envelope, token);
                    }
                }
                catch (Exception ex)
                {
                    if (!token.IsCancellationRequested)
                    {
                        _logger.Log($"Sidecar connection error: {ex.Message}. Retrying in 5s...", LogLevel.Warning);
                        await Task.Delay(5000, token);
                    }
                }
            }
        }

        private static readonly JsonParser _parser = new JsonParser(JsonParser.Settings.Default);
        private static readonly JsonFormatter _formatter = new JsonFormatter(JsonFormatter.Settings.Default.WithFormatDefaultValues(true));

        private async Task HandleTaskAsync(AddinBridge.AddinBridgeClient bridge, TaskEnvelope envelope, CancellationToken token)
        {
            try
            {
                var payloadJson = envelope.PayloadJson.ToStringUtf8();
                TaskResult result = new TaskResult { TaskId = envelope.TaskId, IsSuccess = true };

                try
                {
                    switch (envelope.MethodName)
                    {
                        case "ExecuteScript":
                            var execReq = _parser.Parse<ExecuteScriptRequest>(payloadJson);
                            var execResp = await _runner.ExecuteScript(execReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(execResp));
                            break;

                        case "GetStatus":
                            // Note: We ignore empty request payload for GetStatus
                            var statusResp = _runner.GetStatus();
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(statusResp));
                            break;

                        case "GetContext":
                            var ctxResp = await _runner.GetContext();
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(ctxResp));
                            break;

                        case "GetScriptManifest":
                            var manifestReq = _parser.Parse<GetScriptManifestRequest>(payloadJson);
                            var manifestResp = _runner.GetScriptManifest(manifestReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(manifestResp));
                            break;
                        
                        case "GetScriptMetadata":
                            var metaReq = _parser.Parse<GetScriptMetadataRequest>(payloadJson);
                            var metaResp = _runner.GetScriptMetadata(metaReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(metaResp));
                            break;

                        case "GetScriptParameters":
                            var paramReq = _parser.Parse<GetScriptParametersRequest>(payloadJson);
                            var paramResp = _runner.GetScriptParameters(paramReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(paramResp));
                            break;

                        case "GetCombinedScript":
                            var combReq = _parser.Parse<GetCombinedScriptRequest>(payloadJson);
                            var combResp = _runner.GetCombinedScript(combReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(combResp));
                            break;

                        case "GetBulkMetadata":
                            var bulkReq = _parser.Parse<GetBulkMetadataRequest>(payloadJson);
                            var bulkResp = _runner.GetBulkMetadata(bulkReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(bulkResp));
                            break;

                        case "BuildScript":
                            var buildReq = _parser.Parse<BuildScriptRequest>(payloadJson);
                            var buildResp = await _runner.BuildScript(buildReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(buildResp));
                            break;

                        case "ValidateWorkingSet":
                            var valReq = _parser.Parse<ValidateWorkingSetRequest>(payloadJson);
                            var valResp = await _runner.ValidateWorkingSet(valReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(valResp));
                            break;

                        case "ComputeParameterOptions":
                            var compReq = _parser.Parse<ComputeParameterOptionsRequest>(payloadJson);
                            var compResp = await _runner.ComputeParameterOptions(compReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(compResp));
                            break;

                        case "SelectElements":
                            var selReq = _parser.Parse<SelectElementsRequest>(payloadJson);
                            var selResp = await _runner.SelectElements(selReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(selResp));
                            break;

                        case "PickObject":
                            var pickReq = _parser.Parse<PickObjectRequest>(payloadJson);
                            var pickResp = await _runner.PickObject(pickReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(pickResp));
                            break;

                        case "RenameScript":
                            var renReq = _parser.Parse<RenameScriptRequest>(payloadJson);
                            var renResp = _runner.RenameScript(renReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(renResp));
                            break;

                        case "CreateAndOpenWorkspace":
                            var cwReq = _parser.Parse<CreateWorkspaceRequest>(payloadJson);
                            var cwResp = _runner.CreateAndOpenWorkspace(cwReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(cwResp));
                            break;

                        case "StopSyncSession":
                            var stopReq = _parser.Parse<StopSyncSessionRequest>(payloadJson);
                            var stopResp = _runner.StopSyncSession(stopReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(stopResp));
                            break;

                        case "GetCategoryParameters":
                            var cpReq = _parser.Parse<GetCategoryParametersRequest>(payloadJson);
                            var cpResp = await _runner.GetCategoryParameters(cpReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(cpResp));
                            break;

                        case "GetModelCategories":
                            var mcReq = _parser.Parse<GetModelCategoriesRequest>(payloadJson);
                            var mcResp = await _runner.GetModelCategories(mcReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(mcResp));
                            break;

                        case "GetWatchdogStatus":
                            var wdResp = _runner.GetWatchdogStatus();
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(wdResp));
                            break;

                        case "RegisterWatchdogSource":
                            var rwReq = _parser.Parse<RegisterWatchdogSourceRequest>(payloadJson);
                            var rwResp = await _runner.RegisterWatchdogSource(rwReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(rwResp));
                            break;

                        case "UnregisterWatchdogSource":
                            var uwReq = _parser.Parse<UnregisterWatchdogSourceRequest>(payloadJson);
                            var uwResp = await _runner.UnregisterWatchdogSource(uwReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(uwResp));
                            break;

                        case "UpdateElementParameter":
                            var uepReq = _parser.Parse<UpdateElementParameterRequest>(payloadJson);
                            var uepResp = await _runner.UpdateElementParameter(uepReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(uepResp));
                            break;

                        case "BatchUpdateElementParameters":
                            var buepReq = _parser.Parse<BatchUpdateElementParametersRequest>(payloadJson);
                            var buepResp = await _runner.BatchUpdateElementParameters(buepReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(buepResp));
                            break;

                        case "ClearAssemblyCache":
                            var cacResp = _runner.ClearAssemblyCache();
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(cacResp));
                            break;

                        case "ExecuteRepl":
                            var replReq = _parser.Parse<ExecuteReplRequest>(payloadJson);
                            var replResp = await _runner.ExecuteRepl(replReq!);
                            result.ResultJson = Google.Protobuf.ByteString.CopyFromUtf8(_formatter.Format(replResp));
                            break;

                        default:
                            result.IsSuccess = false;
                            result.ErrorMessage = $"Method {envelope.MethodName} not implemented in Add-in proxy.";
                            break;
                    }
                }
                catch (Exception ex)
                {
                    result.IsSuccess = false;
                    result.ErrorMessage = ex.Message;
                }

                await bridge.SubmitResultAsync(result, cancellationToken: token);
            }
            catch (Exception ex)
            {
                _logger.Log($"Critical error handling task {envelope.TaskId}: {ex.Message}", LogLevel.Error);
            }
        }
    }
}
