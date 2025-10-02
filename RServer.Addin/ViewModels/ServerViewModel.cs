using Autodesk.Revit.UI;
using RScript.Engine.Context;
using RScript.Engine.Core;
using RScript.Engine.Runtime;
using RServer.Addin.Context;
using RScript.Engine.Logging; // Added for logging
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Text.Json; // Added for JSON parsing
using System.Linq; // Added for LINQ

namespace RServer.Addin.ViewModels
{
    public class ServerViewModel : INotifyPropertyChanged
    {
        private static ServerViewModel? _instance;
        public static ServerViewModel Instance => _instance ??= new ServerViewModel();

        private string _connectedApp = "None";
        public string ConnectedApp
        {
            get => _connectedApp;
            set
            {
                _connectedApp = value;
                OnPropertyChanged(nameof(ConnectedApp));
            }
        }

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

        public ObservableCollection<ExecutionRecord> ExecutionHistory { get; } = new ObservableCollection<ExecutionRecord>();

        private int _totalExecutions;
        public int TotalExecutions
        {
            get => _totalExecutions;
            set
            {
                _totalExecutions = value;
                OnPropertyChanged(nameof(TotalExecutions));
            }
        }

        private int _activeClients;
        public int ActiveClients
        {
            get => _activeClients;
            set
            {
                _activeClients = value;
                OnPropertyChanged(nameof(ActiveClients));
            }
        }

        private string _lastExecutionStatus = "N/A";
        public string LastExecutionStatus
        {
            get => _lastExecutionStatus;
            set
            {
                _lastExecutionStatus = value;
                OnPropertyChanged(nameof(LastExecutionStatus));
            }
        }

        public string LastClientSource { get; set; } = string.Empty;
        public string LastExecutedScriptName { get; set; } = string.Empty;

        public event Action<ExecutionResult> OnExecutionComplete = delegate { };
        public bool IsInitialized => RScriptExecutionDispatcher.Instance.IsInitialized;

        private string _filterText = string.Empty;
        public string FilterText
        {
            get => _filterText;
            set
            {
                _filterText = value;
                OnPropertyChanged(nameof(FilterText));
            }
        }

        private readonly System.Diagnostics.Stopwatch _stopwatch = new System.Diagnostics.Stopwatch();
        private bool _isInitialized = false;

        private ServerViewModel() { }

        public void Initialize(ExternalEvent codeExecutionEvent)
        {
            if (_isInitialized) return;
            _isInitialized = true;

            RScriptExecutionDispatcher.Instance.Initialize(codeExecutionEvent);
            RScriptExecutionDispatcher.Instance.OnExecutionComplete += result =>
            {
                _stopwatch.Stop();
                var elapsedMs = _stopwatch.ElapsedMilliseconds;
                var durationString = $"{elapsedMs} ms";

                OnExecutionComplete?.Invoke(result);
                FileLogger.Log($"[ServerViewModel] OnExecutionComplete fired. ScriptName: {result.ScriptName}, IsSuccess: {result.IsSuccess}");

                // --- Removed: Custom ScriptName extraction ---

                // Ensure ObservableCollection modification happens on the WPF UI thread
                System.Windows.Application.Current.Dispatcher.Invoke(() =>
                {
                    ExecutionHistory.Insert(0, new ExecutionRecord
                    {
                        ScriptName = LastExecutedScriptName, // Use the extracted script name from service
                        Status = result.IsSuccess ? "Success" : "Error",
                        Duration = durationString,
                        Timestamp = result.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                        Source = LastClientSource.ToString() // Use the stored source
                    });
                    FileLogger.Log($"[ServerViewModel] Added record to ExecutionHistory. Current count: {ExecutionHistory.Count}");
                });

                TotalExecutions++;
                LastExecutionStatus = result.IsSuccess ? "Success" : "Error";
                // ActiveClients is not directly tracked here, assuming 1 for now per execution
                ActiveClients = 1; // This needs a more robust solution for actual active clients
                FileLogger.Log($"[ServerViewModel] TotalExecutions: {TotalExecutions}, LastExecutionStatus: {LastExecutionStatus}");

                
            };
        }

        public ExecutionResult DispatchScript(string scriptContent, string parametersJson, IRScriptContext context)
        {
            _stopwatch.Restart();
            return RScriptExecutionDispatcher.Instance.QueueScriptFromServer(scriptContent, parametersJson, context);
        }

        public ExecutionResult ExecuteCodeInRevit(IRScriptContext? context)
        {
            return RScriptExecutionDispatcher.Instance.ExecuteCodeInRevit(context);
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class ExecutionRecord
    {
        public string ScriptName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Duration { get; set; } = string.Empty;
        public string Timestamp { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
    }
}