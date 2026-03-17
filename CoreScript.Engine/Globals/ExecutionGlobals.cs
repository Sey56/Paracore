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
            // Only expand elements if we are rendering a table
            var toSerialize = MaterializeForSerialization(data, type == "table");
            if (toSerialize == null)
            {
                return; // Suppress empty data structures entirely
            }
            var json = JsonSerializer.Serialize(toSerialize, ExecutionGlobals.SerializerOptions);
            _context.AddStructuredOutput(type, json);
        }

        /// <summary>
        /// Provides a registry of high-priority parameters for common Revit categories.
        /// Captures the "Essence" of each category for the Smart Table.
        /// </summary>
        private static readonly Dictionary<string, string[]> SmartSchemaRegistry = new Dictionary<string, string[]>
        {
            ["Rooms"] = new[] { "Number", "Level", "Area", "Perimeter", "Unbounded Height", "Volume", "Comments" },
            ["Walls"] = new[] { "Mark", "Base Constraint", "Top Constraint", "Length", "Width", "Area", "Volume", "Comments" },
            ["Doors"] = new[] { "Mark", "Level", "Type Name", "Comments" },
            ["Windows"] = new[] { "Mark", "Level", "Type Name", "Comments" },
            ["Floors"] = new[] { "Level", "Thickness", "Area", "Volume", "Comments" },
            ["Roofs"] = new[] { "Base Level", "Thickness", "Area", "Volume", "Comments" },
            ["Ceilings"] = new[] { "Level", "Height Offset From Level", "Area", "Volume" },
            ["Sheets"] = new[] { "Sheet Number", "Sheet Name", "Drawn By", "Checked By", "Current Revision" },
            ["Views"] = new[] { "View Name", "View Classification", "Detail Level", "Scale Value 1:", "Title on Sheet" },
            ["Levels"] = new[] { "Elevation" },
            ["Pipes"] = new[] { "System Type", "Size", "Length", "Comments" },
            ["Ducts"] = new[] { "System Type", "Size", "Length", "Comments" },
            ["Structural Columns"] = new[] { "Mark", "Base Level", "Top Level", "Comments" },
            ["Structural Framing"] = new[] { "Mark", "Reference Level", "Length", "Comments" },
        };

        /// <summary>
        /// Materializes lazy IEnumerables and converts anonymous types (from Roslyn scripting)
        /// to dictionaries so System.Text.Json can serialize them reliably.
        /// If expandElements is true, it also detects homogeneous Revit element collections
        /// and automatically extracts relevant parameters as columns.
        /// </summary>
        private static object MaterializeForSerialization(object data, bool expandElements = false)
        {
            if (data == null || data is string || data is byte[])
            {
                return data;
            }

            if (data is System.Collections.IEnumerable enumerable)
            {
                // 1. Materialize to a list immediately to avoid double-iteration issues
                var items = new List<object>();
                foreach (var item in enumerable)
                {
                    if (item != null) items.Add(item);
                }

                if (items.Count == 0) return null;

                // 2. Try Smart Expansion for Revit Elements
                if (expandElements)
                {
                    var elements = items.OfType<Element>().ToList();
                    // Only expand if the WHOLE collection is Revit elements
                    if (elements.Count > 0 && elements.Count == items.Count)
                    {
                        var first = elements[0];
                        string catName = first.Category?.Name ?? "General";
                        var firstCatId = first.Category?.Id?.Value;
                        
                        // Check homogeneity on a small sample for performance
                        bool isHomogeneous = elements.Take(5).All(e => e.Category?.Id?.Value == firstCatId);

                        if (isHomogeneous)
                        {
                            // A. GET SCHEMA: Try registry first, then dynamic discovery
                            List<string> schema;
                            if (SmartSchemaRegistry.TryGetValue(catName, out var registered))
                            {
                                schema = registered.ToList();
                            }
                            else
                            {
                                // Dynamic discovery: Numeric parameters + key context
                                var keyParams = new[] { "Mark", "Level", "Base Constraint", "Reference Level", "Comments" };
                                var discovered = first.Parameters.Cast<Parameter>()
                                    .Where(p => p.HasValue && (p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer))
                                    .Select(p => p.Definition.Name)
                                    .Take(10);
                                
                                schema = keyParams.Where(k => first.LookupParameter(k) != null)
                                    .Concat(discovered)
                                    .Distinct()
                                    .ToList();
                            }

                            // B. CAPTURE DATA
                            var resultList = new List<object>();
                            foreach (var el in elements)
                            {
                                var row = new Dictionary<string, object>
                                {
                                    ["Id"] = el.Id.Value,
                                    ["Name"] = el.Name,
                                };

                                var elType = el.GetType();
                                foreach (var key in schema)
                                {
                                    try
                                    {
                                        // 1. Preferred: Formatted Revit Value (respects project units/names)
                                        var val = el.GetVal(key);
                                        if (val != "-") { row[key] = val; continue; }

                                        // 2. Reflection: Capture C# properties not in Parameters
                                        var prop = elType.GetProperty(key, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                                        if (prop != null)
                                        {
                                            var pVal = prop.GetValue(el);
                                            if (pVal != null)
                                            {
                                                if (pVal is Element revitEl) row[key] = revitEl.Name;
                                                else row[key] = el.GetStr(key); // Use smart GetStr for automatic unit formatting
                                                continue;
                                            }
                                        }
                                    }
                                    catch { }
                                }
                                resultList.Add(row);
                            }
                            return resultList;
                        }
                    }
                }

                // 3. Fallback: Standard Materialization (handles anonymous types)
                var list = new List<object>();
                foreach (var item in items)
                {
                    var itemType = item.GetType();
                    bool isAnonymous = itemType.Name.StartsWith("<>") &&
                                       itemType.IsDefined(typeof(System.Runtime.CompilerServices.CompilerGeneratedAttribute), false);

                    if (isAnonymous)
                    {
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

                return list.Count == 0 ? null : list;
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

        /// <summary>
        /// Discovery helper for the REPL. Lists all parameters of one or more elements in a table.
        /// usage: ListParams(myWall) or ListParams(id) or ListParams(listOfWalls)
        /// </summary>
        public void ListParams(object input)
        {
            if (input == null) return;

            // 1. Single Element
            if (input is Element e)
            {
                Table(e.AllParams());
                return;
            }

            // 2. ElementId
            if (input is ElementId id && Doc != null)
            {
                ListParams(Doc.GetElement(id));
                return;
            }

            // 3. Collection
            if (input is System.Collections.IEnumerable enumerable)
            {
                var list = new List<object>();
                foreach (var item in enumerable)
                {
                    if (item is Element el)
                    {
                        var p = el.AllParams();
                        var row = new Dictionary<string, object> { ["Name"] = el.Name, ["Id"] = el.Id.Value };
                        // Note: If showing a collection, we keep it simple (Name, Id + Params)
                        foreach (dynamic pInfo in p) row[pInfo.Name] = pInfo.Value;
                        list.Add(row);
                    }
                }
                if (list.Count > 0) Table(list);
            }
        }

        /// <summary>
        /// Discovery helper for the REPL. Lists key Revit API properties (Level, Location, etc.)
        /// </summary>
        public void ListProperties(object input)
        {
            if (input is Element e) Table(e.AllProperties());
            else if (input is ElementId id && Doc != null) ListProperties(Doc.GetElement(id));
            else if (input is System.Collections.IEnumerable enumerable)
            {
                var list = new List<object>();
                foreach (var item in enumerable) if (item is Element el) list.Add(el.AllProperties());
                if (list.Count > 0) Table(list);
            }
        }

        /// <summary>
        /// Discovery helper for the REPL. Lists geometry summary (Solids, Volumes, Area).
        /// </summary>
        public void ListGeometry(object input)
        {
            if (input is Element e) Table(e.AllGeometry());
            else if (input is ElementId id && Doc != null) ListGeometry(Doc.GetElement(id));
            else if (input is System.Collections.IEnumerable enumerable)
            {
                var list = new List<object>();
                foreach (var item in enumerable) if (item is Element el) list.Add(el.AllGeometry());
                if (list.Count > 0) Table(list);
            }
        }

        /// <summary>
        /// The ULTIMATE diagnostic tool for REPL. 
        /// Lists every parameter and shows exactly how the engine resolves it:
        /// Name | Storage | GetStr() | GetNum() | GetVal() (UI Formatting)
        /// </summary>
        public void Snoop(object input)
        {
            if (input == null) return;
            if (input is Element e)
            {
                var snoopData = e.Parameters.Cast<Parameter>()
                    .OrderBy(p => p.Definition.Name)
                    .Select(p => new
                    {
                        Parameter = p.Definition.Name,
                        Storage = p.StorageType.ToString(),
                        StringValue = e.GetStr(p.Definition.Name),
                        NumericValue = p.StorageType == StorageType.Double ? e.GetNum(p.Definition.Name).ToString("F4") : p.StorageType == StorageType.Integer ? e.GetInt(p.Definition.Name).ToString() : "-",
                        UIValue = p.AsValueString() ?? "-"
                    });
                
                Table(snoopData);
                return;
            }
            if (input is ElementId id && Doc != null) { Snoop(Doc.GetElement(id)); return; }
            if (input is System.Collections.IEnumerable enumerable)
            {
                foreach (var item in enumerable) if (item is Element el) Snoop(el);
            }
        }

        /// <summary>
        /// Discovery helper for the REPL. Lists all BuiltInParameter identifiers for an element.
        /// usage: ListBIPs(myWall)
        /// </summary>
        public void ListBIPs(object input)
        {
            if (input is Element e) Table(e.AllBuiltInParams());
            else if (input is ElementId id && Doc != null) ListBIPs(Doc.GetElement(id));
            else if (input is System.Collections.IEnumerable enumerable)
            {
                var list = new List<object>();
                foreach (var item in enumerable) if (item is Element el) list.Add(el.AllBuiltInParams());
                if (list.Count > 0) Table(list);
            }
        }

        /// <summary>
        /// Quick delete helper with automatic transaction.
        /// </summary>
        public void Delete(object input)
        {
            if (Doc == null || input == null) return;
            Transact("Delete Elements", () => {
                if (input is Element e) Doc.Delete(e.Id);
                else if (input is ElementId id) Doc.Delete(id);
                else if (input is System.Collections.IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        if (item is Element el) Doc.Delete(el.Id);
                        else if (item is ElementId i) Doc.Delete(i);
                    }
                }
            });
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
