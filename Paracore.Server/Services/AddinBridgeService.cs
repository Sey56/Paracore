using CoreScript;
using Grpc.Core;
using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using System.Text.Json;
using Google.Protobuf;

namespace Paracore.Server.Services
{
    public class AddinBridgeService : AddinBridge.AddinBridgeBase
    {
        private readonly ConcurrentDictionary<string, TaskCompletionSource<TaskResult>> _pendingTasks = new();
        private IServerStreamWriter<TaskEnvelope>? _addinStream;

        public override async Task Subscribe(SubscribeRequest request, IServerStreamWriter<TaskEnvelope> responseStream, ServerCallContext context)
        {
            _addinStream = responseStream;
            Console.WriteLine($"[Bridge] Revit Add-in (v{request.AddinVersion}) connected.");

            try
            {
                // Keep the stream open until the client disconnects
                while (!context.CancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(1000, context.CancellationToken);
                }
            }
            catch (TaskCanceledException)
            {
                // Normal disconnection
            }
            finally
            {
                _addinStream = null;
                Console.WriteLine("[Bridge] Revit Add-in disconnected.");
            }
        }

        public override Task<SubmitResultResponse> SubmitResult(TaskResult request, ServerCallContext context)
        {
            if (_pendingTasks.TryRemove(request.TaskId, out var tcs))
            {
                tcs.SetResult(request);
                return Task.FromResult(new SubmitResultResponse { Accepted = true });
            }

            return Task.FromResult(new SubmitResultResponse { Accepted = false });
        }

        private static readonly JsonFormatter _formatter = new JsonFormatter(JsonFormatter.Settings.Default.WithFormatDefaultValues(true));
        private static readonly JsonParser _parser = new JsonParser(JsonParser.Settings.Default);

        public async Task<TResponse> RelayTaskAsync<TRequest, TResponse>(string methodName, TRequest request)
            where TRequest : class 
            where TResponse : class, Google.Protobuf.IMessage, new()
        {
            if (_addinStream == null)
            {
                throw new RpcException(new Status(StatusCode.Unavailable, "Revit Add-in is not active or connected to the sidecar."));
            }

            var taskId = Guid.NewGuid().ToString();
            var tcs = new TaskCompletionSource<TaskResult>();
            _pendingTasks[taskId] = tcs;

            // USE PROTOBUF JSON FORMATTER for 100% protocol fidelity (fixes ByteString/bytes issues)
            var payloadJson = _formatter.Format(request as Google.Protobuf.IMessage);

            var envelope = new TaskEnvelope
            {
                TaskId = taskId,
                MethodName = methodName,
                PayloadJson = Google.Protobuf.ByteString.CopyFromUtf8(payloadJson)
            };

            await _addinStream.WriteAsync(envelope);

            // Wait for the result from the add-in
            var result = await tcs.Task;

            if (!result.IsSuccess)
            {
                throw new RpcException(new Status(StatusCode.Internal, result.ErrorMessage ?? "Unknown relay error."));
            }

            // USE PROTOBUF JSON PARSER
            var response = new TResponse();
            var responseJson = result.ResultJson.ToStringUtf8();
            
            // Note: Since result.ResultJson is also serialized by Protobuf on the Addin side, we must use Parse here.
            return _parser.Parse<TResponse>(responseJson);
        }
    }
}
