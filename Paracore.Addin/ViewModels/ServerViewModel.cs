using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using System;
using System.ComponentModel;

namespace Paracore.Addin.ViewModels
{
    public class ServerViewModel : INotifyPropertyChanged
    {
        private static ServerViewModel? _instance;
        public static ServerViewModel Instance => _instance ??= new ServerViewModel();

        private bool _isServerRunning;
        public bool IsServerRunning
        {
            get => _isServerRunning;
            set
            {
                _isServerRunning = value;
                OnPropertyChanged(nameof(IsServerRunning));
            }
        }

        public bool IsInitialized => CoreScriptExecutionDispatcher.Instance.IsInitialized;

        private bool _isInitialized = false;

        private ServerViewModel() { }

        public void Initialize(Autodesk.Revit.UI.ExternalEvent codeExecutionEvent)
        {
            if (_isInitialized) return;
            _isInitialized = true;
            CoreScriptExecutionDispatcher.Instance.Initialize(codeExecutionEvent);
            CoreScriptExecutionDispatcher.Instance.OnExecutionComplete += result =>
            {
                OnExecutionComplete?.Invoke(result);
            };
        }

        public Guid DispatchScript(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            return CoreScriptExecutionDispatcher.Instance.QueueScriptFromServer(scriptContent, parametersJson, context);
        }

        public Guid DispatchBinaryScript(byte[] compiledAssembly, string parametersJson, ICoreScriptContext context)
        {
            return CoreScriptExecutionDispatcher.Instance.QueueBinaryScriptFromServer(compiledAssembly, parametersJson, context);
        }

        public ExecutionResult ExecuteCodeInRevit(ICoreScriptContext? context)
        {
            return CoreScriptExecutionDispatcher.Instance.ExecuteCodeInRevit(context);
        }

        public byte[] BuildScript(string scriptContent)
        {
            return CoreScriptExecutionDispatcher.Instance.BuildScript(scriptContent);
        }

        public void ClearAssemblyCache()
        {
            CoreScriptExecutionDispatcher.Instance.ClearCache();
        }

        // Used by ScriptExecutionHandler to track execution source
        public string LastClientSource { get; set; } = string.Empty;
        public string LastExecutedScriptName { get; set; } = string.Empty;
        public event Action<ExecutionResult> OnExecutionComplete = delegate { };

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
