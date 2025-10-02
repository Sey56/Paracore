using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RScript.Engine.Context;
using RScript.Engine.Logging;
using System;
using System.Collections.Generic;

namespace RScript.Engine.Tests
{
    public class TestScriptContext : IRScriptContext
    {
        private readonly List<string> _printMessages = new();
        private readonly List<string> _showOutputMessages = new();

        public IReadOnlyList<string> PrintLog => _printMessages;
        public IReadOnlyList<string> ShowOutputLog => _showOutputMessages;

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

        public void Print(string message)
        {
            _printMessages.Add(message);
            FileLogger.Log(message);
            Console.WriteLine(message);
        }

        public void PrintWithTimeStamp(string message)
        {
            _printMessages.Add(message);
            FileLogger.Log(message);
            Console.WriteLine(message);
        }

        public void LogError(string message)
        {
            FileLogger.LogError(message);
        }

        public void AddStructuredOutput(string type, string jsonData)
        {
            _showOutputMessages.Add($"Type: {type}, Data: {jsonData}");
            FileLogger.Log($"Structured Output - Type: {type}, Data: {jsonData}");
            Console.WriteLine($"Structured Output - Type: {type}, Data: {jsonData}");
        }
    }
}