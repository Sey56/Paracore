using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RScript.Engine.Context;
using System;
using System.Collections.Generic;
using System.IO;

namespace RServer.Addin.Context
{
    public class StructuredOutputItem
    {
        public string Type { get; set; }
        public string Data { get; set; }
    }

    public class ServerContext : IRScriptContext
    {
        private readonly List<string> _printMessages = new();
        private readonly List<string> _errorMessages = new();
        private readonly List<StructuredOutputItem> _structuredOutputItems = new(); // New list

        public UIApplication UIApp { get; }
        public UIDocument? UIDoc => UIApp.ActiveUIDocument;
        public Document? Doc => UIApp.ActiveUIDocument?.Document;

        // 🎯 Expose log buffer for output
        public IReadOnlyList<string> PrintLog => _printMessages;
        public IReadOnlyList<string> ErrorLog => _errorMessages;
        public IReadOnlyList<StructuredOutputItem> StructuredOutputLog => _structuredOutputItems; // New property

        // ✅ Backing delegate for script printing
        public Action<string>? PrintCallback { get; private set; }

        public ServerContext(UIApplication uiApp)
        {
            UIApp = uiApp;
            PrintCallback = msg =>
            {
                // ✅ Store formatted print entry
                _printMessages.Add(msg);

                // ✅ Drop debug trace to disk
                System.IO.File.AppendAllText(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "PrintCallbackDebug.txt"),
                    $"[DEBUG {DateTime.Now:HH:mm:ss}] {msg}\n"
                );
            };
        }

        public void Print(string message) => PrintCallback?.Invoke(message);

        public void PrintWithTimeStamp(string message)
        {
            _printMessages.Add(message);
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