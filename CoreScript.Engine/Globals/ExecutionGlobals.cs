using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using System.Text.Json;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using CoreScript.Engine.Models;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Globals
{
    public class Output
    {
        private readonly ICoreScriptContext _context;

        public Output(ICoreScriptContext context)
        {
            _context = context;
        }

        public void Show(string type, object data)
        {
            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
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

        /// <summary>
        /// Sets the execution timeout for the current script. Call this at the start of your script if you need more than 10 seconds.
        /// </summary>
        /// <param name="seconds">Maximum execution time in seconds</param>
        public static void SetExecutionTimeout(int seconds)
        {
            _timeoutSeconds = seconds;
            _executionDeadline = DateTime.Now.AddSeconds(seconds);
        }

        /// <summary>
        /// Internal method called by injected timeout checks. Throws TimeoutException if deadline exceeded.
        /// </summary>
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

        /// <summary>
        /// Retrieves a parameter value and safely converts it to the requested type.
        /// Primarily used by compiled .ptool execution to handle type-safe parameter injection.
        /// </summary>
        public static T Get<T>(string key)
        {
            if (Current.Value == null || !Current.Value.Parameters.TryGetValue(key, out var val) || val == null)
            {
                return default(T);
            }

            if (val is T typedVal) return typedVal;

            // Diagnostic logging for types
            FileLogger.Log($"[ExecutionGlobals] Parameter '{key}' requested as {typeof(T).Name}. Current type: {val.GetType().Name}, Value: {val}");

            // Optimization for primitive conversions (e.g., Int32 -> Double)
            try
            {
                var targetType = typeof(T);
                if (targetType.IsPrimitive || targetType == typeof(decimal))
                {
                    // Case: val is Int32, T is Double
                    var converted = (T)System.Convert.ChangeType(val, targetType);
                    FileLogger.Log($"[ExecutionGlobals] Successfully converted '{key}' via Convert.ChangeType to {typeof(T).Name}");
                    return converted;
                }
            }
            catch (Exception ex)
            {
                 FileLogger.LogError($"[ExecutionGlobals] Primitive conversion failed for '{key}' to {typeof(T).Name}: {ex.Message}");
            }

            try
            {
                // Structured solution: Use Json conversion for intermediate casting
                // This handles cases like Int32 -> Double or dynamic List conversions
                var json = JsonSerializer.Serialize(val);
                var deserialized = JsonSerializer.Deserialize<T>(json);
                FileLogger.Log($"[ExecutionGlobals] Successfully converted '{key}' via JSON pivot to {typeof(T).Name}");
                return deserialized;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ExecutionGlobals] JSON pivot failed for '{key}' to {typeof(T).Name}: {ex.Message}");
                try { return (T)System.Convert.ChangeType(val, typeof(T)); }
                catch { return default(T); }
            }
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

        // Old method for backward compatibility
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

        // New, preferred method
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
