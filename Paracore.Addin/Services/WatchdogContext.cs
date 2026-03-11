using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;

namespace Paracore.Addin.Services
{
    public class WatchdogContext : ICoreScriptContext
    {
        private readonly UIApplication _uiApp;
        private readonly Document _doc;
        private readonly List<string> _printLog = new();

        public WatchdogContext(UIApplication uiApp, Document doc, Dictionary<string, object> parameters)
        {
            _uiApp = uiApp;
            _doc = doc;
            Parameters = parameters ?? new Dictionary<string, object>();
        }

        public UIApplication UIApp => _uiApp;
        public UIDocument UIDoc => _uiApp.ActiveUIDocument; // Can be null, but usually safe in Idling if doc is valid
        public Document Doc => _doc;

        public Action<string>? PrintCallback => null;
        public IReadOnlyList<string> PrintLog => _printLog;
        public bool IsReadOnly => true; // Watchdogs run in Idling, usually assume read-only unless Starting Transaction

        public Dictionary<string, object> Parameters { get; }

        public void Println(string message) 
        { 
            _printLog.Add(message); 
            // Optional: dont flood file logs
        }

        public void Print(string message) 
        { 
            _printLog.Add(message); 
        }

        public void LogError(string message) 
        { 
            _printLog.Add("ERROR: " + message); 
            FileLogger.LogError($"[Watchdog] {message}"); 
        }

        public void AddStructuredOutput(string type, string jsonData, string? title = null) { }
        public void SetInternalData(string data) { }
    }
}
