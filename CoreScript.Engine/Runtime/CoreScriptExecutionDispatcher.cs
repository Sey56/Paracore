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
            FileLogger.Log("[CoreScriptExecutionDispatcher] Entering ExecuteCodeInRevit.");
            ExecutionResult result = ExecutionResult.Failure("Unknown error.");

            try
            {
                if (string.IsNullOrEmpty(_pendingScriptContent) || _pendingContext == null)
                {
                    var errorMessage = "No script content or context available to execute.";
                    LogErrorToFile(errorMessage);
                    FileLogger.Log("[CoreScriptExecutionDispatcher] No script content or context. Returning failure.");
                    result = ExecutionResult.Failure(errorMessage);
                }
                else
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing script via CodeRunner.");
                    result = _runner.Execute(_pendingScriptContent, _pendingParametersJson, _pendingContext); // Pass parametersJson

                    if (!result.IsSuccess)
                        LogErrorToFile(result.ErrorMessage ?? "Unknown error.");
                }
            }
            catch (Exception ex)
            {
                var error = $"Runtime error: {ex.Message}";
                LogErrorToFile(error);
                FileLogger.LogError($"[CoreScriptExecutionDispatcher] Exception in ExecuteCodeInRevit: {ex.Message}");
                FileLogger.LogError(ex.StackTrace);
                result = ExecutionResult.Failure(error, ex.StackTrace);
            }
            finally
            {
                _pendingScriptContent = string.Empty;
                _pendingParametersJson = string.Empty; // Clear parametersJson
                _pendingContext = null;

                OnExecutionComplete?.Invoke(result);
                FileLogger.Log("[CoreScriptExecutionDispatcher] Exiting ExecuteCodeInRevit.");
            }

            return result;
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