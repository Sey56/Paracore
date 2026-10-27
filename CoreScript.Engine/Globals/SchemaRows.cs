using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// A sequence of PARAMETER-SCHEMA rows — what <c>InstanceParams()</c>, <c>TypeParams()</c>,
    /// <c>CombinedParams()</c>, <c>BuiltInParams()</c> and <c>NativeProperties()</c> return.
    /// <para>
    /// ⚠⚠ WHY THIS TYPE EXISTS (2026-10-27). The MCP summariser caps every table at
    /// <c>MAX_TABLE_ROWS</c> and keeps only the first rows plus the last two. That is right for
    /// an ELEMENT dump — the agent asked "show me these" and can narrow the query — and wrong
    /// for a SCHEMA: "what parameters does this element have?" is answered by the list, and a
    /// list cut after 50 rows is not a shorter answer, it is a wrong one. The agent then reads
    /// a parameter as missing and stops using it.
    /// <para>
    /// The summariser cannot tell the two apart from the data alone — both arrive as
    /// <c>{"type":"table","data":[…]}</c> — so the ENGINE says which it emitted. This type is
    /// that statement: <c>VisualizationExtensions.Table&lt;T&gt;</c> checks for it and marks the
    /// structured output cap-exempt, which travels to the MCP as a flag rather than a guess.
    /// </para>
    /// <para>
    /// ⚠ The marker survives only while the sequence does. <c>.Select(x => x)</c>,
    /// <c>.ToList()</c> and <c>.Where(...)</c> return a new sequence and the marker is LOST —
    /// the table then caps like any other. That is deliberate: once the caller has projected or
    /// filtered, the rows are their own and no longer a schema. Do not "fix" it by sniffing
    /// column names.
    /// </para>
    /// </summary>
    public sealed class SchemaRows : IEnumerable<object>
    {
        private readonly IEnumerable<object> _rows;

        public SchemaRows(IEnumerable<object> rows)
        {
            _rows = rows ?? Enumerable.Empty<object>();
        }

        public IEnumerator<object> GetEnumerator() => _rows.GetEnumerator();

        IEnumerator IEnumerable.GetEnumerator() => _rows.GetEnumerator();
    }
}
