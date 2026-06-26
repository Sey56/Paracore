using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Core element extensions — reflection discovery, identity matching, materials.
    /// See also: ElementParamExtensions, ElementWriteExtensions, ElementDiscoveryExtensions,
    /// ElementUIExtensions, ElementGeometryExtensions, ElementDoorExtensions.
    /// </summary>
    public static partial class ElementExtensions
    {
        // ── Reflection Discovery ──────────────────────────────────────────

        /// <summary>
        /// Lists all native C# properties available for the element type via Reflection.
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
        /// Lists all public C# methods available for the element runtime type via Reflection.
        /// Excludes property getters/setters and basic object methods.
        /// </summary>
        public static IEnumerable<object> ReflectionMethods(this Element e)
        {
            if (e == null) return Enumerable.Empty<object>();
            return e.GetType()
                .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName)
                .Where(m => m.DeclaringType != typeof(object))
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

        // ── Identity ──────────────────────────────────────────────────────

        /// <summary>
        /// Fuzzy substring search against the Element's identity.
        /// Checks Type Name and Family Name.
        /// </summary>
        public static bool Matches(this Element e, string pattern)
        {
            if (e == null || string.IsNullOrEmpty(pattern)) return false;

            if (e.Name.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;
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

            var p = e.get_Parameter(BuiltInParameter.ELEM_FAMILY_PARAM);
            var val = p?.AsValueString();
            return !string.IsNullOrEmpty(val) ? val : e.Name;
        }

        // ── Materials ─────────────────────────────────────────────────────

        /// <summary>
        /// Gets all Materials assigned to the element from every possible source:
        /// geometry faces, paint, compound structure layers, structural material,
        /// and any parameter that references a Material element.
        /// Works on any element type — walls, framing, MEP, generic models, etc.
        /// </summary>
        public static IEnumerable<Material> Materials(this Element e)
        {
            if (e == null) return Enumerable.Empty<Material>();
            var doc = e.Document;

            // Geometry + paint materials
            var ids = new HashSet<ElementId>(e.GetMaterialIds(true));

            // Scan all parameters (instance + type) for any that reference
            // a Material element. Catches STRUCTURAL_MATERIAL_PARAM on the
            // type (common for walls), compound layer materials, MEP, etc.
            try
            {
                // Instance parameters
                foreach (Parameter p in e.Parameters)
                    AddMaterialIds(p, ids, doc);

                // Type parameters — wall types, family types store material here
                var typeEl = doc.GetElement(e.GetTypeId());
                if (typeEl != null)
                {
                    foreach (Parameter p in typeEl.Parameters)
                        AddMaterialIds(p, ids, doc);
                }
            }
            catch { }

            return ids
                .Select(id => doc.GetElement(id) as Material)
                .Where(m => m != null);
        }

        private static void AddMaterialIds(Parameter p, HashSet<ElementId> ids, Document doc)
        {
            if (p == null || !p.HasValue) return;
            if (p.StorageType != StorageType.ElementId) return;
            var refId = p.AsElementId();
            if (refId == null || refId == ElementId.InvalidElementId) return;
            var refEl = doc.GetElement(refId);
            if (refEl is Material)
                ids.Add(refId);
        }

        /// <summary> Gets a list of Material names assigned to the element. </summary>
        public static IEnumerable<string> MaterialNames(this Element e) => e.Materials().Select(m => m.Name);

        /// <summary> Gets a comma-separated string of material names assigned to the element. </summary>
        public static string GetMaterialNames(this Element e) => string.Join(", ", e.MaterialNames());
    }

    /// <summary>
    /// ElementId conversion helpers.
    /// </summary>
    public static class IdentityExtensions
    {
        public static Element ToElement(this long id, Document doc) => doc.GetElement(new ElementId(id));
        public static Element ToElement(this int id, Document doc) => doc.GetElement(new ElementId(id));
        public static Element ToElement(this ElementId id, Document doc) => doc.GetElement(id);
    }

    /// <summary>
    /// Collection filtering — WhereParam (string/int/op overloads), WhereMatches.
    /// See also: CollectionAggregateExtensions, CollectionUIExtensions, CollectionWriteExtensions.
    /// </summary>
    public static partial class CollectionExtensions
    {
        /// <summary>
        /// Filters a collection by a Revit parameter value (string equality).
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
        /// Filters a collection by a Revit parameter using a comparison operator (>, <, >=, <=, !=).
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, double value, string unit = "")
            where T : Element
        {
            var internalValue = string.IsNullOrEmpty(unit) ? value : value.InputUnit(unit);
            const double eps = 1e-9;
            var list = (op.ToLower() switch
            {
                ">" => elements.Where(e => e.GetNum(name) > internalValue + eps),
                "<" => elements.Where(e => e.GetNum(name) < internalValue - eps),
                ">=" => elements.Where(e => e.GetNum(name) >= internalValue - eps),
                "<=" => elements.Where(e => e.GetNum(name) <= internalValue + eps),
                "!=" or "not" or "notequal" => elements.Where(e => Math.Abs(e.GetNum(name) - internalValue) >= 0.001),
                _ => elements.Where(e => Math.Abs(e.GetNum(name) - internalValue) < 0.001),
            }).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters a collection by a Revit parameter using a string comparison
        /// (contains, starts, ends, notcontains, etc.).
        /// </summary>
        public static IEnumerable<T> WhereParam<T>(this IEnumerable<T> elements, string name, string op, string value)
            where T : Element
        {
            var list = (op.ToLower() switch
            {
                "contains" => elements.Where(e => e.GetStr(name).Contains(value, StringComparison.OrdinalIgnoreCase)),
                "starts" or "startswith" => elements.Where(e => e.GetStr(name).StartsWith(value, StringComparison.OrdinalIgnoreCase)),
                "ends" or "endswith" => elements.Where(e => e.GetStr(name).EndsWith(value, StringComparison.OrdinalIgnoreCase)),
                "!=" or "not" or "notequal" => elements.Where(e => !e.GetStr(name).Equals(value, StringComparison.OrdinalIgnoreCase)),
                "notcontains" => elements.Where(e => !e.GetStr(name).Contains(value, StringComparison.OrdinalIgnoreCase)),
                "notstarts" => elements.Where(e => !e.GetStr(name).StartsWith(value, StringComparison.OrdinalIgnoreCase)),
                "notends" => elements.Where(e => !e.GetStr(name).EndsWith(value, StringComparison.OrdinalIgnoreCase)),
                _ => elements.Where(e => e.GetStr(name).Equals(value, StringComparison.OrdinalIgnoreCase)),
            }).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters to elements whose Type Name OR Family Name contains the substring.
        /// </summary>
        public static IEnumerable<T> WhereMatches<T>(this IEnumerable<T> elements, string pattern)
            where T : Element
        {
            var list = elements.Where(e => e.Matches(pattern)).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters to elements that have a specific material assigned (case-insensitive
        /// substring match). Checks all materials on the element — paint, compound
        /// layers, structural material, etc.
        /// <para>Example: GetElements("Structural Framing").WhereMaterial("Concrete").Table()</para>
        /// </summary>
        public static IEnumerable<T> WhereMaterial<T>(this IEnumerable<T> elements, string materialName)
            where T : Element
        {
            var list = elements.Where(e =>
                e.MaterialNames().Any(m =>
                    m.Contains(materialName, StringComparison.OrdinalIgnoreCase))).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters to elements that do NOT have the specified material.
        /// Useful for QA: find structural elements painted with the wrong material.
        /// <para>Example: GetElements("Structural Framing").WhereMaterialNot("Concrete").Table()</para>
        /// </summary>
        public static IEnumerable<T> WhereMaterialNot<T>(this IEnumerable<T> elements, string materialName)
            where T : Element
        {
            var list = elements.Where(e =>
                !e.MaterialNames().Any(m =>
                    m.Contains(materialName, StringComparison.OrdinalIgnoreCase))).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }
    }
}
