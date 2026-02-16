using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace CoreScript.Engine.Runtime
{
    public enum ExecutionPriority
    {
        High = 0,    // Manual User Scripts (Highest)
        Normal = 1,  // Startup Registrations
        Low = 2      // Periodic Watchdog Runs
    }

    public class ExecutionRequest
    {
        public Guid ExecutionId { get; set; } = Guid.NewGuid();
        public string ScriptContent { get; set; } = string.Empty;
        public string ParametersJson { get; set; } = string.Empty;
        public byte[]? CompiledAssembly { get; set; }
        public ICoreScriptContext? Context { get; set; }
        public bool IsSilent { get; set; }
        public ExecutionPriority Priority { get; set; } = ExecutionPriority.Normal;
    }

    public class CoreScriptExecutionDispatcher
    {
        private readonly ICodeRunner _runner;
        private ExternalEvent _codeExecutionEvent;
        private readonly PriorityQueue<ExecutionRequest, int> _executionQueue = new();
        private readonly object _queueLock = new object();

        private Func<object>? _pendingUIFunc;
        private TaskCompletionSource<object>? _uiTaskCompletionSource;

        public static CoreScriptExecutionDispatcher Instance => _instance ??= new CoreScriptExecutionDispatcher(new CodeRunner());
        private static CoreScriptExecutionDispatcher _instance;

        public event Action<ExecutionResult>? OnExecutionComplete;
        public bool IsInitialized => _codeExecutionEvent != null;

        private CoreScriptExecutionDispatcher(ICodeRunner runner)
        {
            _runner = runner;
        }

        public void Initialize(ExternalEvent codeExecutionEvent)
        {
            _codeExecutionEvent = codeExecutionEvent;
        }

        public Task<T> ExecuteInUIContext<T>(Func<T> func)
        {
            if (_codeExecutionEvent == null)
            {
                throw new InvalidOperationException("CoreScriptExecutionDispatcher is not initialized.");
            }

            _pendingUIFunc = () => func()!;
            _uiTaskCompletionSource = new TaskCompletionSource<object>();

            _codeExecutionEvent.Raise();

            return _uiTaskCompletionSource.Task.ContinueWith(t => (T)t.Result);
        }

        public ExecutionResult ExecuteSingleScript(string scriptText, ICoreScriptContext context)
        {
            return _runner.Execute(scriptText, "", context);
        }

        public Guid QueueScriptFromServer(string scriptContent, string parametersJson, ICoreScriptContext context, bool isSilent = false, ExecutionPriority priority = ExecutionPriority.High)
        {
            FileLogger.Log($"[CoreScriptExecutionDispatcher] Queueing script (Priority: {priority}, Silent: {isSilent}).");
            
            var request = new ExecutionRequest
            {
                ScriptContent = scriptContent,
                ParametersJson = parametersJson,
                Context = context,
                IsSilent = isSilent,
                Priority = priority
            };

            lock (_queueLock)
            {
                _executionQueue.Enqueue(request, (int)request.Priority);
            }

            if (_codeExecutionEvent != null) _codeExecutionEvent.Raise();
            return request.ExecutionId;
        }

        public Guid QueueBinaryScriptFromServer(byte[] compiledAssembly, string parametersJson, ICoreScriptContext context, bool isSilent = false, ExecutionPriority priority = ExecutionPriority.High)
        {
            FileLogger.Log($"[CoreScriptExecutionDispatcher] Queueing BINARY tool (Priority: {priority}, Silent: {isSilent}).");
            
            var request = new ExecutionRequest
            {
                CompiledAssembly = compiledAssembly,
                ParametersJson = parametersJson,
                Context = context,
                IsSilent = isSilent,
                Priority = priority
            };

            lock (_queueLock)
            {
                _executionQueue.Enqueue(request, (int)request.Priority);
            }

            if (_codeExecutionEvent != null) _codeExecutionEvent.Raise();
            return request.ExecutionId;
        }

        public ExecutionResult ExecuteCodeInRevit(ICoreScriptContext context)
        {
            if (_pendingUIFunc != null)
            {
                try
                {
                    var result = _pendingUIFunc();
                    _uiTaskCompletionSource?.SetResult(result);
                }
                catch (Exception ex)
                {
                    _uiTaskCompletionSource?.SetException(ex);
                }
                finally
                {
                    _pendingUIFunc = null;
                }
                return ExecutionResult.Success("UI function executed.");
            }

            ExecutionRequest? request = null;
            lock (_queueLock)
            {
                if (_executionQueue.Count > 0)
                {
                    request = _executionQueue.Dequeue();
                }
            }

            if (request == null)
            {
                return ExecutionResult.Success("No pending scripts in queue.");
            }

            FileLogger.Log($"[CoreScriptExecutionDispatcher] Processing request (Priority: {request.Priority}, Silent: {request.IsSilent}).");
            ExecutionResult scriptResult = ExecutionResult.Failure("Unknown error.");

            try
            {
                if (request.Context == null)
                {
                    var errorMessage = "No context available to execute.";
                    LogErrorToFile(errorMessage);
                    scriptResult = ExecutionResult.Failure(errorMessage);
                }
                else if (request.CompiledAssembly != null)
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing BINARY tool via CodeRunner.");
                    scriptResult = _runner.ExecuteBinary(request.CompiledAssembly, request.ParametersJson, request.Context);
                }
                else if (!string.IsNullOrEmpty(request.ScriptContent))
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing SOURCE script via CodeRunner.");
                    scriptResult = _runner.Execute(request.ScriptContent, request.ParametersJson, request.Context);
                }
                else
                {
                    scriptResult = ExecutionResult.Failure("No script content or binary assembly provided.");
                }

                if (!scriptResult.IsSuccess)
                    LogErrorToFile(scriptResult.ErrorMessage ?? "Unknown error.");
                
                scriptResult.ExecutionId = request.ExecutionId;
            }
            catch (Exception ex)
            {
                string msg = ex.Message ?? "";
                bool isConflict = msg.Contains("Microsoft.CodeAnalysis") || msg.Contains("Roslyn") || ex is FileLoadException;
                
                var error = isConflict 
                    ? "⚠️ Add-in Conflict: Paracore is unable to start its scripting engine because another Revit Add-in (like pyRevit) has locked a required library."
                    : $"Dispatcher error: {ex.Message}";

                LogErrorToFile($"{error} | Details: {ex.Message}");
                FileLogger.LogError($"[CoreScriptExecutionDispatcher] Exception: {ex.Message}");
                
                if (request.Context != null)
                {
                    if (isConflict)
                    {
                        request.Context.Println("💡 Tip: This usually happens when pyRevit is installed. We are working on a fix, but for now, you can check 'CoreScriptError.txt' or 'CodeRunnerDebug.txt' in %AppData%\\Roaming\\paracore-data\\logs for details.");
                    }
                    else
                    {
                        request.Context.Println($"[STACK TRACE]\n{ex}");
                    }
                }
                scriptResult = ExecutionResult.Failure(error, ex.StackTrace);
                scriptResult.ExecutionId = request?.ExecutionId ?? Guid.Empty;
            }
            finally
            {
                // Attach the silent flag to the result so the UI knows whether to record it
                if (request != null) scriptResult.IsSilent = request.IsSilent;

                OnExecutionComplete?.Invoke(scriptResult);
                
                // If there are more items in the queue, raise the event again
                lock (_queueLock)
                {
                    if (_executionQueue.Count > 0 && _codeExecutionEvent != null)
                    {
                        _codeExecutionEvent.Raise();
                    }
                }
            }

            return scriptResult;
        }

        public byte[] BuildScript(string scriptContent)
        {
            return _runner.CompileToBytes(scriptContent);
        }

        private static void LogErrorToFile(string errorMessage)
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs");
            try
            {
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                var logPath = Path.Combine(logDir, "CoreScriptError.txt");
                File.AppendAllText(logPath, $"{DateTime.Now}: {errorMessage}\n");
            }
            catch { /* Silent fail */ }
        }
    }

}
