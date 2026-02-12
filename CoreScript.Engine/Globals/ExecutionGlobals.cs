using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using CoreScript.Engine.Models;
using CoreScript.Engine.Logging;
using System;
using System.Globalization;
using System.Runtime.Loader;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Custom converter to ensure ElementId serializes as a simple number in Tables/Charts.
    /// This fixes the [object Object] issue in the UI.
    /// </summary>
    public class ElementIdConverter : JsonConverter<ElementId>
    {
        public override ElementId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Number) return new ElementId(reader.GetInt64());
            return ElementId.InvalidElementId;
        }

        public override void Write(Utf8JsonWriter writer, ElementId value, JsonSerializerOptions options)
        {
            writer.WriteNumberValue(value.Value);
        }
    }

    public class Output
    {
        private readonly ICoreScriptContext _context;
        private static readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions 
        { 
            WriteIndented = true,
            ReferenceHandler = ReferenceHandler.IgnoreCycles,
            Converters = { new ElementIdConverter() } // Apply the fix here
        };

        public Output(ICoreScriptContext context)
        {
            _context = context;
        }

        public void Show(string type, object data)
        {
            var json = JsonSerializer.Serialize(data, _jsonOptions);
            _context.AddStructuredOutput(type, json);
        }

        public void ChartBar(object data) => Show("chart-bar", data);
        public void ChartPie(object data) => Show("chart-pie", data);
        public void Table(object data) => Show("table", data);
        public void ChartLine(object data) => Show("chart-line", data);
    }

    public class ExecutionGlobals
    {
        public static readonly AsyncLocal<ExecutionGlobals> Current = new AsyncLocal<ExecutionGlobals>();

        // Timeout mechanism
        private static DateTime _executionDeadline;
        private static int _timeoutSeconds = 10; // Default 10 seconds

        public static void SetContext(ExecutionGlobals context)
        {
            Current.Value = context;
            // Initialize deadline when execution starts
            _executionDeadline = DateTime.Now.AddSeconds(_timeoutSeconds);
        }

        public static void ClearContext()
        {
            Current.Value = null;
            // Reset timeout to default
            _timeoutSeconds = 10;
        }

        public static void SetExecutionTimeout(int seconds)
        {
            _timeoutSeconds = seconds;
            _executionDeadline = DateTime.Now.AddSeconds(seconds);
        }

        public static void CheckTimeout()
        {
            if (DateTime.Now > _executionDeadline)
            {
                throw new TimeoutException($"🛑 Script execution timed out after {_timeoutSeconds} seconds. If this script needs more time, add SetExecutionTimeout(seconds) at the start of your script.");
            }
        }

        private readonly ICoreScriptContext _context;

        public Dictionary<string, object> Parameters { get; }
        public Output Output { get; }
        public IParameterHydrator Hydrator { get; }


        public ExecutionGlobals(ICoreScriptContext context, Dictionary<string, object> parameters)
        {
            _context = context;
            Parameters = parameters;
            Output = new Output(context);
            var revitResolver = new RevitObjectResolver(context.Doc);
            Hydrator = new ParameterHydrator(revitResolver);
        }

        public static T Get<T>(string key)
        {
            if (Current.Value == null || !Current.Value.Parameters.TryGetValue(key, out var val) || val == null)
            {
                return default(T);
            }

            return Current.Value.Hydrator.Hydrate<T>(key, val);
        }

        public UIApplication? UIApp => _context.UIApp;
        public UIDocument? UIDoc => _context.UIDoc;
        public Document? Doc => _context.Doc;

        public void Println(string message) => _context.Println(message);
        public void Print(string message) => _context.Print(message);
        public void LogError(string message) => _context.LogError(message);
        public void SetInternalData(string data) => _context.SetInternalData(data);

        // Visualization Globals
        public void Table(object data) => Output.Table(data);
        public void BarChart(object data) => Output.ChartBar(data);
        public void PieChart(object data) => Output.ChartPie(data);
        public void LineChart(object data) => Output.ChartLine(data);

        public void Transact(string name, Action<Document> action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return;
            }

            if (Doc != null)
                Tx.Transact(Doc, name, action);
        }

        public void Transact(string name, Action action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return;
            }

            if (Doc != null)
                Tx.Transact(Doc, name, action);
        }
    }
}