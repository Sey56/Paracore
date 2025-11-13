using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models; // Added
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Tests
{
    public class TestScriptContext : ICoreScriptContext
    {
        private readonly List<string> _printMessages = new();
        private readonly List<StructuredOutputItem> _structuredOutputLog = new(); // Changed
        
        public IReadOnlyList<string> PrintLog => _printMessages;
        public IReadOnlyList<StructuredOutputItem> StructuredOutputLog => _structuredOutputLog; // Changed

        public UIApplication UIApp { get; }

        public UIDocument UIDoc => UIApp?.ActiveUIDocument;

        public Document Doc => UIDoc?.Document;

        public Action<string>? PrintCallback { get; }

        public TestScriptContext(UIApplication app)
        {
            UIApp = app;
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

        public void AddStructuredOutput(string type, string jsonData)
        {
            _structuredOutputLog.Add(new StructuredOutputItem { Type = type, Data = jsonData });
            FileLogger.Log($"Structured Output - Type: {type}, Data: {jsonData}");
            Console.WriteLine($"Structured Output - Type: {type}, Data: {jsonData}");
        }
    }
}