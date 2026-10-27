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

    public static class VisualizationExtensions
    {
        public static Element Peek(this Element e)
        {
            if (e == null) return e;
            var snoopData = e.Parameters.Cast<Parameter>()
                .OrderBy(p => p.Definition.Name)
                .Select(p => new
                {
                    Parameter = p.Definition.Name,
                    Storage = p.StorageType.ToString(),
                    StringValue = e.GetStr(p.Definition.Name),
                    NumericValue = p.StorageType == StorageType.Double ? e.GetNum(p.Definition.Name).ToString("F4") : p.StorageType == StorageType.Integer ? e.GetInt(p.Definition.Name).ToString() : "-",
                    UIValue = p.AsValueString() ?? "-"
                });
            // ⚠ capExempt: this is a PARAMETER DUMP, not a data table. Cutting it after 50 rows
            //   would hide parameters from the agent, which then reports them as missing. Same
            //   reasoning as SchemaRows — see that type.
            ExecutionGlobals.Current.Value?.Table(snoopData, capExempt: true);
            return e;
        }

        public static IEnumerable<Element> Peek(this IEnumerable<Element> data)
        {
            if (data == null) return data;
            foreach (var e in data) if (e != null) e.Peek();
            return data;
        }

        public static IEnumerable<T> Show<T>(this IEnumerable<T> data)
        {
            ExecutionGlobals.Current.Value?.Table(data);
            return data;
        }

        public static IEnumerable<T> Table<T>(this IEnumerable<T> data)
        {
            // ⚠⚠ A PARAMETER SCHEMA IS NOT A DATA TABLE (2026-10-27). The MCP summariser keeps
            // the first 50 rows of a big table plus the last two — right for an element dump the
            // agent can narrow, wrong for "what parameters exist?", where the list IS the answer
            // and a cut list makes a real parameter look missing. SchemaRows is how the engine
            // says which it emitted; the flag travels to the MCP so it never has to guess from
            // column names. Checked FIRST, before the element branch below.
            if (data is SchemaRows schema)
            {
                ExecutionGlobals.Current.Value?.Table(schema, capExempt: true);
                return data;
            }

            // Raw elements → compact view with columns adapted to element kind.
            // Already-processed data (GroupByParam, Select, etc.) → render as-is.
            if (data is IEnumerable<Element> elements)
            {
                // Shared with the static ScriptApi.Table(IEnumerable<Element>) overload —
                // null means the collection was empty, so render nothing.
                var compact = Output.AdaptElementsForTable(elements);
                if (compact == null) return data;

                ExecutionGlobals.Current.Value?.Table(compact);
            }
            else
            {
                ExecutionGlobals.Current.Value?.Table(data);
            }
            return data;
        }

        public static IEnumerable<T> BarGraph<T>(this IEnumerable<T> data)
        {
            ExecutionGlobals.Current.Value?.BarGraph(data);
            return data;
        }

        public static IEnumerable<T> PieGraph<T>(this IEnumerable<T> data)
        {
            ExecutionGlobals.Current.Value?.PieGraph(data);
            return data;
        }

        public static IEnumerable<T> LineGraph<T>(this IEnumerable<T> data)
        {
            ExecutionGlobals.Current.Value?.LineGraph(data);
            return data;
        }
    }
}
