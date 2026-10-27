using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Tests
{
    public class TestScriptContext : ICoreScriptContext
    {
        private readonly List<string> _printMessages = new();
        private readonly List<string> _showOutputMessages = new();

        public IReadOnlyList<string> PrintLog => _printMessages;
        public IReadOnlyList<string> ShowOutputLog => _showOutputMessages;
        public UIApplication UIApp { get; }
        public UIDocument UIDoc => UIApp?.ActiveUIDocument;
        public Document Doc => UIDoc?.Document;
        public bool IsReadOnly { get; }

        public Action<string>? PrintCallback { get; }

        public TestScriptContext(UIApplication app, bool isReadOnly = false)
        {
            UIApp = app;
            IsReadOnly = isReadOnly;
            PrintCallback = msg =>
            {
                _printMessages.Add(msg);
                Console.WriteLine(msg);
            };
        }

        public void Println(string message)
        {
            _printMessages.Add(message);
            FileLogger.Log(message);
            Console.WriteLine(message);
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
            FileLogger.Log(message);
            Console.Write(message);
        }

        public void LogError(string message)
        {
            FileLogger.LogError(message);
        }

        /// <summary>
        /// Recorded cap-exempt flags, in emission order — so an engine test can assert that a
        /// parameter schema is marked uncappable and an element dump is not.
        /// </summary>
        public List<(string Type, bool CapExempt)> StructuredOutputFlags { get; } = new();

        public void AddStructuredOutput(string type, string jsonData, bool capExempt = false)
        {
            StructuredOutputFlags.Add((type, capExempt));
            var prefixStr = $"Type: {type}";
            _showOutputMessages.RemoveAll(m => m.StartsWith(prefixStr));
            _showOutputMessages.Add($"Type: {type}, Data: {jsonData}");

            FileLogger.Log($"Structured Output - Type: {type}, CapExempt: {capExempt}, Data: {jsonData}");
            Console.WriteLine($"Structured Output - Type: {type}, CapExempt: {capExempt}, Data: {jsonData}");
        }

        public List<int> PipelineDiagnostics { get; set; } = new();

    }
}
