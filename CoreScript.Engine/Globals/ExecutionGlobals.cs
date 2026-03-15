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
            return reader.TokenType == JsonTokenType.Number ? new ElementId(reader.GetInt64()) : ElementId.InvalidElementId;
        }

        public override void Write(Utf8JsonWriter writer, ElementId value, JsonSerializerOptions options)
        {
            writer.WriteNumberValue(value.Value);
        }
    }

    /// <summary>
    /// Prevents "The current document is not workset-enabled" and circular reference errors
    /// by only serializing essential Element properties. Handles all subclasses (Wall, Floor, etc.)
    /// </summary>
    public class RevitElementConverterFactory : JsonConverterFactory
    {
        public override bool CanConvert(Type typeToConvert)
        {
            return typeof(Element).IsAssignableFrom(typeToConvert);
        }

        public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
        {
            return new ElementConverter();
        }

        private class ElementConverter : JsonConverter<Element>
        {
            public override Element Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                throw new NotImplementedException();
            }

            public override void Write(Utf8JsonWriter writer, Element value, JsonSerializerOptions options)
            {
                if (value == null) { writer.WriteNullValue(); return; }
                writer.WriteStartObject();
                writer.WriteNumber("Id", value.Id.Value);
                writer.WriteString("Name", value.Name);

                try
                {
                    if (value.Category != null)
                    {
                        writer.WriteString("Category", value.Category.Name);
                    }
                }
                catch { }

                // Explicitly NOT serializing Document or WorksetId to avoid "workset-enabled" errors

                writer.WriteEndObject();
            }
        }
    }

    /// <summary>
    /// Safely serializes Document references.
    /// </summary>
    public class DocumentConverter : JsonConverter<Document>
    {
        public override Document Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, Document value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteString("Title", value.Title);
            writer.WriteString("Path", value.PathName);
            writer.WriteEndObject();
        }
    }

    /// <summary>
    /// Ensures XYZ objects are serialized as simple coordinate objects.
    /// </summary>
    public class XYZConverter : JsonConverter<XYZ>
    {
        public override XYZ Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, XYZ value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteNumber("X", Math.Round(value.X, 6));
            writer.WriteNumber("Y", Math.Round(value.Y, 6));
            writer.WriteNumber("Z", Math.Round(value.Z, 6));
            writer.WriteEndObject();
        }
    }

    /// <summary>
    /// Safely serializes Revit Parameters avoiding circular references to Elements.
    /// </summary>
    public class ParameterConverter : JsonConverter<Parameter>
    {
        public override Parameter Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, Parameter value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteString("Name", value.Definition.Name);

            // Write formatted value for display
            writer.WriteString("Value", value.AsValueString() ?? "-");

            // Meta
            writer.WriteNumber("Id", (value.Definition as InternalDefinition)?.Id.Value ?? -1);
            writer.WriteBoolean("IsReadOnly", value.IsReadOnly);

            // Enums naturally serialize to strings now thanks to JsonStringEnumConverter
            writer.WritePropertyName("StorageType");
            JsonSerializer.Serialize(writer, value.StorageType, options);

            writer.WriteEndObject();
        }
    }

    public class Output
    {
        private readonly ICoreScriptContext _context;

        public Output(ICoreScriptContext context)
        {
            _context = context;
        }

        public void Show(string type, object data)
        {
            var toSerialize = MaterializeForSerialization(data);
            var json = JsonSerializer.Serialize(toSerialize, ExecutionGlobals.SerializerOptions);
            _context.AddStructuredOutput(type, json);
        }

        /// <summary>
        /// Materializes lazy IEnumerables and converts anonymous types (from Roslyn scripting)
        /// to dictionaries so System.Text.Json can serialize them reliably.
        /// Without this, lazy projections like .Select(x => new { ... }) from the REPL
        /// fail to serialize because the anonymous type is internal to a dynamic assembly.
        /// </summary>
        private static object MaterializeForSerialization(object data)
        {
            if (data == null || data is string || data is byte[])
            {
                return data;
            }

            if (data is System.Collections.IEnumerable enumerable)
            {
                var list = new List<object>();
                bool hasAnonymous = false;

                foreach (var item in enumerable)
                {
                    if (item == null) { list.Add(null); continue; }

                    var itemType = item.GetType();
                    bool isAnonymous = itemType.Name.StartsWith("<>") &&
                                       itemType.IsDefined(typeof(System.Runtime.CompilerServices.CompilerGeneratedAttribute), false);

                    if (isAnonymous)
                    {
                        hasAnonymous = true;
                        var dict = new Dictionary<string, object>();
                        foreach (var prop in itemType.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
                        {
                            dict[prop.Name] = prop.GetValue(item);
                        }
                        list.Add(dict);
                    }
                    else
                    {
                        list.Add(item);
                    }
                }

                if (hasAnonymous)
                {
                    return list;
                }
            }

            return data;
        }

        public void ChartBar(object data)
        {
            Show("chart-bar", data);
        }

        public void ChartPie(object data)
        {
            Show("chart-pie", data);
        }

        public void Table(object data)
        {
            Show("table", data);
        }

        public void ChartLine(object data)
        {
            Show("chart-line", data);
        }
    }

    public class ExecutionGlobals
    {
        public static readonly AsyncLocal<ExecutionGlobals> Current = new AsyncLocal<ExecutionGlobals>();

        public static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            ReferenceHandler = ReferenceHandler.IgnoreCycles,
            Converters = {
                new ElementIdConverter(),
                new RevitElementConverterFactory(),
                new DocumentConverter(),
                new XYZConverter(),
                new ParameterConverter(),
                new JsonStringEnumConverter()
            }
        };

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

        private ICoreScriptContext _context;
        public Dictionary<string, object> Parameters { get; }
        public Dictionary<string, object> RawParameters { get; }
        public Dictionary<string, IEnumerable<object>> ResolutionPools { get; } = new Dictionary<string, IEnumerable<object>>();

        public Output Output { get; private set; }
        public IParameterHydrator Hydrator { get; }

        public ExecutionGlobals(ICoreScriptContext context, Dictionary<string, object> parameters, Dictionary<string, object>? rawParameters = null)
        {
            _context = context;
            Parameters = parameters;
            RawParameters = rawParameters ?? parameters;
            Output = new Output(context);
            var revitResolver = new RevitObjectResolver(context.Doc);
            Hydrator = new ParameterHydrator(revitResolver);
        }

        public void UpdateContext(ICoreScriptContext context)
        {
            _context = context;
            Output = new Output(context);
            // Note: We don't update Hydrator/RevitResolver as they are tied to the Document, 
            // which doesn't change during a REPL session.
        }

        public static T Get<T>(string key)
        {
            if (Current.Value == null || !Current.Value.Parameters.TryGetValue(key, out var val) || val == null)
            {
                return default(T);
            }

            IEnumerable<object>? pool = null;
            if (Current.Value.ResolutionPools.TryGetValue(key, out var foundPool))
            {
                pool = foundPool;
            }

            return Current.Value.Hydrator.Hydrate<T>(key, val, pool);
        }

        public UIApplication? UIApp => _context.UIApp;
        public UIDocument? UIDoc => _context.UIDoc;
        public Document? Doc => _context.Doc;

        public void Println(string message)
        {
            _context.Println(message);
        }

        public void Println(object message)
        {
            _context.Println(message?.ToString() ?? "");
        }

        public void Print(string message)
        {
            _context.Print(message);
        }

        public void Print(object message)
        {
            _context.Print(message?.ToString() ?? "");
        }

        public void LogError(string message)
        {
            _context.LogError(message);
        }

        public void SetInternalData(string data)
        {
            _context.SetInternalData(data);
        }

        // Visualization Globals
        public void Table(object data)
        {
            Output.Table(data);
        }

        public void BarChart(object data)
        {
            Output.ChartBar(data);
        }

        public void PieChart(object data)
        {
            Output.ChartPie(data);
        }

        public void LineChart(object data)
        {
            Output.ChartLine(data);
        }

        // Unit Conversion Globals (Command Style)
        public double InputUnit(double value, string unit)
        {
            return value.InputUnit(unit);
        }

        public double OutputUnit(double value, string unit, int decimals = 2)
        {
            return value.OutputUnit(unit, decimals);
        }

        public double InputUnit(int value, string unit)
        {
            return ((double)value).InputUnit(unit);
        }

        public double OutputUnit(int value, string unit, int decimals = 2)
        {
            return ((double)value).OutputUnit(unit, decimals);
        }

        public double InputUnit(decimal value, string unit)
        {
            return ((double)value).InputUnit(unit);
        }

        public double OutputUnit(decimal value, string unit, int decimals = 2)
        {
            return ((double)value).OutputUnit(unit, decimals);
        }

        public void Transact(string name, Action<Document> action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return;
            }

            if (Doc != null)
            {
                Tx.Transact(Doc, name, action);
            }
        }

        public void Transact(string name, Action action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return;
            }

            if (Doc != null)
            {
                Tx.Transact(Doc, name, action);
            }
        }
    }
}
