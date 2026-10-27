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

        /// <summary>
        /// Pipeline stage diagnostics — each stage of a fluent chain appends its item count.
        /// Positive N = N items at this stage. 0 = empty. -1 = chart, -2 = table.
        /// -3 = write success (✓), -4 = write failure (✗).
        /// E.g. [0] means GetElements returned 0. [5, 3, -1] = 5 elements, 3 groups, chart.
        /// [500, 50, -3, -3] = 500 walls, 50 filtered, two successful SetParams.
        /// </summary>
        public List<int> PipelineDiagnostics { get; } = new List<int>();

        /// <summary>
        /// Appends a diagnostic value to the pipeline diagnostics list.
        /// Thread-safe via AsyncLocal. Call from any extension method.
        /// </summary>
        public static void TrackPipeline(int diagnostic)
        {
            Current.Value?.PipelineDiagnostics.Add(diagnostic);
        }

        /// <summary>
        /// Toggle for showing/hiding pipeline diagnostics in output.
        /// Bound to the Pipeline checkbox in the History tab.
        /// </summary>
        public static bool ShowPipeline { get; set; } = true;

        /// <summary>
        /// Injected by PipelineTrackingRewriter around USER-SCRIPT
        /// <c>GetElements(...)</c> calls. Logs the source count and returns the
        /// SAME PipelineEnumerable instance — the static type is preserved, so
        /// the shadowed <c>.Where</c> (with its own tracking) and the
        /// <c>.Count</c> property keep working.
        /// Engine internals call ScriptApi.GetElements directly (not rewritten)
        /// and never pass through here — engine-internal enumerations stay
        /// silent in the pipeline. Idempotent via AlreadyTracked.
        /// </summary>
        public static PipelineEnumerable<T> TrackSource<T>(PipelineEnumerable<T> pe)
        {
            if (pe == null) return pe;
            if (!pe.AlreadyTracked)
            {
                TrackPipeline(pe.Count);
                pe.AlreadyTracked = true;
            }
            return pe;
        }

        /// <summary>
        /// Injected by PipelineTrackingRewriter after intermediate LINQ methods (Where, Select, OrderBy, etc.).
        /// Materializes the enumerable, pushes the count to PipelineDiagnostics,
        /// and returns the materialized list for further chaining.
        /// Idempotent: if the source is an AlreadyTracked PipelineEnumerable, returns it as-is.
        /// </summary>
        public static IEnumerable<T> TrackEnumerable<T>(IEnumerable<T> source)
        {
            if (source is PipelineEnumerable<T> pe && pe.AlreadyTracked)
                return pe;

            var list = source.ToList();
            TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Ordered-chain overload — overload resolution picks this one when the
        /// wrapped call is OrderBy/OrderByDescending, keeping the static type
        /// IOrderedEnumerable&lt;T&gt; so a following .ThenBy() still compiles
        /// (the IEnumerable overload erased it and broke ThenBy with CS1061).
        /// Materializes once, tracks the count, and returns an ordered snapshot.
        /// </summary>
        public static IOrderedEnumerable<T> TrackEnumerable<T>(IOrderedEnumerable<T> source)
        {
            var list = source.ToList();
            TrackPipeline(list.Count);
            return new OrderedSnapshot<T>(list);
        }

        /// <summary>Materialized, ordered sequence — the sorted order is fixed at
        /// snapshot time; CreateOrderedEnumerable re-orders the snapshot for
        /// subsequent ThenBy chains.</summary>
        private sealed class OrderedSnapshot<T> : IOrderedEnumerable<T>
        {
            private readonly List<T> _items;
            public OrderedSnapshot(List<T> items) => _items = items;

            public IOrderedEnumerable<T> CreateOrderedEnumerable<TKey>(
                Func<T, TKey> keySelector, IComparer<TKey> comparer, bool descending)
                => descending ? _items.OrderByDescending(keySelector, comparer)
                              : _items.OrderBy(keySelector, comparer);

            public IEnumerator<T> GetEnumerator() => _items.GetEnumerator();
            System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
        }

        /// <summary>
        /// Injected by PipelineTrackingRewriter after terminal LINQ methods (First, Last, Single, etc.).
        /// Pushes 1 (or 0 for null results) to PipelineDiagnostics and passes the item through.
        /// </summary>
        public static T TrackSingle<T>(T item)
        {
            TrackPipeline(item == null ? 0 : 1);
            return item;
        }

        // Timeout mechanism — per-execution instance fields, accessed via Current.Value
        private DateTime _executionDeadline = DateTime.MaxValue;
        private int _timeoutSeconds = 10; // Default 10 seconds

        public static void SetContext(ExecutionGlobals context)
        {
            Current.Value = context;
            // Initialize deadline when execution starts
            context._executionDeadline = DateTime.Now.AddSeconds(context._timeoutSeconds);
        }

        public static void ClearContext()
        {
            Current.Value = null;
        }

        public static void SetExecutionTimeout(int seconds)
        {
            var ctx = Current.Value;
            if (ctx == null) return;
            ctx._timeoutSeconds = seconds;
            ctx._executionDeadline = DateTime.Now.AddSeconds(seconds);
        }

        /// <summary>
        /// Sets this execution's wall-clock budget and arms the deadline from NOW.
        /// <para>
        /// Distinct from <see cref="SetExecutionTimeout"/>, which is the SCRIPT-FACING escape hatch
        /// and needs a live context. This is the HOST's call: it runs before the snippet, so the
        /// budget is correct from the first loop iteration, and it re-arms the deadline so a
        /// budget left behind by an earlier submission cannot leak into this one.
        /// </para>
        /// <para>
        /// ⚠ A budget only has teeth if something calls <see cref="CheckTimeout"/> — the
        /// TimeoutRewriter injects it into loop bodies. Arming a deadline with no injection is
        /// what made the REPL path look protected while it was not (see ReplSessionManager).
        /// </para>
        /// </summary>
        public void SetTimeoutBudget(int seconds)
        {
            if (seconds <= 0) return;
            _timeoutSeconds = seconds;
            _executionDeadline = DateTime.Now.AddSeconds(seconds);
        }

        public static void CheckTimeout()
        {
            var ctx = Current.Value;
            if (ctx != null && DateTime.Now > ctx._executionDeadline)
            {
                throw new TimeoutException($"🛑 Script execution timed out after {ctx._timeoutSeconds} seconds. If this script needs more time, add SetExecutionTimeout(seconds) at the start of your script.");
            }
        }

        private ICoreScriptContext _context;
        public Dictionary<string, object> Parameters { get; }
        public Dictionary<string, object> RawParameters { get; }
        public Dictionary<string, IEnumerable<object>> ResolutionPools { get; } = new Dictionary<string, IEnumerable<object>>();

        public Output Output { get; private set; }
        public IParameterHydrator Hydrator { get; }
        public Guid ExecutionId { get; } = Guid.NewGuid();

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


        // Visualization Globals
        public void Show(object data)
        {
            Output.Table(data);
        }

        public void Table(object data)
        {
            Output.Table(data);
        }

        /// <summary>
        /// Renders a table and says whether it may be truncated.
        /// <para>
        /// ⚠ <paramref name="capExempt"/> means "every row matters" — a PARAMETER SCHEMA, where
        /// the list is the answer. The MCP summariser shows all rows for these and keeps its
        /// first-N cap for element dumps and grouped aggregates. Pass <c>true</c> only for
        /// discovery output; a 5,000-row element dump exempted from the cap floods the prompt.
        /// </para>
        /// </summary>
        public void Table(object data, bool capExempt)
        {
            Output.Table(data, capExempt);
        }

        public void BarGraph(object data)
        {
            Output.BarGraph(data);
        }

        public void PieGraph(object data)
        {
            Output.PieGraph(data);
        }

        public void LineGraph(object data)
        {
            Output.LineGraph(data);
        }



        /// <summary>
        /// Runs <paramref name="action"/> in one Revit transaction and RETURNS what it did.
        /// </summary>
        /// <param name="name">The transaction name — it appears in Revit's Undo menu.</param>
        /// <param name="action">The edits, given the current document.</param>
        /// <returns>
        /// A <see cref="TxReport"/>. ⚠ Read <see cref="TxReport.RolledBack"/>: Revit answers a
        /// refused edit by ROLLING THE TRANSACTION BACK and returning a status rather than
        /// throwing, so a call that returns normally can still have changed nothing.
        /// </returns>
        public TxReport Transact(string name, Action<Document> action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return new TxReport
                {
                    Name = name,
                    Skipped = true,
                    SkipReason = "read-only mode (e.g. computing parameter options)"
                };
            }

            return Doc != null
                ? Tx.Transact(Doc, name, action)
                : new TxReport
                {
                    Name = name,
                    Skipped = true,
                    SkipReason = "there is no active document"
                };
        }

        /// <summary>
        /// Runs <paramref name="action"/> in one Revit transaction and RETURNS what it did.
        /// </summary>
        /// <param name="name">The transaction name — it appears in Revit's Undo menu.</param>
        /// <param name="action">The edits.</param>
        /// <returns>A <see cref="TxReport"/>. ⚠ Read <see cref="TxReport.RolledBack"/>.</returns>
        public TxReport Transact(string name, Action action)
        {
            if (_context.IsReadOnly)
            {
                _context.Println($"⚠️ Skipping transaction '{name}' because execution is in Read-Only mode (e.g., computing parameter options).");
                return new TxReport
                {
                    Name = name,
                    Skipped = true,
                    SkipReason = "read-only mode (e.g. computing parameter options)"
                };
            }

            return Doc != null
                ? Tx.Transact(Doc, name, action)
                : new TxReport
                {
                    Name = name,
                    Skipped = true,
                    SkipReason = "there is no active document"
                };
        }
    }
}
