using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using System.Text.Json;
using System.Threading;

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
        public void ChartBar(object data) => Show("chart-bar", data);
        public void ChartPie(object data) => Show("chart-pie", data);
        public void ChartLine(object data) => Show("chart-line", data);
    }

    public class ExecutionGlobals
    {
        internal static readonly AsyncLocal<ExecutionGlobals> Current = new AsyncLocal<ExecutionGlobals>();

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
