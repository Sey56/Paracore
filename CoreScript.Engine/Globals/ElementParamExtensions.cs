using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter getters — GetStr, GetNum, GetInt, GetVal, and type-level variants.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Gets the parameter value as a string.
        /// Smart: Resolves ElementId names, handles Strings, falls back to C# Properties (Reflection),
        /// and finally formatted ValueStrings.
        /// </summary>
        public static string GetStr(this Element e, string name)
        {
            if (e == null || string.IsNullOrEmpty(name)) return "";

            // 1. Try BuiltInParameter name match FIRST
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return FormatParamValue(e, bp);
            }

            // 2. Try standard name lookup
            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return FormatParamValue(e, p);

            // 3. Smart Fallback: Try C# Property via Reflection
            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val == null) return "";
                    if (val is Element re) return re.Name;
                    if (val is ElementId id) return e.Document.GetElement(id)?.Name ?? "";

                    if (val is double d)
                    {
                        try
                        {
                            return UnitFormatUtils.Format(e.Document.GetUnits(), SpecTypeId.Length, d, false);
                        }
                        catch { return d.ToString("F3"); }
                    }

                    return val.ToString() ?? "";
                }
            }
            catch { }

            // 4. Type parameter fallback
            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null) return type.GetStr(name);
            }

            return "";
        }

        /// <summary> Gets the parameter value converted to a specific unit as a string (no suffix). </summary>
        public static string GetStr(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "";
            return e.GetNum(name).FormatValueOnly(unit, decimals);
        }

        /// <summary> Gets the parameter value as a double (Internal Units). Falls back to C# Property. </summary>
        public static double GetNum(this Element e, string name)
        {
            if (e == null) return 0.0;

            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return bp.AsDouble();
            }

            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return p.AsDouble();

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

            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null) return type.GetNum(name);
            }

            return 0.0;
        }

        /// <summary> Gets the parameter value as an integer. Falls back to C# Property. </summary>
        public static int GetInt(this Element e, string name)
        {
            if (e == null) return 0;

            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return bp.AsInteger();
            }

            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return p.AsInteger();

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

            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null) return type.GetInt(name);
            }

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
                if (p.StorageType == StorageType.String) return p.AsString() ?? "-";
            }

            var fallback = e.GetStr(name);
            if (!string.IsNullOrEmpty(fallback)) return fallback;

            var typeVal = e.GetTypeVal(name);
            return string.IsNullOrEmpty(typeVal) || typeVal == "-" ? "-" : typeVal;
        }

        /// <summary> Gets the formatted value string in a specific unit (with suffix). </summary>
        public static string GetVal(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "-";
            return e.GetNum(name).FormatUnit(unit, decimals);
        }

        /// <summary>
        /// Gets the parameter value as a double converted FROM internal units to target units.
        /// </summary>
        public static double GetNum(this Element e, string name, string unit, int decimals = 2)
        {
            return e.GetNum(name).OutputUnit(unit, decimals);
        }

        // ── Type parameter wrappers ──────────────────────────────────────

        public static Element GetElementType(this Element e)
        {
            var id = e?.GetTypeId();
            if (id == null || id == ElementId.InvalidElementId) return null;
            return e.Document.GetElement(id);
        }

        public static string GetTypeStr(this Element e, string name) => e.GetElementType()?.GetStr(name) ?? "";
        public static string GetTypeStr(this Element e, string name, string unit, int decimals = 2) => e.GetElementType()?.GetStr(name, unit, decimals) ?? "";
        public static double GetTypeNum(this Element e, string name) => e.GetElementType()?.GetNum(name) ?? 0.0;
        public static double GetTypeNum(this Element e, string name, string unit, int decimals = 2) => e.GetElementType()?.GetNum(name, unit, decimals) ?? 0.0;
        public static int GetTypeInt(this Element e, string name) => e.GetElementType()?.GetInt(name) ?? 0;
        public static string GetTypeVal(this Element e, string name) => e.GetElementType()?.GetVal(name) ?? "-";
        public static string GetTypeVal(this Element e, string name, string unit, int decimals = 2) => e.GetElementType()?.GetVal(name, unit, decimals) ?? "-";

        // ── Helpers ──────────────────────────────────────────────────────

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
                    // Prefer AsValueString for user-visible display values
                    // (e.g. "Family: Type" vs bare element Name).
                    var displayVal = p.AsValueString();
                    if (!string.IsNullOrEmpty(displayVal))
                        return displayVal;
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
                    // Yes/No checkbox — AsValueString is unreliable for 0.
                    // Return the raw integer so 0/1 works bidirectionally
                    // and displays correctly in tables.
                    if (p.Definition is InternalDefinition intDef
                        && intDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                        return p.AsInteger().ToString();

                    var valStr = p.AsValueString();
                    if (!string.IsNullOrEmpty(valStr)) return valStr;

                    return p.AsInteger().ToString();
                default:
                    return "";
            }
        }
    }
}
