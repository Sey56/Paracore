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

        /// <summary>
        /// True while a Revit add-in holds the task stream open. Read-only status calls
        /// use this to answer locally when Revit is closed instead of failing the UI.
        /// </summary>
        public bool IsAddinConnected => _addinStream != null;

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
                // Fail all pending tasks so nothing waits forever
                foreach (var kvp in _pendingTasks)
                {
                    kvp.Value.TrySetException(new RpcException(new Status(StatusCode.Unavailable, "Revit Add-in disconnected.")));
                }
                _pendingTasks.Clear();
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
                // A Revit-bound call with no add-in is EXPECTED in offline mode.
                // Say what the user must do; "sidecar" here would be misleading,
                // because the sidecar answering this call is running fine.
                throw new RpcException(new Status(StatusCode.Unavailable,
                    "Revit is not connected. Open Revit with the Paracore add-in to run scripts, execute the REPL, or use live-model commands."));
            }

            var taskId = Guid.NewGuid().ToString();
            var tcs = new TaskCompletionSource<TaskResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingTasks[taskId] = tcs;

            TaskResult result;
            try
            {
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
                result = await tcs.Task;
            }
            finally
            {
                _pendingTasks.TryRemove(taskId, out _);
            }

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
