using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter setters — SetNum, SetVal (smart setter), and type-level equivalents.
    /// </summary>
    public static partial class ElementExtensions
    {
        private static readonly HashSet<string> _warnedSetParams = new(StringComparer.OrdinalIgnoreCase);

        private static void _warnUnknownSetParam(string name)
        {
            if (string.IsNullOrEmpty(name)) return;
            if (_warnedSetParams.Contains(name)) return;
            _warnedSetParams.Add(name);
            try
            {
                ScriptApi.Println($"⚠ SetVal(\"{name}\"): parameter not found on element or its type. "
                    + "Check spelling or use .CombinedParams().Table() to discover available parameters.");
            }
            catch { }
        }

        private static void _warnReadOnlyParam(string name)
        {
            if (string.IsNullOrEmpty(name)) return;
            var key = "readonly_" + name;
            if (_warnedSetParams.Contains(key)) return;
            _warnedSetParams.Add(key);
            try
            {
                ScriptApi.Println($"⚠ SetVal(\"{name}\"): parameter is read-only and cannot be modified.");
            }
            catch { }
        }

        /// <summary>
        /// Sets a numeric parameter value, automatically converting FROM the specified unit.
        /// Wraps in a transaction named "Update Parameter" if one isn't already active.
        /// Falls back to ElementType if the parameter is a type-level parameter.
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

                // 1. Fall back to ElementType if not found on instance
                if (p == null && e is not ElementType)
                {
                    var type = e.GetElementType();
                    if (type != null)
                    {
                        var tp = type.LookupParameter(name);
                        if (tp == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var typeBip))
                        {
                            tp = type.get_Parameter(typeBip);
                        }
                        if (tp != null)
                        {
                            type.SetNum(name, value, unit);
                            return;
                        }
                    }
                }

                if (p == null)
                {
                    _warnUnknownSetParam(name);
                    return;
                }

                if (p.IsReadOnly)
                {
                    _warnReadOnlyParam(name);
                    return;
                }

                // ⚠⚠ THE TYPE-WRITE GUARD. `e.LookupParameter(name)` on an INSTANCE also finds the
                //    TYPE's parameters — Revit projects them — so this write can land on the type
                //    and change every instance of it. Measured 2026-10-14: one SetNum("Width") on
                //    one window moved 8 elements (4 windows + their 4 host walls). See
                //    ElementTypeWriteGuard for why it informs rather than refuses.
                if (e is not ElementType && p.Element is ElementType)
                {
                    _reportTypeWrite(e, name, p);
                }

                if (p.StorageType == StorageType.Double)
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
                _ = Tx.Transact(e.Document, $"Set {name}", Action);
            }
        }

        /// <summary>
        /// THE SMART SETTER. Handles: Double/Int → SetNum, String with units → SetValueString,
        /// String Name → resolves to ElementId (for Levels/Types), String → Standard String set.
        /// Automatically falls back to ElementType if the parameter is a Type parameter (e.g. Fire Rating on Walls).
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
                // Paracore migration alias — legacy bare names (e.g. "IsDoorWin")
                // transparently resolve to their migrated shared parameters
                // ("Paracore IsDoorWin"); see ResolveParam.
                if (p == null) p = e.ResolveParam(name);

                // 1. Fall back to ElementType if not found on instance
                if (p == null && e is not ElementType)
                {
                    var type = e.GetElementType();
                    if (type != null)
                    {
                        var tp = type.LookupParameter(name);
                        if (tp == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var typeBip))
                        {
                            tp = type.get_Parameter(typeBip);
                        }
                        if (tp != null)
                        {
                            type.SetVal(name, value);
                            return;
                        }
                    }
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
                            return;
                        }
                    }
                    catch { }

                    _warnUnknownSetParam(name);
                    return;
                }

                if (p.IsReadOnly)
                {
                    _warnReadOnlyParam(name);
                    return;
                }

                // ⚠⚠ THE TYPE-WRITE GUARD — same trap as in SetNum: LookupParameter on an instance
                //    finds the TYPE's parameters too, so this write can land on the type and change
                //    every instance of it. See ElementTypeWriteGuard.
                if (e is not ElementType && p.Element is ElementType)
                {
                    _reportTypeWrite(e, name, p);
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
            else _ = Tx.Transact(e.Document, $"Set {name}", Action);
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

        // ── Type-Level Setters ───────────────────────────────────────────

        /// <summary> Sets a type-level parameter on the element's ElementType. </summary>
        public static void SetTypeVal(this Element e, string name, object value) => e.GetElementType()?.SetVal(name, value);

        /// <summary> Sets a type-level parameter with unit conversion on the element's ElementType. </summary>
        public static void SetTypeVal(this Element e, string name, object value, string unit) => e.GetElementType()?.SetVal(name, value, unit);

        /// <summary> Sets a type-level numeric parameter on the element's ElementType. </summary>
        public static void SetTypeNum(this Element e, string name, double value, string unit) => e.GetElementType()?.SetNum(name, value, unit);
    }
}
