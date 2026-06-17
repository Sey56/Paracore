using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// An IEnumerable&lt;T&gt; wrapper that shadows standard LINQ filtering
    /// methods with pipeline-aware versions.  C# resolves instance methods
    /// before <c>System.Linq</c> extension methods, so chaining
    /// <c>.Where()</c> on a <c>PipelineEnumerable&lt;T&gt;</c>
    /// automatically reports the element count to
    /// <c>ExecutionGlobals.PipelineDiagnostics</c>.
    /// </summary>
    /// <example>
    /// <code>
    /// GetElements&lt;Wall&gt;()
    ///     .Where(w => w.WallType.Kind != WallKind.Curtain)
    ///     .GroupByParam("Base Constraint", "Area", "m2")
    ///     .Table();
    /// // Pipeline: [593 → 29 → 9 → table]
    /// </code>
    /// </example>
    public class PipelineEnumerable<T> : IEnumerable<T>
    {
        private readonly List<T> _items;

        /// <summary>
        /// True when this instance has already pushed its count to PipelineDiagnostics.
        /// Prevents TrackEnumerable from double-tracking wrapped PipelineEnumerable results.
        /// </summary>
        internal bool AlreadyTracked { get; set; }

        /// <summary>
        /// Wrap an existing sequence.  Elements are realised immediately
        /// so the count is known for pipeline reporting.
        /// </summary>
        public PipelineEnumerable(IEnumerable<T> source)
        {
            _items = source as List<T> ?? source.ToList();
        }

        /// <summary>
        /// Wrap and optionally push the initial count into the pipeline.
        /// </summary>
        internal PipelineEnumerable(IEnumerable<T> source, bool track)
        {
            _items = source as List<T> ?? source.ToList();
            if (track)
            {
                ExecutionGlobals.Current.Value?.PipelineDiagnostics.Add(_items.Count);
                AlreadyTracked = true;
            }
        }

        /// <summary>
        /// Filters the sequence and reports the remaining element count
        /// to <c>PipelineDiagnostics</c>.
        /// </summary>
        public PipelineEnumerable<T> Where(Func<T, bool> predicate)
        {
            var filtered = new PipelineEnumerable<T>(_items.Where(predicate));
            ExecutionGlobals.Current.Value?.PipelineDiagnostics.Add(filtered._items.Count);
            filtered.AlreadyTracked = true;
            return filtered;
        }

        /// <summary>
        /// Indexed overload — same filtering + pipeline reporting.
        /// </summary>
        public PipelineEnumerable<T> Where(Func<T, int, bool> predicate)
        {
            var filtered = new PipelineEnumerable<T>(_items.Where(predicate));
            ExecutionGlobals.Current.Value?.PipelineDiagnostics.Add(filtered._items.Count);
            filtered.AlreadyTracked = true;
            return filtered;
        }

        // ── IEnumerable<T> ────────────────────────────────────────────

        public IEnumerator<T> GetEnumerator() => _items.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

        /// <summary>Expose the realised count without re-enumeration.</summary>
        public int Count => _items.Count;
    }
}
