using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Context
{
    /// <summary>
    /// Defines the execution context provided by host add-ins, including access to Revit API and logging.
    /// </summary>
    public interface ICoreScriptContext
    {
        UIApplication UIApp { get; }
        UIDocument UIDoc { get; }
        Document Doc { get; }

        void Println(string message);
        void Print(string message);
        void LogError(string message);
        void AddStructuredOutput(string type, string jsonData);

        Action<string>? PrintCallback { get; }

        IReadOnlyList<string> PrintLog { get; }

        bool IsReadOnly { get; }

        /// <summary>
        /// Pipeline stage diagnostics — populated by the execution engine.
        /// Each entry is the item count at a pipeline stage (GetElements → GroupByParam → viz).
        /// Positive N = count, 0 = empty, -1 = chart, -2 = table.
        /// </summary>
        List<int> PipelineDiagnostics { get; set; }
    }
}
