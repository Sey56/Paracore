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

    public class Output
    {
        // ══ Structured-output ROUTING KEYS ═══════════════════════════════════
        // ⚠ These strings are a WIRE CONTRACT, not labels. They are serialized
        // into the structured-output payload and switched on by the UI, so
        // changing one raises NO compile error anywhere — it silently changes
        // what the UI renders (a chart becomes a bare word, or nothing).
        // Keep in sync with the TypeScript consumers:
        //   rap-web/src/components/layout/OutputPanel/OutputPanel.tsx:32
        //   rap-web/src/features/automation/components/ScriptInspector/
        //       StructuredOutputViewer.tsx:675,712,724,728

        /// <summary>Interactive data grid. Consumed as <c>type === 'table'</c>.</summary>
        public const string TypeTable = "table";

        /// <summary>Bar chart.</summary>
        public const string TypeBarChart = "chart-bar";

        /// <summary>Pie chart.</summary>
        public const string TypePieChart = "chart-pie";

        /// <summary>Line chart.</summary>
        public const string TypeLineChart = "chart-line";

        /// <summary>Prefix shared by every chart type (used for the pipeline marker).</summary>
        public const string ChartPrefix = "chart";

        private readonly ICoreScriptContext _context;

        public Output(ICoreScriptContext context)
        {
            _context = context;
        }

        public void Show(string type, object data)
        {
            // Only expand elements if we are rendering a table
            var toSerialize = MaterializeForSerialization(data, type == TypeTable);
            if (toSerialize == null)
            {
                return; // Suppress empty data structures entirely
            }
            var json = JsonSerializer.Serialize(toSerialize, ExecutionGlobals.SerializerOptions);
            _context.AddStructuredOutput(type, json);

            // Pipeline diagnostic: mark visualization as rendered
            // -1 = chart-type, -2 = table
            int marker = type.StartsWith(ChartPrefix) ? -1 : -2;
            ExecutionGlobals.TrackPipeline(marker);
        }

        /// <summary>
        /// Materializes lazy IEnumerables and converts anonymous types (from Roslyn scripting)
        /// to dictionaries so System.Text.Json can serialize them reliably.
        /// If expandElements is true, it also detects homogeneous Revit element collections
        /// and automatically extracts ALL parameters as columns.
        /// </summary>
        private static object MaterializeForSerialization(object data, bool expandElements = false)
        {
            if (data == null || data is string || data is byte[])
            {
                return data;
            }

            if (data is System.Collections.IEnumerable enumerable)
            {
                // 1. Materialize to a list immediately to avoid double-iteration issues
                var items = new List<object>();
                foreach (var item in enumerable)
                {
                    if (item != null) items.Add(item);
                }

                if (items.Count == 0) return null;

                // 2. Try Smart Expansion for Revit Elements
                if (expandElements)
                {
                    // Filter out deleted/invalid elements to prevent serialization crashes
                    var elements = items.OfType<Element>().Where(e => e.IsValidObject).ToList();
                    
                    // Only expand if the WHOLE collection is Revit elements (ignoring invalid ones)
                    if (elements.Count > 0 && elements.Count == items.OfType<Element>().Count())
                    {
                        var first = elements[0];
                        var firstCatId = first.Category?.Id?.Value;
                        
                        // Check homogeneity on a small sample for performance
                        bool isHomogeneous = elements.Take(5).All(e => e.Category?.Id?.Value == firstCatId);

                        if (isHomogeneous)
                        {
                            // DYNAMIC DISCOVERY: Extract ALL parameter names from the first element and its Type.
                            // Since all elements share the same category, they share the same parameter set.
                            var paramNames = first.Parameters.Cast<Parameter>()
                                .Where(p => p.HasValue)
                                .Select(p => p.Definition.Name)
                                .ToList();

                            var typeId = first.GetTypeId();
                            if (typeId != null && typeId != ElementId.InvalidElementId)
                            {
                                var elementType = first.Document.GetElement(typeId);
                                if (elementType != null)
                                {
                                    paramNames.AddRange(elementType.Parameters.Cast<Parameter>()
                                        .Where(p => p.HasValue)
                                        .Select(p => p.Definition.Name));
                                }
                            }

                            var schema = paramNames
                                .Distinct()
                                .OrderBy(n => n)
                                .ToList();

                            // CAPTURE DATA: Id + Name + every parameter value
                            var resultList = new List<object>();
                            foreach (var el in elements)
                            {
                                var row = new Dictionary<string, object>
                                {
                                    ["Id"] = el.Id.Value,
                                    ["Name"] = el.Name,
                                };

                                foreach (var key in schema)
                                {
                                    try
                                    {
                                        row[key] = el.GetVal(key);
                                    }
                                    catch { row[key] = "-"; }
                                }
                                resultList.Add(row);
                            }
                            return resultList;
                        }
                    }
                }

                // 3. Fallback: Standard Materialization (handles anonymous types)
                var list = new List<object>();
                foreach (var item in items)
                {
                    // Skip deleted elements
                    if (item is Element el && !el.IsValidObject) continue;

                    var itemType = item.GetType();

                    // BIM-FIX: If we are rendering a table (expandElements=true) and the data is a 
                    // simple primitive (string, enum, int), wrap it in an object so the UI 
                    // shows a "Value" column instead of splitting the string into letters.
                    if (expandElements && (itemType.IsPrimitive || itemType == typeof(string) || itemType.IsEnum))
                    {
                        list.Add(new Dictionary<string, object> { ["Value"] = item.ToString() });
                        continue;
                    }

                    bool isAnonymous = itemType.Name.StartsWith("<>") &&
                                       itemType.IsDefined(typeof(System.Runtime.CompilerServices.CompilerGeneratedAttribute), false);

                    if (isAnonymous)
                    {
                        var dict = new Dictionary<string, object>();
                        foreach (var prop in itemType.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
                        {
                            dict[prop.Name] = prop.GetValue(item);
                        }
                        list.Add(dict);
                    }
                    else
                    {
                        list.Add(item);
                    }
                }

                return list.Count == 0 ? null : list;
            }

            return data;
        }

        public void BarGraph(object data)
        {
            Show(TypeBarChart, data);
        }

        public void PieGraph(object data)
        {
            Show(TypePieChart, data);
        }

        public void Table(object data)
        {
            Show(TypeTable, data);
        }

        public void LineGraph(object data)
        {
            Show(TypeLineChart, data);
        }

        /// <summary>
        /// Adapts a Revit element collection to the compact table shape
        /// (Id | Family | Type | Category), choosing the type-vs-instance parameter names.
        /// Returns <c>null</c> for an empty collection.
        /// <para>THE single implementation for both table entry points — the static
        /// <c>ScriptApi.Table(IEnumerable&lt;Element&gt;)</c> overload and the <c>.Table()</c>
        /// extension used to carry a copy each, and the two could drift.</para>
        /// </summary>
        internal static object? AdaptElementsForTable(IEnumerable<Element> elements)
        {
            var list = elements.ToList();
            if (list.Count == 0)
            {
                return null;
            }

            // Types / Symbols: FamilySymbol, WallType, FloorType, etc.
            // Instances:       FamilyInstance, Wall, Floor, etc.
            if (list[0] is ElementType)
            {
                return list.Select(e => (object)new
                {
                    Id = e.Id.Value,
                    Family = e.GetStr("Family Name"),
                    Type = e.GetStr("Type Name"),
                    Category = e.Category?.Name ?? ""
                });
            }

            return list.Select(e => (object)new
            {
                Id = e.Id.Value,
                Family = e.GetStr("Family"),
                Type = e.GetStr("Type"),
                Category = e.Category?.Name ?? ""
            });
        }
    }
}
