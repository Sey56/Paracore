using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using Paracore.Addin.Context;
using CoreScript.Engine.Logging; // Added for logging
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Text.Json; // Added for JSON parsing
using System.Linq; // Added for LINQ
using System.Windows.Input; // Added for ICommand
using Paracore.Addin.Helpers; // Added for RelayCommand

namespace Paracore.Addin.ViewModels
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

        private ICommand? _clearHistoryCommand;
        public ICommand ClearHistoryCommand => _clearHistoryCommand ??= new RelayCommand(_ => ClearHistory());

        public event Action<ExecutionResult> OnExecutionComplete = delegate { };
        public bool IsInitialized => CoreScriptExecutionDispatcher.Instance.IsInitialized;

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

            CoreScriptExecutionDispatcher.Instance.Initialize(codeExecutionEvent);
            CoreScriptExecutionDispatcher.Instance.OnExecutionComplete += result =>
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
                        Source = MapSourceForDisplay(LastClientSource) // Map the source for display
                    });
                    FileLogger.Log($"[ServerViewModel] Added record to ExecutionHistory. Current count: {ExecutionHistory.Count}");
                });

                TotalExecutions++;
                LastExecutionStatus = result.IsSuccess ? "Success" : "Error";
                FileLogger.Log($"[ServerViewModel] TotalExecutions: {TotalExecutions}, LastExecutionStatus: {LastExecutionStatus}");

                
            };
        }

        public ExecutionResult DispatchScript(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            _stopwatch.Restart();
            return CoreScriptExecutionDispatcher.Instance.QueueScriptFromServer(scriptContent, parametersJson, context);
        }

        public ExecutionResult DispatchBinaryScript(byte[] compiledAssembly, string parametersJson, ICoreScriptContext context)
        {
            _stopwatch.Restart();
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

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private void ClearHistory()
        {
            FileLogger.Log("[ServerViewModel] ClearHistory command executed.");
            ExecutionHistory.Clear();
        }

        private string MapSourceForDisplay(string source)
        {
            return source.ToUpperInvariant() switch
            {
                "RAP-WEB" => "Paracore",
                "VSCODE" => "VSCode",
                _ => source
            };
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
