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

        /// <summary>
        /// Records a structured output item for the UI and for the MCP.
        /// </summary>
        /// <param name="type">Routing key — <c>table</c>, <c>chart-bar</c>, … (a wire contract).</param>
        /// <param name="jsonData">The serialized payload.</param>
        /// <param name="capExempt">
        /// ⚠ <c>true</c> means "every row matters — do not truncate". The MCP summariser caps a
        /// table at 50 rows, which is right for an element dump the agent can narrow and wrong
        /// for a PARAMETER SCHEMA, where the list is the answer and a cut list makes a real
        /// parameter look missing. Set by the engine (see <c>SchemaRows</c>), never inferred by
        /// the consumer from column names.
        /// </param>
        void AddStructuredOutput(string type, string jsonData, bool capExempt = false);

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
