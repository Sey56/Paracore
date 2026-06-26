using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Bulk parameter setters — SetParam with value, unit, and factory overloads.
    /// </summary>
    public static partial class CollectionExtensions
    {
        /// <summary>
        /// Sets a parameter on every element in the collection in a single transaction.
        /// </summary>
        public static IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, object value)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return list; }
            var doc = list.First().Document;
            void Action() { foreach (var e in list) e.SetVal(name, value); }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, $"Set {name}", Action);
                ExecutionGlobals.TrackPipeline(-3);
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; }
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element, converting the value from the specified unit.
        /// </summary>
        public static IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, object value, string unit)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return list; }
            var doc = list.First().Document;
            void Action() { foreach (var e in list) e.SetVal(name, value, unit); }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, $"Set {name}", Action);
                ExecutionGlobals.TrackPipeline(-3);
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; }
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element dynamically using a function.
        /// </summary>
        public static IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, Func<T, object> valueFactory)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return list; }
            var doc = list.First().Document;
            void Action() { foreach (var e in list) e.SetVal(name, valueFactory(e)); }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, $"Set {name}", Action);
                ExecutionGlobals.TrackPipeline(-3);
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; }
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element dynamically using a function with the element index.
        /// </summary>
        public static IEnumerable<T> SetParam<T>(this IEnumerable<T> elements, string name, Func<T, int, object> valueFactory)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return list; }
            var doc = list.First().Document;
            void Action()
            {
                for (int idx = 0; idx < list.Count; idx++)
                {
                    var e = list[idx];
                    e.SetVal(name, valueFactory(e, idx));
                }
            }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, $"Set {name}", Action);
                ExecutionGlobals.TrackPipeline(-3);
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; }
            return list;
        }
    }
}
