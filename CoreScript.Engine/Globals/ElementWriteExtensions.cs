using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter setters — SetNum, SetVal (smart setter).
    /// </summary>
    public static partial class ElementExtensions
    {
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
        /// THE SMART SETTER. Handles: Double/Int → SetNum, String with units → SetValueString,
        /// String Name → resolves to ElementId (for Levels/Types), String → Standard String set.
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

                if (p == null)
                {
                    try
                    {
                        var prop = e.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
                        if (prop != null && prop.CanWrite)
                        {
                            var targetType = prop.PropertyType;
                            try
                            {
                                if (targetType == typeof(bool) && value is string sVal)
                                {
                                    if (bool.TryParse(sVal, out var bVal)) prop.SetValue(e, bVal);
                                }
                                else if (targetType == typeof(string))
                                {
                                    prop.SetValue(e, value.ToString());
                                }
                                else
                                {
                                    var converted = Convert.ChangeType(value, targetType);
                                    prop.SetValue(e, converted);
                                }
                            }
                            catch { }
                        }
                    }
                    catch { }

                    return;
                }
                if (value is double d) { p.Set(d); return; }
                if (value is int i) { p.Set(i); return; }

                if (value is string s)
                {
                    if (p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer)
                    {
                        if (p.SetValueString(s)) return;
                    }

                    if (p.StorageType == StorageType.ElementId)
                    {
                        var found = new FilteredElementCollector(e.Document)
                            .WhereElementIsNotElementType()
                            .FirstOrDefault(el => el.Name.Equals(s, StringComparison.OrdinalIgnoreCase));

                        if (found == null)
                        {
                            found = new FilteredElementCollector(e.Document)
                                .WhereElementIsElementType()
                                .FirstOrDefault(el => el.Name.Equals(s, StringComparison.OrdinalIgnoreCase));
                        }

                        if (found != null) { p.Set(found.Id); return; }

                        if (long.TryParse(s, out var idVal)) { p.Set(new ElementId(idVal)); return; }
                    }

                    p.Set(s);
                }
            }

            if (e.Document.IsModifiable) Action();
            else Tx.Transact(e.Document, $"Set {name}", Action);
        }

        /// <summary>
        /// Sets a parameter value, converting the value from the specified unit if numeric.
        /// </summary>
        public static void SetVal(this Element e, string name, object value, string unit)
        {
            if (e == null || value == null) return;
            if (string.IsNullOrEmpty(unit))
            {
                e.SetVal(name, value);
                return;
            }

            double numericValue = 0;
            bool isNumeric = false;

            if (value is double d) { numericValue = d; isNumeric = true; }
            else if (value is int i) { numericValue = i; isNumeric = true; }
            else if (value is float f) { numericValue = f; isNumeric = true; }
            else if (value is decimal dec) { numericValue = (double)dec; isNumeric = true; }
            else if (value is string s && double.TryParse(s, out var parsed)) { numericValue = parsed; isNumeric = true; }

            if (isNumeric)
            {
                double internalValue = numericValue.InputUnit(unit);
                e.SetVal(name, internalValue);
            }
            else
            {
                e.SetVal(name, value);
            }
        }
    }
}
