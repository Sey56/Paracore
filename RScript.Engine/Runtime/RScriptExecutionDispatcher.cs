using Autodesk.Revit.UI;
using RScript.Engine.Context;
using RScript.Engine.Core;
using RScript.Engine.Logging;

namespace RScript.Engine.Runtime
{
    public class RScriptExecutionDispatcher
    {
        private readonly ICodeRunner _runner;
        private ExternalEvent _codeExecutionEvent;
                private string _pendingScriptContent = string.Empty;
        private string _pendingParametersJson = string.Empty; // New field
        private IRScriptContext? _pendingContext;

        public static RScriptExecutionDispatcher Instance => _instance ??= new RScriptExecutionDispatcher(new CodeRunner());
        private static RScriptExecutionDispatcher _instance;

        public event Action<ExecutionResult>? OnExecutionComplete;
        public bool IsInitialized => _codeExecutionEvent != null;

        private RScriptExecutionDispatcher(ICodeRunner runner)
        {
            _runner = runner;
        }

        public void Initialize(ExternalEvent codeExecutionEvent)
        {
            _codeExecutionEvent = codeExecutionEvent;
        }

        public ExecutionResult ExecuteSingleScript(string scriptText, IRScriptContext context)
        {
            return _runner.Execute(scriptText, "", context);
        }

        public ExecutionResult QueueScriptFromServer(string scriptContent, string parametersJson, IRScriptContext context)
        {
            FileLogger.Log("[RScriptExecutionDispatcher] Entering QueueScriptFromServer.");
            _pendingScriptContent = scriptContent;
            _pendingParametersJson = parametersJson; // Store parametersJson
            _pendingContext = context;

            FileLogger.Log($"[RScriptExecutionDispatcher] Script content length: {scriptContent.Length}");
            FileLogger.Log($"[RScriptExecutionDispatcher] Parameters JSON length: {parametersJson.Length}");

            if (_codeExecutionEvent == null)
            {
                var errorMessage = "External event is not initialized.";
                LogErrorToFile(errorMessage);
                FileLogger.Log("[RScriptExecutionDispatcher] External event not initialized. Returning failure.");
                return ExecutionResult.Failure(errorMessage);
            }

            _codeExecutionEvent.Raise();
            FileLogger.Log("[RScriptExecutionDispatcher] External event raised. Returning success.");
            return ExecutionResult.Success("Script queued for execution.");
        }

        public ExecutionResult ExecuteCodeInRevit(IRScriptContext context)
        {
            FileLogger.Log("[RScriptExecutionDispatcher] Entering ExecuteCodeInRevit.");
            ExecutionResult result = ExecutionResult.Failure("Unknown error.");

            try
            {
                if (string.IsNullOrEmpty(_pendingScriptContent) || _pendingContext == null)
                {
                    var errorMessage = "No script content or context available to execute.";
                    LogErrorToFile(errorMessage);
                    FileLogger.Log("[RScriptExecutionDispatcher] No script content or context. Returning failure.");
                    result = ExecutionResult.Failure(errorMessage);
                }
                else
                {
                    FileLogger.Log("[RScriptExecutionDispatcher] Executing script via CodeRunner.");
                    result = _runner.Execute(_pendingScriptContent, _pendingParametersJson, _pendingContext); // Pass parametersJson

                    if (!result.IsSuccess)
                        LogErrorToFile(result.ErrorMessage ?? "Unknown error.");
                }
            }
            catch (Exception ex)
            {
                var error = $"Runtime error: {ex.Message}";
                LogErrorToFile(error);
                FileLogger.LogError($"[RScriptExecutionDispatcher] Exception in ExecuteCodeInRevit: {ex.Message}");
                FileLogger.LogError(ex.StackTrace);
                result = ExecutionResult.Failure(error, ex.StackTrace);
            }
            finally
            {
                _pendingScriptContent = string.Empty;
                _pendingParametersJson = string.Empty; // Clear parametersJson
                _pendingContext = null;

                OnExecutionComplete?.Invoke(result);
                FileLogger.Log("[RScriptExecutionDispatcher] Exiting ExecuteCodeInRevit.");
            }

            return result;
        }

        private static void LogErrorToFile(string errorMessage)
        {
            var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "RScriptError.txt");
            try
            {
                File.WriteAllText(logPath, $"{DateTime.Now}: {errorMessage}\n");
            }
            catch {{ /* Silent fail */ }}
        }
    }

}