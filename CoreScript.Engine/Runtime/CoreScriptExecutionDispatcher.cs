using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Runtime
{
    public class CoreScriptExecutionDispatcher
    {
        private readonly ICodeRunner _runner;
        private ExternalEvent _codeExecutionEvent;
                private string _pendingScriptContent = string.Empty;
        private string _pendingParametersJson = string.Empty; // New field
        private ICoreScriptContext? _pendingContext;
        private Func<object> _pendingUIFunc;
        private TaskCompletionSource<object> _uiTaskCompletionSource;

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

            _pendingUIFunc = () => func();
            _uiTaskCompletionSource = new TaskCompletionSource<object>();

            _codeExecutionEvent.Raise();

            return _uiTaskCompletionSource.Task.ContinueWith(t => (T)t.Result);
        }

        public ExecutionResult ExecuteSingleScript(string scriptText, ICoreScriptContext context)
        {
            return _runner.Execute(scriptText, "", context);
        }

        public ExecutionResult QueueScriptFromServer(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            FileLogger.Log("[CoreScriptExecutionDispatcher] Entering QueueScriptFromServer.");
            _pendingScriptContent = scriptContent;
            _pendingParametersJson = parametersJson; // Store parametersJson
            _pendingContext = context;

            FileLogger.Log($"[CoreScriptExecutionDispatcher] Script content length: {scriptContent.Length}");
            FileLogger.Log($"[CoreScriptExecutionDispatcher] Parameters JSON length: {parametersJson.Length}");

            if (_codeExecutionEvent == null)
            {
                var errorMessage = "External event is not initialized.";
                LogErrorToFile(errorMessage);
                FileLogger.Log("[CoreScriptExecutionDispatcher] External event not initialized. Returning failure.");
                return ExecutionResult.Failure(errorMessage);
            }

            _codeExecutionEvent.Raise();
            FileLogger.Log("[CoreScriptExecutionDispatcher] External event raised. Returning success.");
            return ExecutionResult.Success("Script queued for execution.");
        }

        public ExecutionResult ExecuteCodeInRevit(ICoreScriptContext context)
        {
             if (_pendingUIFunc != null)
            {
                try
                {
                    var result = _pendingUIFunc();
                    _uiTaskCompletionSource.SetResult(result);
                }
                catch (Exception ex)
                {
                    _uiTaskCompletionSource.SetException(ex);
                }
                finally
                {
                    _pendingUIFunc = null;
                }
                return ExecutionResult.Success("UI function executed.");
            }

            FileLogger.Log("[CoreScriptExecutionDispatcher] Entering ExecuteCodeInRevit for script.");
            ExecutionResult scriptResult = ExecutionResult.Failure("Unknown error.");

            try
            {
                if (string.IsNullOrEmpty(_pendingScriptContent) || _pendingContext == null)
                {
                    var errorMessage = "No script content or context available to execute.";
                    LogErrorToFile(errorMessage);
                    FileLogger.Log("[CoreScriptExecutionDispatcher] No script content or context. Returning failure.");
                    scriptResult = ExecutionResult.Failure(errorMessage);
                }
                else
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing script via CodeRunner.");
                    scriptResult = _runner.Execute(_pendingScriptContent, _pendingParametersJson, _pendingContext);

                    if (!scriptResult.IsSuccess)
                        LogErrorToFile(scriptResult.ErrorMessage ?? "Unknown error.");
                }
            }
            catch (Exception ex)
            {
                var error = $"Runtime error: {ex.Message}";
                LogErrorToFile(error);
                FileLogger.LogError($"[CoreScriptExecutionDispatcher] Exception in ExecuteCodeInRevit: {ex.Message}");
                FileLogger.LogError(ex.StackTrace);
                scriptResult = ExecutionResult.Failure(error, ex.StackTrace);
            }
            finally
            {
                _pendingScriptContent = string.Empty;
                _pendingParametersJson = string.Empty;
                _pendingContext = null;

                OnExecutionComplete?.Invoke(scriptResult);
                FileLogger.Log("[CoreScriptExecutionDispatcher] Exiting ExecuteCodeInRevit for script.");
            }

            return scriptResult;
        }

        private static void LogErrorToFile(string errorMessage)
        {
            var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "CoreScriptError.txt");
            try
            {
                File.WriteAllText(logPath, $"{DateTime.Now}: {errorMessage}\n");
            }
            catch {{ /* Silent fail */ }}
        }
    }

}
