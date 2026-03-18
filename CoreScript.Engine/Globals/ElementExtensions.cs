using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    public static class ElementExtensions
    {
        /// <summary> 
        /// Gets the parameter value as a string. 
        /// Smart: Resolves ElementId names, handles Strings, falls back to C# Properties (Reflection), 
        /// and finally formatted ValueStrings.
        /// </summary>
        public static string GetStr(this Element e, string name)
        {
            if (e == null || string.IsNullOrEmpty(name)) return "";

            // 1. Try BuiltInParameter name match FIRST (Surgical precision: "ROOM_LEVEL_ID")
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null) return FormatParamValue(e, bp);
            }

            // 2. Try standard name lookup ("Level")
            var p = e.LookupParameter(name);
            if (p != null) return FormatParamValue(e, p);

            // 3. Smart Fallback: Try C# Property via Reflection (Room.Level, Wall.Width, etc.)
            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val == null) return "";
                    if (val is Element re) return re.Name;
                    if (val is ElementId id) return e.Document.GetElement(id)?.Name ?? "";
                    
                    // NEW: If the property is a double (like Wall.Width), it's almost certainly in Internal Units (Feet).
                    // We should format it using the document's unit settings so it matches the UI.
                    if (val is double d)
                    {
                        try
                        {
                            // We use a general spec (Length) as a fallback for reflection properties
                            // because most properties the user asks for (Width, Height, Offset) are Lengths.
                            // In Revit 2025, UnitUtils.Format is replaced by UnitFormatUtils.Format
                            return UnitFormatUtils.Format(e.Document.GetUnits(), SpecTypeId.Length, d, false);
                        }
                        catch { return d.ToString("F3"); }
                    }

                    return val.ToString() ?? "";
                }
            }
            catch { }

            return "";
        }

        private static string FormatParamValue(Element e, Parameter p)
        {
            switch (p.StorageType)
            {
                case StorageType.String:
                    return p.AsString() ?? "";
                case StorageType.ElementId:
                    var id = p.AsElementId();
                    if (id == null || id == ElementId.InvalidElementId)
                    {
                        var vs = p.AsValueString();
                        return !string.IsNullOrEmpty(vs) ? vs : "";
                    }
                    var refEl = e.Document.GetElement(id);
                    if (refEl == null)
                    {
                        var cat = Category.GetCategory(e.Document, id);
                        if (cat != null) return cat.Name;
                        return "";
                    }
                    return refEl.Name;
                case StorageType.Double:
                case StorageType.Integer:
                    var valStr = p.AsValueString();
                    if (!string.IsNullOrEmpty(valStr)) return valStr;

                    // WYSIWYG 2.0: Handle Boolean parameters stored as integers (0/1)
                    if (p.StorageType == StorageType.Integer && p.Definition is InternalDefinition intDef && intDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                    {
                        return p.AsInteger() == 1 ? "True" : "False";
                    }

                    return p.StorageType == StorageType.Double ? p.AsDouble().ToString() : p.AsInteger().ToString();
                default:
                    return "";
            }
        }

        /// <summary> Gets the parameter value converted to a specific unit as a string (no suffix). </summary>
        public static string GetStr(this Element e, string name, string unit)
        {
            if (e == null) return "";
            return e.GetNum(name).FormatValueOnly(unit);
        }

        /// <summary> Gets the parameter value as a double (Internal Units). Falls back to C# Property. </summary>
        public static double GetNum(this Element e, string name)
        {
            if (e == null) return 0.0;

            // 1. Try BIP first
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null) return bp.AsDouble();
            }

            // 2. Standard lookup
            var p = e.LookupParameter(name);
            if (p != null) return p.AsDouble();

            // 3. Reflection fallback
            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val is double d) return d;
                    if (val is float f) return (double)f;
                    if (val is int i) return (double)i;
                }
            }
            catch { }

            return 0.0;
        }

        /// <summary> Gets the parameter value as an integer. Falls back to C# Property. </summary>
        public static int GetInt(this Element e, string name)
        {
            if (e == null) return 0;

            // 1. Try BIP first
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null) return bp.AsInteger();
            }

            // 2. Standard lookup
            var p = e.LookupParameter(name);
            if (p != null) return p.AsInteger();

            // 3. Reflection fallback
            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val is int i) return i;
                    if (val is bool b) return b ? 1 : 0;
                }
            }
            catch { }

            return 0;
        }

        /// <summary> 
        /// Gets the formatted value string exactly as seen in the Revit Properties palette.
        /// </summary>
        public static string GetVal(this Element e, string name)
        {
            if (e == null || string.IsNullOrEmpty(name)) return "-";

            var p = e.LookupParameter(name);
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                p = e.get_Parameter(bip);
            }

            if (p != null)
            {
                var formatted = p.AsValueString();
                if (!string.IsNullOrEmpty(formatted)) return formatted;
            }

            // Fallback to Smart GetStr (handles Reflection and ElementId names)
            var fallback = e.GetStr(name);
            return string.IsNullOrEmpty(fallback) ? "-" : fallback;
        }

        /// <summary> Gets the formatted value string in a specific unit (with suffix). </summary>
        public static string GetVal(this Element e, string name, string unit)
        {
            if (e == null) return "-";
            return e.GetNum(name).FormatUnit(unit);
        }

        /// <summary>
        /// Gets all BUILT-IN parameters of the element as a list of objects (Name, BIP, Value).
        /// Ideal for REPL discovery: Table(myWall.AllBuiltInParams())
        /// </summary>
        public static IEnumerable<object> AllBuiltInParams(this Element e)
        {
            if (e == null) return new List<object>();

            return e.Parameters.Cast<Parameter>()
                .Where(p => p.Definition is InternalDefinition)
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    BIP = ((InternalDefinition)p.Definition).BuiltInParameter.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name);
        }

        /// <summary>
        /// Gets all parameters of the element as a list of objects (Name, Storage, Value).
        /// Ideal for REPL exploration: Table(myWall.AllParams())
        /// </summary>
        public static IEnumerable<object> AllParams(this Element e)
        {
            if (e == null) return new List<object>();

            return e.Parameters.Cast<Parameter>()
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    Storage = p.StorageType.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name);
        }

        /// <summary>
        /// Gets all parameters of the element's TYPE as a list of objects.
        /// </summary>
        public static IEnumerable<object> TypeParams(this Element e)
        {
            var typeId = e?.GetTypeId();
            if (typeId == null || typeId == ElementId.InvalidElementId) 
                return new List<object>();
            
            var type = e.Document.GetElement(typeId);
            return type.AllParams();
        }

        /// <summary>
        /// Gets all parameters of the element as a dictionary (Name -> FormattedValue).
        /// </summary>
        public static Dictionary<string, string> ParamsDict(this Element e)
        {
            var dict = new Dictionary<string, string>();
            if (e == null) return dict;

            foreach (Parameter p in e.Parameters)
            {
                if (p == null || !p.HasValue) continue;
                dict[p.Definition.Name] = e.GetVal(p.Definition.Name);
            }

            return dict;
        }

        /// <summary>
        /// Gets a summary of the most important Revit API properties (Category, Level, Workset, etc.)
        /// </summary>
        public static IEnumerable<object> AllProperties(this Element e)
        {
            if (e == null) return new List<object>();

            var props = new List<object>();
            void Add(string name, object val) => props.Add(new { Property = name, Value = val?.ToString() ?? "-" });

            Add("Name", e.Name);
            Add("Id", e.Id.Value);
            Add("Category", e.Category?.Name);
            Add("Class", e.GetType().Name);
            Add("Level", e.Document.GetElement(e.LevelId)?.Name);
            Add("Workset", e.Document.GetWorksetTable().GetWorkset(e.WorksetId)?.Name);
            Add("Design Option", e.DesignOption?.Name);
            Add("Is Editable", e.Document.IsWorkshared ? (object)WorksharingUtils.GetCheckoutStatus(e.Document, e.Id) : "N/A");
            Add("Owner", e.Document.IsWorkshared ? (object)WorksharingUtils.GetModelUpdatesStatus(e.Document, e.Id) : "N/A");
            Add("Group", e.GroupId != ElementId.InvalidElementId ? (object)e.Document.GetElement(e.GroupId)?.Name : null);
            Add("Pinned", e.Pinned);

            if (e.Location is LocationPoint lp) Add("Location", $"Point ({Math.Round(lp.Point.X, 2)}, {Math.Round(lp.Point.Y, 2)}, {Math.Round(lp.Point.Z, 2)})");
            else if (e.Location is LocationCurve lc) Add("Location", $"Curve (Length: {Math.Round(lc.Curve.Length, 2)})");

            return props;
        }

        /// <summary>
        /// Gets a summary of the element's geometry (Solids, Surfaces, Volumes).
        /// </summary>
        public static IEnumerable<object> AllGeometry(this Element e)
        {
            if (e == null) return new List<object>();

            var results = new List<object>();
            var opt = new Options { DetailLevel = ViewDetailLevel.Fine };
            var geo = e.get_Geometry(opt);

            if (geo == null) return results;

            int solidCount = 0;
            double totalVolume = 0;
            double totalArea = 0;

            void Process(GeometryElement g)
            {
                foreach (var obj in g)
                {
                    if (obj is Solid s && s.Volume > 0.00001)
                    {
                        solidCount++;
                        totalVolume += s.Volume;
                        totalArea += s.SurfaceArea;
                    }
                    else if (obj is GeometryInstance inst)
                    {
                        Process(inst.GetInstanceGeometry());
                    }
                }
            }

            Process(geo);

            results.Add(new { Metric = "Solid Count", Value = solidCount.ToString() });
            results.Add(new { Metric = "Total Volume", Value = Math.Round(totalVolume, 4).ToString() + " CF" });
            results.Add(new { Metric = "Total Area", Value = Math.Round(totalArea, 4).ToString() + " SF" });

            return results;
        }

        /// <summary>
        /// Gets the parameter value as a double and converts it FROM internal units to target units.
        /// </summary>
        public static double GetNum(this Element e, string name, string unit)
        {
            return e.GetNum(name).OutputUnit(unit);
        }

        /// <summary>
        /// Sets a numeric parameter value, automatically converting FROM the specified unit.
        /// Wraps in a transaction named "Update Parameter" if one isn't already active.
        /// </summary>
        public static void SetNum(this Element e, string name, double value, string unit)
        {
            if (e == null) return;

            void Action()
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                {
                    p = e.get_Parameter(bip);
                }

                if (p != null && p.StorageType == StorageType.Double)
                {
                    p.Set(value.InputUnit(unit));
                }
            }

            if (e.Document.IsModifiable)
            {
                Action();
            }
            else
            {
                Tx.Transact(e.Document, $"Set {name}", Action);
            }
        }

        /// <summary>
        /// THE SMART SETTER. Automatically handles:
        /// 1. Double/Int -> SetNum/Set
        /// 2. String with units (e.g. "500 mm") -> SetValueString
        /// 3. String Name -> Tries to resolve to ElementId (for Levels/Types)
        /// 4. String -> Standard String set
        /// </summary>
        public static void SetVal(this Element e, string name, object value)
        {
            if (e == null || value == null) return;

            void Action()
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                {
                    p = e.get_Parameter(bip);
                }

                if (p == null) return;

                // 1. Double/Numeric
                if (value is double d) { p.Set(d); return; }
                if (value is int i) { p.Set(i); return; }

                // 2. String
                if (value is string s)
                {
                    // A. Tries SetValueString (handles "500 mm")
                    if (p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer)
                    {
                        if (p.SetValueString(s)) return;
                    }

                    // B. Storage is ElementId: Try resolving name
                    if (p.StorageType == StorageType.ElementId)
                    {
                        var found = new FilteredElementCollector(e.Document)
                            .WhereElementIsNotElementType()
                            .FirstOrDefault(el => el.Name.Equals(s, StringComparison.OrdinalIgnoreCase));
                        
                        if (found == null) // Try Types
                        {
                            found = new FilteredElementCollector(e.Document)
                                .WhereElementIsElementType()
                                .FirstOrDefault(el => el.Name.Equals(s, StringComparison.OrdinalIgnoreCase));
                        }

                        if (found != null) { p.Set(found.Id); return; }
                        
                        // Try ElementId parsing
                        if (long.TryParse(s, out var idVal)) { p.Set(new ElementId(idVal)); return; }
                    }

                    // C. Fallback: Standard String Set
                    p.Set(s);
                }
            }

            if (e.Document.IsModifiable) Action();
            else Tx.Transact(e.Document, $"Set {name}", Action);
        }

        // --- Fluent View Commands ---

        public static Element Select(this Element e)
        {
            if (e == null) return e;
            var uidoc = new UIApplication(e.Document.Application).ActiveUIDocument;
            if (uidoc != null) uidoc.Selection.SetElementIds(new List<ElementId> { e.Id });
            return e;
        }

        public static Element Zoom(this Element e)
        {
            if (e == null) return e;
            var uidoc = new UIApplication(e.Document.Application).ActiveUIDocument;
            if (uidoc != null) uidoc.ShowElements(e);
            return e;
        }

        public static Element Isolate(this Element e)
        {
            if (e == null) return e;
            var view = e.Document.ActiveView;
            if (view != null && view.CanEnableTemporaryViewPropertiesMode())
            {
                Tx.Transact(e.Document, "Isolate Element", () => {
                    view.IsolateElementTemporary(e.Id);
                });
            }
            return e;
        }

        public static void Delete(this Element e)
        {
            if (e == null) return;
            Tx.Transact(e.Document, "Delete Element", () => e.Document.Delete(e.Id));
        }

        public static Element Hide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null && e.CanBeHidden(view))
            {
                Tx.Transact(e.Document, "Hide Element", () => view.HideElements(new List<ElementId> { e.Id }));
            }
            return e;
        }

        public static Element Unhide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null)
            {
                Tx.Transact(e.Document, "Unhide Element", () => view.UnhideElements(new List<ElementId> { e.Id }));
            }
            return e;
        }
    }

    public static class IdentityExtensions
    {
        public static Element ToElement(this long id, Document doc) => doc.GetElement(new ElementId(id));
        public static Element ToElement(this int id, Document doc) => doc.GetElement(new ElementId(id));
        public static Element ToElement(this ElementId id, Document doc) => doc.GetElement(id);
    }

    public static class CollectionExtensions
    {
        public static IEnumerable<Element> WhereParam(this IEnumerable<Element> elements, string name, string value)
        {
            return elements.Where(e => e.GetStr(name).Equals(value, StringComparison.OrdinalIgnoreCase));
        }

        public static double SumParam(this IEnumerable<Element> elements, string name, string unit)
        {
            return elements.Sum(e => e.GetNum(name, unit));
        }

        public static IEnumerable<Element> Select(this IEnumerable<Element> elements)
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.Selection.SetElementIds(list.Select(e => e.Id).ToList());
            }
            return list;
        }

        public static IEnumerable<Element> Zoom(this IEnumerable<Element> elements)
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.ShowElements(list.Select(e => e.Id).ToList());
            }
            return list;
        }
    }
}
