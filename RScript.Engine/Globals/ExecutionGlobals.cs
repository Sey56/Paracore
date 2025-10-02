using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using RScript.Engine.Context;
using System.Text.Json;
using System.Threading;

namespace RScript.Engine.Globals
{
    public class Output
    {
        private readonly IRScriptContext _context;

        public Output(IRScriptContext context)
        {
            _context = context;
        }

        public void Show(string type, object data)
        {
            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
            _context.AddStructuredOutput(type, json);
        }
    }

    public class ExecutionGlobals
    {
        internal static readonly AsyncLocal<ExecutionGlobals> Current = new AsyncLocal<ExecutionGlobals>();

        public static void SetContext(ExecutionGlobals context) => Current.Value = context;
        public static void ClearContext() => Current.Value = null;

        private readonly IRScriptContext _context;

        public Dictionary<string, object> Parameters { get; }
        public Output Output { get; }


        public ExecutionGlobals(IRScriptContext context, Dictionary<string, object> parameters)
        {
            _context = context;
            Parameters = parameters;
            Output = new Output(context);
        }

        public UIApplication? UIApp => _context.UIApp;
        public UIDocument? UIDoc => _context.UIDoc;
        public Document? Doc => _context.Doc;

        public void Print(string message) => _context.Print(message);
        public void LogError(string message) => _context.LogError(message);

        // Old method for backward compatibility
        public void Transact(string name, Action<Document> action)
        {
            if (Doc != null)
                Tx.Transact(Doc, name, action);
        }

        // New, preferred method
        public void Transact(string name, Action action)
        {
            if (Doc != null)
                Tx.Transact(Doc, name, action);
        }
    }
}