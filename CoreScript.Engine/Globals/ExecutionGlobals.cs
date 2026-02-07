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

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// V3 FIX: Custom converter to ensure ElementId serializes as a simple number in Tables/Charts.
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


        public ExecutionGlobals(ICoreScriptContext context, Dictionary<string, object> parameters)
        {
            _context = context;
            Parameters = parameters;
            Output = new Output(context);
        }

        public static T Get<T>(string key)
        {
            if (Current.Value == null || !Current.Value.Parameters.TryGetValue(key, out var val) || val == null)
            {
                return default(T);
            }

            if (val is T typedVal) return typedVal;

            var targetType = typeof(T);

            // 0. ENUM HYDRATION: Support parsing enum names from strings (e.g. OST_Walls)
            if (targetType.IsEnum && val != null)
            {
                if (Enum.TryParse(targetType, val.ToString(), true, out var enumResult))
                {
                    return (T)enumResult;
                }
            }

            bool isElement = typeof(Element).IsAssignableFrom(targetType);
            bool isElementList = targetType.IsGenericType && 
                               targetType.GetGenericTypeDefinition() == typeof(List<>) && 
                               typeof(Element).IsAssignableFrom(targetType.GetGenericArguments()[0]);

            if (isElement || isElementList)
            {
                try
                {
                    if (isElement)
                    {
                        var resolved = ResolveRevitElement(val, targetType);
                        if (resolved != null) return (T)resolved;
                    }
                    else // List<Element>
                    {
                        var itemType = targetType.GetGenericArguments()[0];
                        var resultList = (System.Collections.IList)Activator.CreateInstance(targetType);
                        
                        IEnumerable<object> sourceItems = null;
                        if (val is string json && json.TrimStart().StartsWith("["))
                            sourceItems = JsonSerializer.Deserialize<List<object>>(json);
                        else if (val is IEnumerable<object> ie)
                            sourceItems = ie;
                        
                        if (sourceItems != null)
                        {
                            foreach (var item in sourceItems)
                            {
                                var resolved = ResolveRevitElement(item, itemType);
                                if (resolved != null) resultList.Add(resolved);
                            }
                            return (T)resultList;
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[ExecutionGlobals] Magic Hydration failed for '{key}' ({targetType.Name}): {ex.Message}");
                }
                
                return default(T);
            }

            // OPTIMIZATION: XYZ Hydration from string "x,y,z"
            if (targetType == typeof(XYZ) && val is string xyzString)
            {
                try
                {
                    var parts = xyzString.Split(',');
                    if (parts.Length == 3)
                    {
                        double x = double.Parse(parts[0], CultureInfo.InvariantCulture);
                        double y = double.Parse(parts[1], CultureInfo.InvariantCulture);
                        double z = double.Parse(parts[2], CultureInfo.InvariantCulture);
                        return (T)(object)new XYZ(x, y, z);
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[ExecutionGlobals] Failed to parse XYZ from '{xyzString}': {ex.Message}");
                }
            }
            
            // OPTIMIZATION: Reference/Face/Edge Hydration from Stable Representation String
            if ((targetType == typeof(Reference) || typeof(GeometryObject).IsAssignableFrom(targetType)) && val is string refString)
            {
                try
                {
                     // 1. Parse Reference
                     var refObj = Reference.ParseFromStableRepresentation(Current.Value?.Doc, refString);
                     if (refObj != null)
                     {
                         if (targetType == typeof(Reference)) return (T)(object)refObj;

                         // 2. Resolve Geometry (Face/Edge)
                         if (typeof(GeometryObject).IsAssignableFrom(targetType))
                         {
                             var el = Current.Value?.Doc.GetElement(refObj);
                             var geom = el?.GetGeometryObjectFromReference(refObj);
                             if (geom != null && targetType.IsAssignableFrom(geom.GetType()))
                                 return (T)(object)geom;
                         }
                     }
                }
                catch (Exception ex)
                {
                     FileLogger.LogError($"[ExecutionGlobals] Failed to parse {targetType.Name} from StableRef: {ex.Message}");
                }
            }

            // Optimization for primitive conversions (e.g., Int32 -> Double)
            try
            {
                if (targetType.IsPrimitive || targetType == typeof(decimal))
                {
                    return (T)System.Convert.ChangeType(val, targetType);
                }
            }
            catch (Exception ex)
            {
                 FileLogger.LogError($"[ExecutionGlobals] Primitive conversion failed for '{key}' to {typeof(T).Name}: {ex.Message}");
            }

            try
            {
                var json = JsonSerializer.Serialize(val);
                var deserialized = JsonSerializer.Deserialize<T>(json);
                return deserialized;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ExecutionGlobals] JSON pivot failed for '{key}' to {typeof(T).Name}: {ex.Message}");
                try { return (T)System.Convert.ChangeType(val, typeof(T), CultureInfo.InvariantCulture); }
                catch { return default(T); }
            }
        }

        private static object ResolveRevitElement(object val, Type targetType)
        {
            var doc = Current.Value?.Doc;
            if (doc == null || val == null) return null;

            if (val is Reference reference)
            {
                var el = doc.GetElement(reference);
                if (el != null && targetType.IsAssignableFrom(el.GetType())) return el;
            }

            string identifier = val.ToString();
            if (string.IsNullOrEmpty(identifier)) return null;

            FileLogger.Log($"[Hydrator] Attempting to resolve '{identifier}' to {targetType.Name}");

            try {
                var el = doc.GetElement(identifier);
                if (el != null && targetType.IsAssignableFrom(el.GetType())) 
                {
                    FileLogger.Log($"[Hydrator] Found match via UniqueId.");
                    return el;
                }
            } catch {}

            if (long.TryParse(identifier, out long idLong))
            {
                try {
                    var elId = doc.GetElement(new ElementId(idLong));
                    if (elId != null && targetType.IsAssignableFrom(elId.GetType())) 
                    {
                        FileLogger.Log($"[Hydrator] Found match via ElementId.");
                        return elId;
                    }
                } catch {}
            }

            if (targetType.IsClass)
            {
                try 
                {
                    bool isTypeRequested = targetType.Name.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                    var collector = ParameterOptionsComputer.CreateResilientCollector(doc, targetType);
                    var candidates = collector.WhereElementIsNotElementType().Cast<Element>();
                    if (isTypeRequested || typeof(ElementType).IsAssignableFrom(targetType))
                    {
                        candidates = new FilteredElementCollector(doc).OfClass(targetType).WhereElementIsElementType().Cast<Element>();
                    }
                    
                    foreach (var e in candidates)
                    {
                        string elementIdentity = ParameterOptionsComputer.GetElementIdentity(e);
                        if (e.Name == identifier || elementIdentity == identifier)
                        {
                            FileLogger.Log($"[Hydrator] Found match via Identity: {e.Name} (ID: {elementIdentity})");
                            return e;
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[Hydrator] Identity search error for {targetType.Name}: {ex.Message}");
                }
            }
            
            FileLogger.LogError($"[Hydrator] FAILED to resolve '{identifier}' to {targetType.Name}. Property will be NULL.");
            return null;
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