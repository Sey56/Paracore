using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class ElementExtensions
    {
        /// <summary> Gets the parameter value as a string by its name. </summary>
        public static string GetStr(this Element e, string name) => e.LookupParameter(name)?.AsString() ?? "";

        /// <summary> Gets the parameter value as a double (Internal Units) by its name. </summary>
        public static double GetNum(this Element e, string name) => e.LookupParameter(name)?.AsDouble() ?? 0.0;

        /// <summary> Gets the parameter value as an integer by its name. </summary>
        public static int GetInt(this Element e, string name) => e.LookupParameter(name)?.AsInteger() ?? 0;

        /// <summary> Gets the formatted value string of the parameter by its name. </summary>
        public static string GetVal(this Element e, string name) => e.LookupParameter(name)?.AsValueString() ?? "-";
        
        /// <summary> 
        /// Gets the parameter value as a double and converts it FROM internal units to target units.
        /// Example: e.GetNum("Area", "m2")
        /// </summary>
        public static double GetNum(this Element e, string name, string unit) => e.GetNum(name).FromUnits(unit);
    }
}
