using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class ElementExtensions
    {
        /// <summary> 
        /// Gets the parameter value as a string. 
        /// Smart: Resolves ElementId names, handles Strings, and falls back to formatted ValueStrings.
        /// </summary>
        public static string GetStr(this Element e, string name)
        {
            if (string.IsNullOrEmpty(name)) return "";

            // 1. Try standard lookup
            var p = e.LookupParameter(name);

            // 2. Fallback: Try BuiltInParameter name match if not found
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                p = e.get_Parameter(bip);
            }

            if (p == null) return "";

            switch (p.StorageType)
            {
                case StorageType.String:
                    return p.AsString() ?? "";
                case StorageType.ElementId:
                    var id = p.AsElementId();
                    if (id == null || id == ElementId.InvalidElementId) return "";
                    // Special case for Category or similar references
                    return e.Document.GetElement(id)?.Name ?? "";
                case StorageType.Double:
                case StorageType.Integer:
                    // Try formatted string first (e.g. "150 mm")
                    var valStr = p.AsValueString();
                    if (!string.IsNullOrEmpty(valStr)) return valStr;
                    // Otherwise raw value
                    return p.StorageType == StorageType.Double ? p.AsDouble().ToString() : p.AsInteger().ToString();
                default:
                    return "";
            }
        }

        /// <summary> Gets the parameter value as a double (Internal Units) by its name. </summary>
        public static double GetNum(this Element e, string name)
        {
            var p = e.LookupParameter(name);
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                p = e.get_Parameter(bip);

            return p?.AsDouble() ?? 0.0;
        }

        /// <summary> Gets the parameter value as an integer by its name. </summary>
        public static int GetInt(this Element e, string name)
        {
            var p = e.LookupParameter(name);
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                p = e.get_Parameter(bip);

            return p?.AsInteger() ?? 0;
        }

        /// <summary> 
        /// Gets the formatted value string exactly as seen in the Revit Properties palette.
        /// Fallback: If Revit doesn't provide a formatted string, it uses the smart GetStr logic.
        /// </summary>
        public static string GetVal(this Element e, string name)
        {
            if (string.IsNullOrEmpty(name)) return "-";

            var p = e.LookupParameter(name);
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                p = e.get_Parameter(bip);

            if (p == null) return "-";

            var formatted = p.AsValueString();
            if (!string.IsNullOrEmpty(formatted)) return formatted;

            // Many parameters (String, ElementId) return null for AsValueString
            var fallback = e.GetStr(name);
            return string.IsNullOrEmpty(fallback) ? "-" : fallback;
        }

        /// <summary>
        /// Gets the parameter value as a double and converts it FROM internal units to target units.
        /// Example: e.GetNum("Area", "m2")
        /// </summary>
        public static double GetNum(this Element e, string name, string unit) => e.GetNum(name).FromUnits(unit);
    }
}
