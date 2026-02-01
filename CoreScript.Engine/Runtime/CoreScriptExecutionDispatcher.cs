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
        private string _pendingParametersJson = string.Empty; 
        private byte[]? _pendingCompiledAssembly; // New field for proprietary tools
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
            _pendingParametersJson = parametersJson;
            _pendingCompiledAssembly = null; 
            _pendingContext = context;

            if (_codeExecutionEvent == null) return ExecutionResult.Failure("External event is not initialized.");

            _codeExecutionEvent.Raise();
            return ExecutionResult.Success("Script queued for execution.");
        }

        public ExecutionResult QueueBinaryScriptFromServer(byte[] compiledAssembly, string parametersJson, ICoreScriptContext context)
        {
            FileLogger.Log("[CoreScriptExecutionDispatcher] Entering QueueBinaryScriptFromServer.");
            _pendingScriptContent = string.Empty;
            _pendingParametersJson = parametersJson;
            _pendingCompiledAssembly = compiledAssembly;
            _pendingContext = context;

            if (_codeExecutionEvent == null) return ExecutionResult.Failure("External event is not initialized.");

            _codeExecutionEvent.Raise();
            return ExecutionResult.Success("Binary tool queued for execution.");
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
                if (_pendingContext == null)
                {
                    var errorMessage = "No context available to execute.";
                    LogErrorToFile(errorMessage);
                    scriptResult = ExecutionResult.Failure(errorMessage);
                }
                else if (_pendingCompiledAssembly != null)
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing BINARY tool via CodeRunner.");
                    scriptResult = _runner.ExecuteBinary(_pendingCompiledAssembly, _pendingParametersJson, _pendingContext);
                }
                else if (!string.IsNullOrEmpty(_pendingScriptContent))
                {
                    FileLogger.Log("[CoreScriptExecutionDispatcher] Executing SOURCE script via CodeRunner.");
                    scriptResult = _runner.Execute(_pendingScriptContent, _pendingParametersJson, _pendingContext);
                }
                else
                {
                    scriptResult = ExecutionResult.Failure("No script content or binary assembly provided.");
                }

                if (!scriptResult.IsSuccess)
                    LogErrorToFile(scriptResult.ErrorMessage ?? "Unknown error.");
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
                
                if (_pendingContext != null)
                {
                    if (isConflict)
                    {
                        _pendingContext.Println("💡 Tip: This usually happens when pyRevit is installed. We are working on a fix, but for now, you can check 'CoreScriptError.txt' or 'CodeRunnerDebug.txt' in %AppData%\\Roaming\\paracore-data\\logs for details.");
                    }
                    else
                    {
                        _pendingContext.Println($"[STACK TRACE]\n{ex}");
                    }
                }
                scriptResult = ExecutionResult.Failure(error, ex.StackTrace);
            }
            finally
            {
                _pendingScriptContent = string.Empty;
                _pendingParametersJson = string.Empty;
                _pendingCompiledAssembly = null;
                _pendingContext = null;

                OnExecutionComplete?.Invoke(scriptResult);
                FileLogger.Log("[CoreScriptExecutionDispatcher] Exiting ExecuteCodeInRevit for script.");
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
