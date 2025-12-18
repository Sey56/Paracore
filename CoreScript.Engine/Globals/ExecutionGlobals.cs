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
    }

    public class ExecutionGlobals
    {
        internal static readonly AsyncLocal<ExecutionGlobals> Current = new AsyncLocal<ExecutionGlobals>();

        public static void SetContext(ExecutionGlobals context) => Current.Value = context;
        public static void ClearContext() => Current.Value = null;

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