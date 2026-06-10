using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using System;
using System.Collections.Generic;
using System.IO;

namespace Paracore.Addin.Context
{
    public class StructuredOutputItem
    {
        public string Type { get; set; }
        public string Data { get; set; }
    }

    public class ServerContext : ICoreScriptContext
    {
        private readonly List<string> _printMessages = new();
        private readonly List<string> _errorMessages = new();
        private readonly List<StructuredOutputItem> _structuredOutputItems = new(); // New list

        public UIApplication UIApp { get; }
        public UIDocument UIDoc { get; }
        public Document Doc { get; }

        // 🎯 Expose log buffer for output
        public IReadOnlyList<string> PrintLog => _printMessages;
        public IReadOnlyList<string> ErrorLog => _errorMessages;
        public IReadOnlyList<StructuredOutputItem> StructuredOutputLog => _structuredOutputItems; // New property
        public List<int> PipelineDiagnostics { get; set; } = new();
        public bool IsReadOnly { get; }

        // ✅ Backing delegate for script printing
        public Action<string>? PrintCallback { get; private set; }

        private static string GetLogPath(string fileName)
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs");
            if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
            return Path.Combine(logDir, fileName);
        }

        public ServerContext(UIApplication uiApp, bool isReadOnly = false)
        {
            UIApp = uiApp;
            UIDoc = uiApp.ActiveUIDocument!;
            Doc = uiApp.ActiveUIDocument?.Document!;
            IsReadOnly = isReadOnly;
            PrintCallback = msg =>
            {
                // ✅ Drop debug trace to disk
                System.IO.File.AppendAllText(
                    GetLogPath("PrintCallbackDebug.txt"),
                    $"[DEBUG {DateTime.Now:HH:mm:ss}] {msg}\n"
                );
            };
        }


        public void Println(string message)
        {
            _printMessages.Add(message);
            System.IO.File.AppendAllText(
                GetLogPath("PrintCallbackDebug.txt"),
                $"[DEBUG {DateTime.Now:HH:mm:ss}] {message}\n"
            );
        }

        public void Print(string message)
        {
            if (_printMessages.Count > 0)
            {
                _printMessages[_printMessages.Count - 1] += message;
            }
            else
            {
                _printMessages.Add(message);
            }
            System.IO.File.AppendAllText(
                GetLogPath("PrintCallbackDebug.txt"),
                $"[DEBUG {DateTime.Now:HH:mm:ss}] {message}\n"
            );
        }

        public void LogError(string message)
        {
            _errorMessages.Add(message);
        }

        public void AddStructuredOutput(string type, string jsonData)
        {
            _structuredOutputItems.Add(new StructuredOutputItem { Type = type, Data = jsonData });
        }
    }
}
