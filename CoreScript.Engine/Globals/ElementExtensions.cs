using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
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
        /// Discovery helper for REPL: Lists all native C# properties available for the element type via Reflection.
        /// usage: typeof(Wall).GetProperties()... or simply myWall.ReflectionProperties().Table()
        /// </summary>
        public static IEnumerable<object> ReflectionProperties(this Element e)
        {
            if (e == null) return Enumerable.Empty<object>();
            return e.GetType()
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .OrderBy(p => p.Name)
                .Select(p => new { Name = p.Name, Type = p.PropertyType.Name });
        }

        /// <summary>
        /// Discovery helper for REPL: Lists all public C# methods available for the element runtime type via Reflection.
        /// Excludes property getters/setters and basic object methods to avoid noise.
        /// usage: myDoor.ReflectionMethods().Table()
        /// </summary>
        public static IEnumerable<object> ReflectionMethods(this Element e)
        {
            if (e == null) return Enumerable.Empty<object>();
            return e.GetType()
                .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName) // Exclude property getters/setters (get_*, set_*)
                .Where(m => m.DeclaringType != typeof(object)) // Exclude basic System.Object methods (Equals, ToString, etc.)
                .OrderBy(m => m.Name)
                .Select(m => new 
                { 
                    Method = m.Name, 
                    ReturnType = FormatTypeName(m.ReturnType),
                    Parameters = string.Join(", ", m.GetParameters().Select(p => $"{FormatTypeName(p.ParameterType)} {p.Name}")),
                    DeclaringType = m.DeclaringType?.Name ?? "Unknown"
                });
        }

        private static string FormatTypeName(Type type)
        {
            if (type == null) return "Unknown";
            if (!type.IsGenericType) return type.Name;

            var genericArguments = type.GetGenericArguments();
            var typeName = type.Name;
            var backtickIndex = typeName.IndexOf('`');
            if (backtickIndex > 0)
            {
                typeName = typeName.Substring(0, backtickIndex);
            }
            
            var argNames = string.Join(", ", genericArguments.Select(FormatTypeName));
            return $"{typeName}<{argNames}>";
        }

        /// <summary>
        /// Fuzzy substring search against the Element's identity.
        /// Automatically checks if the specified string is contained within the Type Name OR the true Family Name.
        /// </summary>
        public static bool Matches(this Element e, string pattern)
        {
            if (e == null || string.IsNullOrEmpty(pattern)) return false;
            
            // Check Name (Type Name for instances)
            if (e.Name.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;

            // Check Family Name for Loadable Families
            if (e is FamilyInstance fi && fi.Symbol.FamilyName.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;
            if (e is FamilySymbol fs && fs.FamilyName.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;

            return false;
        }

        /// <summary>
        /// Robustly gets the Family Name of an element (handles Loadable vs System families).
        /// </summary>
        public static string FamilyName(this Element e)
        {
            if (e == null) return "";
            if (e is FamilyInstance fi) return fi.Symbol.FamilyName;
            if (e is FamilySymbol fs) return fs.FamilyName;

            // Fallback for system families or any element with ELEM_FAMILY_PARAM
            var p = e.get_Parameter(BuiltInParameter.ELEM_FAMILY_PARAM);
            var val = p?.AsValueString();
            return !string.IsNullOrEmpty(val) ? val : e.Name;
        }

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
                if (bp != null && bp.HasValue) return FormatParamValue(e, bp);
            }

            // 2. Try standard name lookup ("Level")
            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return FormatParamValue(e, p);


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

            // 4. Type parameter fallback
            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null) return type.GetStr(name);
            }

            return "";
        }

        /// <summary> Gets all Materials assigned to the element. </summary>
        public static IEnumerable<Material> Materials(this Element e)
        {
            if (e == null) return Enumerable.Empty<Material>();
            return e.GetMaterialIds(false)
                .Select(id => e.Document.GetElement(id) as Material)
                .Where(m => m != null);
        }

        /// <summary> Gets a list of Material names assigned to the element. </summary>
        public static IEnumerable<string> MaterialNames(this Element e) => e.Materials().Select(m => m.Name);

        /// <summary> Gets a comma-separated string of material names assigned to the element. </summary>
        public static string GetMaterialNames(this Element e) => string.Join(", ", e.MaterialNames());

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
        public static string GetStr(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "";
            return e.GetNum(name).FormatValueOnly(unit, decimals);
        }

        /// <summary> Gets the parameter value as a double (Internal Units). Falls back to C# Property. </summary>
        public static double GetNum(this Element e, string name)
        {
            if (e == null) return 0.0;

            // 1. Try BIP first
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return bp.AsDouble();
            }

            // 2. Standard lookup
            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return p.AsDouble();


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

            // 4. Type parameter fallback
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

            // 1. Try BIP first
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return bp.AsInteger();
            }

            // 2. Standard lookup
            var p = e.LookupParameter(name);
            if (p != null && p.HasValue) return p.AsInteger();


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

            // 4. Type parameter fallback
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

            // Fallback to Smart GetStr (handles Reflection and ElementId names)
            var fallback = e.GetStr(name);
            if (!string.IsNullOrEmpty(fallback)) return fallback;

            // Fallback to Type parameters
            var typeVal = e.GetTypeVal(name);
            return string.IsNullOrEmpty(typeVal) || typeVal == "-" ? "-" : typeVal;
        }

        /// <summary> Gets the formatted value string in a specific unit (with suffix). </summary>
        public static string GetVal(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "-";
            return e.GetNum(name).FormatUnit(unit, decimals);
        }

        // =================================================================================
        // EXPLICIT TYPE PARAMETER SCOPE WRAPPERS
        // =================================================================================

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

        /// <summary>
        /// Gets all BUILT-IN parameters of the element as a list of objects (Name, BIP, Value).
        /// Ideal for REPL discovery: Table(myWall.BuiltInParams())
        /// </summary>
        public static IEnumerable<object> BuiltInParams(this Element e)
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
        /// Gets all instance parameters of the element as a list of objects (Name, Storage, Value).
        /// Ideal for REPL exploration: Table(myWall.InstanceParams())
        /// </summary>
        public static IEnumerable<object> InstanceParams(this Element e)
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
            return type.InstanceParams();
        }

        /// <summary>
        /// Gets both instance and type parameters of the element as a combined list with Scope headers.
        /// Also includes Native Properties (like Pinned, Category, etc.) for a complete view.
        /// </summary>
        public static IEnumerable<object> CombinedParams(this Element e)
        {
            if (e == null) return new List<object>();
            var inst = e.InstanceParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Instance", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var type = e.TypeParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Type", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var native = e.NativeProperties().Select(p => { dynamic dp = p; return (object)new { Scope = "Native", Name = (string)dp.Property, Storage = "Property", Value = (string)dp.Value }; });
            return native.Concat(inst).Concat(type);
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
        public static IEnumerable<object> NativeProperties(this Element e)
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
        /// Gets the parameter value as a double and converts it FROM internal units to target units.
        /// </summary>
        public static double GetNum(this Element e, string name, string unit, int decimals = 2)
        {
            return e.GetNum(name).OutputUnit(unit, decimals);
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

                if (p == null)
                {
                    // Smart Fallback: Try C# Property via Reflection (e.g. "Pinned", "Name")
                    try
                    {
                        var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
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

        /// <summary>
        /// Sets a parameter value, converting the value from the specified unit if it is numeric or a numeric string.
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

            if (value is double d)
            {
                numericValue = d;
                isNumeric = true;
            }
            else if (value is int i)
            {
                numericValue = i;
                isNumeric = true;
            }
            else if (value is float f)
            {
                numericValue = f;
                isNumeric = true;
            }
            else if (value is decimal dec)
            {
                numericValue = (double)dec;
                isNumeric = true;
            }
            else if (value is string s)
            {
                if (double.TryParse(s, out var parsed))
                {
                    numericValue = parsed;
                    isNumeric = true;
                }
            }

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
                void Action() => view.IsolateElementTemporary(e.Id);
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Isolate Element", Action);
            }
            return e;
        }

        public static Element Delete(this Element e)
        {
            if (e == null || !e.IsValidObject) return e;
            void Action() { if (e.IsValidObject) e.Document.Delete(e.Id); }
            if (e.Document.IsModifiable) Action();
            else Tx.Transact(e.Document, "Delete Element", Action);
            return e;
        }

        /// <summary>
        /// Deletes all elements in the collection in a single transaction.
        /// BIM-Smart: Skips Pinned elements and Curtain Panels to avoid internal Revit exceptions.
        /// Handles dependencies safely by checking IsValidObject before each deletion.
        /// </summary>
        public static IEnumerable<T> Delete<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return elements; }

            var doc = list.First().Document;
            void Action()
            {
                foreach (var e in list)
                {
                    // 1. Basic Validity
                    if (e == null || !e.IsValidObject || e.Id == ElementId.InvalidElementId) continue;

                    // 2. BIM Safety: Skip Pinned, Panels, and Curtain-Wall-Hosted Doors
                    if (e.Pinned) continue;
                    if (e is Panel) continue;

                    // Use the user's proven host-kind check for Curtain Wall doors
                    if (e is FamilyInstance fi)
                    {
                        if (fi.Host is Wall hostWall && hostWall.WallType.Kind == WallKind.Curtain)
                            continue;
                    }

                    try { doc.Delete(e.Id); } catch { }
                }
            }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, "Delete Elements", Action);
                ExecutionGlobals.TrackPipeline(-3); // ✓
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
            return elements;
        }

        public static Element Hide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null && e.CanBeHidden(view))
            {
                void Action() => view.HideElements(new List<ElementId> { e.Id });
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Hide Element", Action);
            }
            return e;
        }

        public static Element Unhide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null)
            {
                void Action() => view.UnhideElements(new List<ElementId> { e.Id });
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Unhide Element", Action);
            }
            return e;
        }

        /// <summary>
        /// Gets a recursive summary of the element's geometry (Solids, Curves, Arcs).
        /// Automatically accumulates transformations to provide World-Space results.
        /// </summary>
        public static List<object> GeometrySummary(this Element e)
        {
            var summary = new List<object>();
            if (e == null) return summary;

            var options = new Options { 
                IncludeNonVisibleObjects = true,
                View = e.Document.ActiveView 
            };
            
            var geom = e.get_Geometry(options);
            if (geom != null) ScanGeometryRecursive(e.Document, geom, Transform.Identity, summary, "Base");

            return summary;
        }

        private static void ScanGeometryRecursive(Document doc, GeometryElement geom, Transform tr, List<object> summary, string source)
        {
            foreach (var obj in geom)
            {
                if (obj == null) continue;

                if (obj is Solid solid && solid.Volume > 0)
                {
                    summary.Add(new {
                        Type = "Solid",
                        Source = source,
                        Material = solid.Faces.Size > 0 ? (doc.GetElement(solid.Faces.get_Item(0).MaterialElementId)?.Name ?? "-") : "-",
                        Volume = Math.Round(solid.Volume, 4) + " CF",
                        Area = Math.Round(solid.SurfaceArea, 4) + " SF",
                        Faces = solid.Faces.Size,
                        Edges = solid.Edges.Size
                    });
                }
                else if (obj is Curve curve)
                {
                    var worldCurve = curve.CreateTransformed(tr);
                    summary.Add(new {
                        Type = worldCurve is Arc ? "Arc" : "Curve (Line)",
                        Source = source,
                        Material = "-",
                        Volume = "-",
                        Area = "-",
                        Faces = "-",
                        Edges = "Length: " + Math.Round(worldCurve.Length, 4) + " ft"
                    });
                }
                else if (obj is PolyLine polyline)
                {
                    summary.Add(new {
                        Type = "PolyLine",
                        Source = source,
                        Material = "-",
                        Volume = "-",
                        Area = "-",
                        Faces = "-",
                        Edges = "Vertices: " + polyline.GetCoordinates().Count
                    });
                }
                else if (obj is GeometryInstance inst)
                {
                    var subTr = tr.Multiply(inst.Transform);
                    // Use Symbol Geometry with accumulated transform (SH_Tools pattern)
                    ScanGeometryRecursive(doc, inst.GetSymbolGeometry(), subTr, summary, "Symbol: " + source);
                }
            }
        }

        // --- Room Helpers for Doors/Windows ---

        /// <summary> Gets the "To Room" name. Automatically detects the latest phase if possible. </summary>
        // --- Stable Orientation Helpers for Doors/Windows ---

        /// <summary> Returns the Room the door leads FROM (The "Access" or "Exterior" side). Stable regardless of flips. </summary>
        public static string RoomFrom(this Element e) => e.GetRoomNames().From;

        /// <summary> Returns the Room the door leads TO (The "Destination" or "Swing" side). Stable regardless of flips. </summary>
        public static string RoomTo(this Element e) => e.GetRoomNames().To;

        /// <summary> 
        /// Gets the name of the "Access Room" (The room the door swings AWAY from).
        /// Uses a robust dual-probe geometric check with Phase-awareness.
        /// </summary>
        public static string RoomAccess(this Element e) => e.GetRoomNames().From;

        /// <summary> 
        /// Gets the name of the "Destination Room" (The room the door swings INTO).
        /// Uses a robust dual-probe geometric check with Phase-awareness.
        /// </summary>
        public static string RoomDestination(this Element e) => e.GetRoomNames().To;

        private static (string From, string To) GetRoomNames(this Element e)
        {
            if (e == null) return ("-", "-");

            try {
                var doc = e.Document;
                var phaseId = e.CreatedPhaseId;
                if (phaseId == ElementId.InvalidElementId) 
                    phaseId = doc.GetElement(e.GetTypeId())?.CreatedPhaseId ?? ElementId.InvalidElementId;
                
                var phase = doc.GetElement(phaseId) as Phase;
                
                // Get Location Point
                XYZ? loc = null;
                if (e is FamilyInstance fi) loc = (fi.Location as LocationPoint)?.Point;
                else if (e is Panel panel) loc = (panel.Location as LocationPoint)?.Point;
                
                if (loc == null) return ("-", "-");

                // Get Facing Orientation
                XYZ? facing = null;
                if (e is FamilyInstance fi2) facing = fi2.FacingOrientation.Normalize();
                else if (e is Panel panel2) facing = panel2.FacingOrientation.Normalize();

                if (facing == null) return ("-", "-");

                // 1. Calculate two probe points on either side of the wall
                var zOffset = new XYZ(0, 0, 3.0); 
                var probeA = loc + (facing * 2.5) + zOffset;
                var probeB = loc - (facing * 2.5) + zOffset;

                var roomA = doc.GetRoomAtPoint(probeA, phase);
                var roomB = doc.GetRoomAtPoint(probeB, phase);
                var nameA = roomA?.Name ?? "External";
                var nameB = roomB?.Name ?? "External";

                // 2. Use the Swing Arc to determine 'To' and 'From'
                var arc = e.FindSwingArc();
                if (arc == null) return (nameB, nameA); // Fallback to orientation

                var swingMid = arc.Evaluate(0.5, true);
                double distA = swingMid.DistanceTo(probeA);
                double distB = swingMid.DistanceTo(probeB);

                // If swing is closer to Probe A, then A is the 'To' room.
                return distA < distB ? (nameB, nameA) : (nameA, nameB);

            } catch { return ("-", "-"); }
        }

        /// <summary> Returns industry standard handing (LH or RH) as seen from the side the door swings AWAY from. </summary>
        public static string Handing(this Element e)
        {
            if (e == null) return "-";
            var arc = e.FindSwingArc();
            
            if (arc == null)
            {
                if (e is FamilyInstance fi) return fi.HandFlipped ? "RH" : "LH";
                return "-";
            }

            // Get Location Point
            XYZ? loc = null;
            if (e is FamilyInstance fi2) loc = (fi2.Location as LocationPoint)?.Point;
            else if (e is Panel panel) loc = (panel.Location as LocationPoint)?.Point;
            
            if (loc == null) return "-";

            // 1. Perspective: Stand in RoomFrom (the side the door swings AWAY from)
            var rooms = e.GetRoomNames();
            
            // Get Facing Orientation
            XYZ? facing = null;
            if (e is FamilyInstance fi3) facing = fi3.FacingOrientation.Normalize();
            else if (e is Panel panel2) facing = panel2.FacingOrientation.Normalize();

            if (facing == null) return "-";

            var probeA = loc + (facing * 2.5);
            var phaseId = e.CreatedPhaseId;
            var roomA = e.Document.GetRoomAtPoint(new XYZ(probeA.X, probeA.Y, loc.Z + 3.0), e.Document.GetElement(phaseId) as Phase);
            var nameA = roomA?.Name ?? "External";

            // Vector pointing TOWARDS the 'From' room
            var toFrom = (rooms.From == nameA) ? facing : -facing;
            
            // 2. Look direction: From RoomFrom TOWARDS the door (into RoomTo)
            var lookDir = -toFrom;

            // 3. Determine Hinge Side
            var hinge = arc.Center;
            var toHinge = (hinge - loc).Normalize();

            var rightVector = lookDir.CrossProduct(XYZ.BasisZ);
            bool isRight = rightVector.DotProduct(toHinge) > 0;

            return isRight ? "RH" : "LH";
        }

        /// <summary> Returns "Left" or "Right" hinge side as seen from the Access room. </summary>
        public static string HingeSide(this Element e)
        {
            var handing = e.Handing();
            if (handing.StartsWith("LH")) return "Left";
            if (handing.StartsWith("RH")) return "Right";
            return "-";
        }

        public static Arc? FindSwingArc(this Element e)
        {
            var doc = e.Document;
            var view = doc.ActiveView;

            // 1. Ensure we have a view that shows symbolic geometry (Swing Arcs)
            if (view == null || (view.ViewType != ViewType.FloorPlan && view.ViewType != ViewType.AreaPlan && view.ViewType != ViewType.CeilingPlan))
            {
                // Find a plan view. Prefer one on the same level.
                var levelId = e.LevelId;
                var allPlanViews = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<ViewPlan>();
                view = allPlanViews.FirstOrDefault(v => v.GenLevel?.Id == levelId && !v.IsTemplate) 
                       ?? allPlanViews.FirstOrDefault(v => !v.IsTemplate);
            }

            if (view == null) return null;

            var options = new Options { 
                IncludeNonVisibleObjects = true,
                View = view 
            };
            
            var geom = e.get_Geometry(options);
            if (geom == null) return null;

            return ScanForArcRecursive(geom, Transform.Identity);
        }

        private static Arc? ScanForArcRecursive(GeometryElement geom, Transform tr)
        {
            Arc? bestArc = null;
            if (geom == null) return null;

            foreach (var obj in geom)
            {
                if (obj == null) continue;

                if (obj is Arc arc)
                {
                    var worldArc = arc.CreateTransformed(tr) as Arc;
                    if (worldArc != null && worldArc.Radius > 0.5)
                    {
                        if (bestArc == null || worldArc.Radius > bestArc.Radius)
                            bestArc = worldArc;
                    }
                }
                else if (obj is GeometryInstance inst)
                {
                    var subTr = tr.Multiply(inst.Transform);
                    var subArc = ScanForArcRecursive(inst.GetSymbolGeometry(), subTr);
                    if (subArc != null && (bestArc == null || subArc.Radius > bestArc.Radius))
                        bestArc = subArc;
                }
            }
            return bestArc;
        }

        public static bool IsHandFlipped(this FamilyInstance fi) => fi?.HandFlipped ?? false;
        public static bool IsFacingFlipped(this FamilyInstance fi) => fi?.FacingFlipped ?? false;

        /// <summary>
        /// Returns true if the FamilyInstance is a standard door (hosted in a Basic/Stacked wall, not a Curtain Wall panel).
        /// </summary>
        public static bool IsStandardDoor(this FamilyInstance fi)
        {
            if (fi == null) return false;
            return !(fi.Host is Wall w && w.WallType.Kind == WallKind.Curtain);
        }

        /// <summary>
        /// Filters a collection of FamilyInstance elements to only standard doors,
        /// excluding Curtain Wall hosted panels (glass doors).
        /// <para>Example: GetElements&lt;FamilyInstance&gt;("Doors").StandardOnly().Table()</para>
        /// </summary>
        public static IEnumerable<FamilyInstance> StandardOnly(this IEnumerable<FamilyInstance> elements)
        {
            var list = elements.Where(fi => fi.IsStandardDoor()).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
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
        /// <summary>
        /// Filters a collection by a Revit parameter value.
        /// Preserves the original element type (T) throughout the chain.
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string value)
            where T : Element
        {
            var list = elements.Where(e => e.GetStr(name).Equals(value, StringComparison.OrdinalIgnoreCase)).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters a collection by a Revit parameter value using a numeric comparison.
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, double value, string unit = "")
            where T : Element
        {
            var internalValue = string.IsNullOrEmpty(unit) ? value : value.InputUnit(unit);
            var list = elements.Where(e => Math.Abs(e.GetNum(name) - internalValue) < 0.001).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters a collection by a Revit parameter using a comparison operator (>, <, >=, <=).
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, double value, string unit = "")
            where T : Element
        {
            // Convert comparison value to internal feet so we compare raw values.
            // NEVER use GetNum(name, unit) — it rounds via OutputUnit and introduces error.
            var internalValue = string.IsNullOrEmpty(unit) ? value : value.InputUnit(unit);
            const double eps = 1e-9; // ~0.0003mm — guards against floating-point noise at boundaries
            var list = (op.ToLower() switch
            {
                ">" => elements.Where(e => e.GetNum(name) > internalValue + eps),
                "<" => elements.Where(e => e.GetNum(name) < internalValue - eps),
                ">=" => elements.Where(e => e.GetNum(name) >= internalValue - eps),
                "<=" => elements.Where(e => e.GetNum(name) <= internalValue + eps),
                _ => elements.Where(e => Math.Abs(e.GetNum(name) - internalValue) < 0.001),
            }).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters a collection by a Revit parameter using a string comparison (contains, starts, ends).
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, string value)
            where T : Element
        {
            var list = (op.ToLower() switch
            {
                "contains" => elements.Where(e => e.GetStr(name).Contains(value, StringComparison.OrdinalIgnoreCase)),
                "starts" or "startswith" => elements.Where(e => e.GetStr(name).StartsWith(value, StringComparison.OrdinalIgnoreCase)),
                "ends" or "endswith" => elements.Where(e => e.GetStr(name).EndsWith(value, StringComparison.OrdinalIgnoreCase)),
                _ => elements.Where(e => e.GetStr(name).Equals(value, StringComparison.OrdinalIgnoreCase)),
            }).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters a collection to elements whose Type Name OR Family Name contains the substring.
        /// Preserves the original element type (T) throughout the chain.
        /// </summary>
        public static IEnumerable<T> WhereMatches<T>(this IEnumerable<T> elements, string pattern)
            where T : Element
        {
            var list = elements.Where(e => e.Matches(pattern)).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Sums a numeric parameter across a typed collection.
        /// </summary>
        public static double SumParam<T>(this IEnumerable<T> elements, string name, string unit)
            where T : Element
        {
            return elements.Sum(e => e.GetNum(name, unit));
        }

        /// <summary>
        /// Selects the typed collection in the Revit UI and zooms to them.
        /// </summary>
        public static IEnumerable<T> Select<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.Selection.SetElementIds(list.Select(e => e.Id).ToList());
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Zooms the active view to fit the typed collection.
        /// </summary>
        public static IEnumerable<T> Zoom<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.ShowElements(list.Select(e => e.Id).ToList());
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Temporarily isolates the typed collection in the active view and zooms to it.
        /// </summary>
        public static IEnumerable<T> Isolate<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var view = doc.ActiveView;
                if (view != null && view.CanEnableTemporaryViewPropertiesMode())
                {
                    void Action() => view.IsolateElementsTemporary(list.Select(e => e.Id).ToList());
                    try
                    {
                        if (doc.IsModifiable) Action();
                        else Tx.Transact(doc, "Isolate Elements", Action);
                        ExecutionGlobals.TrackPipeline(-3); // ✓
                    }
                    catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Hides the collection in the active view.
        /// </summary>
        public static IEnumerable<T> Hide<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var view = list.First().Document.ActiveView;
                if (view != null)
                {
                    var hideable = list.Where(e => e.CanBeHidden(view)).Select(e => e.Id).ToList();
                    if (hideable.Any())
                    {
                        var doc = view.Document;
                        void Action() => view.HideElements(hideable);
                        try
                        {
                            if (doc.IsModifiable) Action();
                            else Tx.Transact(doc, "Hide Elements", Action);
                            ExecutionGlobals.TrackPipeline(-3); // ✓
                        }
                        catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
                    }
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Unhides the collection in the active view.
        /// </summary>
        public static IEnumerable<T> Unhide<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var view = list.First().Document.ActiveView;
                if (view != null)
                {
                    var doc = view.Document;
                    void Action() => view.UnhideElements(list.Select(e => e.Id).ToList());
                    try
                    {
                        if (doc.IsModifiable) Action();
                        else Tx.Transact(doc, "Unhide Elements", Action);
                        ExecutionGlobals.TrackPipeline(-3); // ✓
                    }
                    catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        // ── BULK WRITE ────────────────────────────────────────────────────────

        /// <summary>
        /// Sets a string parameter on every element in the collection in a single transaction.
        /// Works on any Revit parameter or C#-settable string property.
        /// <para>Example: GetElements("Doors").WhereParam("Level","Level 1").SetParam("Comments","Reviewed")</para>
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
                ExecutionGlobals.TrackPipeline(-3); // ✓
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element in the collection in a single transaction, converting the value from the specified unit.
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
                ExecutionGlobals.TrackPipeline(-3); // ✓
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element in the collection dynamically using a function.
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
                ExecutionGlobals.TrackPipeline(-3); // ✓
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
            return list;
        }

        /// <summary>
        /// Sets a parameter on every element in the collection dynamically using a function with the element index.
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
                ExecutionGlobals.TrackPipeline(-3); // ✓
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; } // ✗
            return list;
        }

        // ── SORTING ───────────────────────────────────────────────────────────

        // ── SORTING ───────────────────────────────────────────────────────────

        /// <summary>
        /// Sorts the collection ascending by a Revit parameter or C# property value.
        /// Automatically uses numeric sorting for Double/Integer parameters (Area, Length, Width, etc.)
        /// and string sorting for text parameters.
        /// <para>Example: GetElements("Walls").OrderByParam("Width").Table()</para>
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
        /// Sorts the collection descending by a Revit parameter or C# property value.
        /// Automatically uses numeric sorting for Double/Integer parameters (Area, Length, Width, etc.)
        /// and string sorting for text parameters.
        /// <para>Example: GetElements("Rooms").OrderByParamDesc("Area").Table()</para>
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

            // 1. If it's a Revit Element, check parameters
            if (first is Element e)
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                    p = e.get_Parameter(bip);
                if (p != null)
                    return p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer;
            }

            // 2. Fallback: Check C# property type via reflection (for POCOs like ClashResult or Elements)
            var prop = first.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
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
            
            var prop = item.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
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
            
            var prop = item.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (prop != null)
            {
                return prop.GetValue(item)?.ToString() ?? "";
            }
            return "";
        }

        // ── GROUPING ──────────────────────────────────────────────────────────

        /// <summary>
        /// Groups the collection by a parameter value and renders a summary table (Group, Count).
        /// <para>Example: GetElements("Doors").GroupByParam("Level").Table()</para>
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
            ExecutionGlobals.Current.Value?.PipelineDiagnostics.Add(results.Count);
            return results;
        }

        /// <summary>
        /// Groups the collection by a parameter and sums a numeric parameter per group.
        /// <para>Example: GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").Table()</para>
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
                    obj.Total = Math.Round(g.Sum(e => {
                        if (e is Element el) return el.GetNum(sum, string.IsNullOrEmpty(unit) ? "ft" : unit);
                        return GetNumGeneric(e, sum);
                    }), 3);
                    return (object)obj;
                }).ToList();
            ExecutionGlobals.Current.Value?.PipelineDiagnostics.Add(results.Count);
            return results;
        }
    }
}
