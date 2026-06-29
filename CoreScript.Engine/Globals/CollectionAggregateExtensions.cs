using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Collection aggregation — SumParam, OrderByParam, GroupByParam, and helpers.
    /// </summary>
    public static partial class CollectionExtensions
    {
        /// <summary>
        /// Sums a numeric parameter across a typed collection.
        /// Unit is optional — when omitted, a sensible default is inferred
        /// from the parameter name (Volume→m3, Area→m2, Length/Height→m, etc.).
        /// Decimals defaults to 3 (standard metric precision).
        ///
        /// Sums raw internal values first, then converts and rounds once —
        /// no per-element rounding loss.
        /// </summary>
        public static double SumParam<T>(this IEnumerable<T> elements, string name, string unit = null, int decimals = 3)
            where T : Element
        {
            var resolvedUnit = unit ?? InferUnit(name);
            var rawSum = elements.Sum(e => e.GetNum(name));
            return rawSum.OutputUnit(resolvedUnit, decimals);
        }

        /// <summary>
        /// Infers a default metric unit from a parameter name.
        /// </summary>
        private static string InferUnit(string paramName)
        {
            var n = paramName.ToLowerInvariant();
            if (n.Contains("volume")) return "m3";
            if (n.Contains("area")) return "m2";
            if (n.Contains("length") || n.Contains("height")
                || n.Contains("width") || n.Contains("depth")
                || n.Contains("perimeter") || n.Contains("elevation"))
                return "m";
            if (n.Contains("thickness") || n.Contains("diameter")
                || n.Contains("radius") || n.Contains("sill"))
                return "mm";
            return "m3"; // fallback
        }

        // ── SORTING ───────────────────────────────────────────────────────

        /// <summary>
        /// Sorts ascending by a Revit parameter or C# property value.
        /// Automatically uses numeric sorting for Double/Integer parameters.
        /// </summary>
        public static IEnumerable<T> OrderByParam<T>(this IEnumerable<T> elements, string name)
            where T : class
        {
            var list = elements.ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            bool isNumeric = IsNumericParamGeneric(list, name);

            return isNumeric
                ? list.OrderBy(e => GetNumGeneric(e, name))
                : list.OrderBy(e => GetStrGeneric(e, name));
        }

        /// <summary>
        /// Sorts descending by a Revit parameter or C# property value.
        /// </summary>
        public static IEnumerable<T> OrderByParamDesc<T>(this IEnumerable<T> elements, string name)
            where T : class
        {
            var list = elements.ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            bool isNumeric = IsNumericParamGeneric(list, name);

            return isNumeric
                ? list.OrderByDescending(e => GetNumGeneric(e, name))
                : list.OrderByDescending(e => GetStrGeneric(e, name));
        }

        private static bool IsNumericParamGeneric<T>(List<T> elements, string name) where T : class
        {
            var first = elements.FirstOrDefault();
            if (first == null) return false;

            if (first is Element e)
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                    p = e.get_Parameter(bip);
                if (p != null)
                    return p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer;
            }

            var prop = first.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
            if (prop != null)
            {
                var t = prop.PropertyType;
                return t == typeof(double) || t == typeof(float) || t == typeof(int) || t == typeof(long) || t == typeof(decimal);
            }

            return false;
        }

        private static double GetNumGeneric<T>(T item, string name) where T : class
        {
            if (item is Element e) return e.GetNum(name);

            var prop = item.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
            if (prop != null)
            {
                var val = prop.GetValue(item);
                if (val is double d) return d;
                if (val is float f) return (double)f;
                if (val is int i) return (double)i;
                if (val is long l) return (double)l;
                if (val is decimal dec) return (double)dec;
            }
            return 0;
        }

        private static string GetStrGeneric<T>(T item, string name) where T : class
        {
            if (item is Element e) return e.GetStr(name);

            var prop = item.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
            if (prop != null)
            {
                return prop.GetValue(item)?.ToString() ?? "";
            }
            return "";
        }

        // ── GROUPING ──────────────────────────────────────────────────────

        /// <summary>
        /// Groups by a parameter and renders a summary table (Group, Count).
        /// </summary>
        public static IEnumerable<object> GroupByParam<T>(this IEnumerable<T> elements, string groupBy)
            where T : class
        {
            var results = elements
                .GroupBy(e => GetStrGeneric(e, groupBy))
                .OrderBy(g => g.Key)
                .Select(g =>
                {
                    dynamic obj = new System.Dynamic.ExpandoObject();
                    obj.Group = g.Key;
                    obj.Count = g.Count();
                    return (object)obj;
                }).ToList();
            ExecutionGlobals.TrackPipeline(results.Count);
            return results;
        }

        /// <summary>
        /// Groups by a parameter and sums a numeric parameter per group.
        /// </summary>
        public static IEnumerable<object> GroupByParam<T>(this IEnumerable<T> elements, string groupBy, string sum, string unit = "")
            where T : class
        {
            var results = elements
                .GroupBy(e => GetStrGeneric(e, groupBy))
                .OrderBy(g => g.Key)
                .Select(g =>
                {
                    dynamic obj = new System.Dynamic.ExpandoObject();
                    obj.Group = g.Key;
                    obj.Count = g.Count();
                    obj.Total = Math.Round(g.Sum(e =>
                    {
                        if (e is Element el) return el.GetNum(sum, string.IsNullOrEmpty(unit) ? "ft" : unit);
                        return GetNumGeneric(e, sum);
                    }), 3);
                    return (object)obj;
                }).ToList();
            ExecutionGlobals.TrackPipeline(results.Count);
            return results;
        }
    }
}
