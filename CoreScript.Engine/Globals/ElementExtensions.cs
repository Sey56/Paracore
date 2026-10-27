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
        /// <para>
        /// ⚠⚠ THE FAMILY CHECK MUST GO THROUGH <see cref="FamilyName()"/> (2026-10-27, review
        /// round 3). This used to test <c>e is FamilyInstance</c> / <c>e is FamilySymbol</c>, so
        /// every HOST element was skipped: a Wall is neither. Measured by the reviewer —
        /// <c>WhereMatches("Basic")</c> returned <b>0</b> on nine "Basic Wall" walls, and
        /// <c>Matches("Basic")</c> returned <b>false</b> while <c>FamilyName()</c> returned
        /// "Basic Wall" from the same element. The helper already handles system families via
        /// ELEM_FAMILY_PARAM, so use it rather than re-testing the type.
        /// </para>
        /// </summary>
        public static bool Matches(this Element e, string pattern)
        {
            if (e == null || string.IsNullOrEmpty(pattern)) return false;

            if (e.Name.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;
            if (e.FamilyName().Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;

            // The type name of a host element is not always Element.Name (a Wall reports its
            // type name, a FamilyInstance does not), so ask for it explicitly.
            var typeName = e.GetElementType()?.Name;
            if (typeName != null && typeName.Contains(pattern, StringComparison.OrdinalIgnoreCase)) return true;

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

                    // Compound structure layers — walls, floors, roofs, ceilings
                    // store their structural material here, not as a parameter
                    try
                    {
                        if (typeEl is Autodesk.Revit.DB.HostObjAttributes hostAttr
                            && hostAttr.GetCompoundStructure() is CompoundStructure cs)
                        {
                            foreach (CompoundStructureLayer layer in cs.GetLayers())
                                ids.Add(layer.MaterialId);
                        }
                    }
                    catch { }
                }
            }
            catch { }

            return ids
                .Where(id => id != ElementId.InvalidElementId)
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
        public static Element ToElement(this int id, Document doc) => doc.GetElement(new ElementId((long)id));
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
        /// Filters elements whose Category matches ANY of the given category names (OR).
        /// Chained WhereParam calls AND together, so use this to select several categories
        /// at once — e.g. Structural Framing + Structural Columns + Floors.
        /// Matching is as lenient as GetElements("Category") magic strings: exact name,
        /// with/without spaces ("StructuralColumns" vs "Structural Columns"), or the
        /// BuiltInCategory name (e.g. "OST_StructuralFraming").
        /// <para>Example: GetElements&lt;Element&gt;().WhereCategory("Structural Framing", "Structural Columns", "Floors").Zoom().Isolate()</para>
        /// </summary>
        public static IEnumerable<T> WhereCategory<T>(this IEnumerable<T> elements, params string[] categories)
            where T : Element
        {
            var list = elements.Where(e =>
                e.Category != null &&
                categories.Any(c => CategoryNameMatches(e.Category, c))
            ).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Lenient category-name match, mirroring the GetElements("Category") resolver:
        /// exact name (case-insensitive), no-space equality, or BuiltInCategory substring.
        /// </summary>
        private static bool CategoryNameMatches(Category cat, string filter)
        {
            var f = filter.Trim();
            if (f.Length == 0) return false;
            var catName = cat.Name;
            return catName.Equals(f, StringComparison.OrdinalIgnoreCase)
                || catName.Replace(" ", "").Equals(f.Replace(" ", ""), StringComparison.OrdinalIgnoreCase)
                || cat.BuiltInCategory.ToString().Contains(f, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Filters elements where ANY of the named parameters matches the value.
        /// Useful when the same concept has different parameter names across categories
        /// (e.g. "Level", "Base Constraint", "Reference Level", "Base Level").
        /// <para>Example: GetElements&lt;FamilyInstance&gt;().WhereAnyParam(
        ///     new[] {"Level", "Base Constraint", "Reference Level"}, "Level 1")</para>
        /// </summary>
        public static IEnumerable<T> WhereAnyParam<T>(this IEnumerable<T> elements, string[] names, string value)
            where T : Element
        {
            var list = elements.Where(e =>
                names.Any(n => e.GetStr(n).Equals(value, StringComparison.OrdinalIgnoreCase))
            ).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters elements where ANY of the named parameters matches the value using an operator.
        /// <para>Example: GetElements&lt;FamilyInstance&gt;().WhereAnyParam(
        ///     new[] {"Level", "Base Constraint"}, "starts", "02")</para>
        /// </summary>
        public static IEnumerable<T> WhereAnyParam<T>(this IEnumerable<T> elements, string[] names, string op, string value)
            where T : Element
        {
            var list = elements.Where(e =>
                names.Any(n =>
                {
                    var val = e.GetStr(n);
                    return op.ToLower() switch
                    {
                        "contains" => val.Contains(value, StringComparison.OrdinalIgnoreCase),
                        "starts" or "startswith" => val.StartsWith(value, StringComparison.OrdinalIgnoreCase),
                        "ends" or "endswith" => val.EndsWith(value, StringComparison.OrdinalIgnoreCase),
                        "!=" or "not" or "notequal" => !val.Equals(value, StringComparison.OrdinalIgnoreCase),
                        "notcontains" => !val.Contains(value, StringComparison.OrdinalIgnoreCase),
                        "notstarts" => !val.StartsWith(value, StringComparison.OrdinalIgnoreCase),
                        "notends" => !val.EndsWith(value, StringComparison.OrdinalIgnoreCase),
                        _ => val.Equals(value, StringComparison.OrdinalIgnoreCase),
                    };
                })
            ).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Filters elements by a TYPE parameter value.
        /// Usage: GetElements("Walls").WhereTypeParam("Fire Rating", "starts", "2")
        /// </summary>
        public static IEnumerable<T> WhereTypeParam<T>(this IEnumerable<T> elements, string paramName, string op, string value)
            where T : Element
        {
            var doc = elements.FirstOrDefault()?.Document;
            if (doc == null) return elements;

            var list = elements.Where(el =>
            {
                var typeId = el.GetTypeId();
                if (typeId == ElementId.InvalidElementId) return false;
                var type = doc.GetElement(typeId);
                if (type == null) return false;
                var val = type.GetStr(paramName);
                return op.ToLower() switch
                {
                    "contains" => val.Contains(value, StringComparison.OrdinalIgnoreCase),
                    "starts" => val.StartsWith(value, StringComparison.OrdinalIgnoreCase),
                    "ends" => val.EndsWith(value, StringComparison.OrdinalIgnoreCase),
                    _ => val.Equals(value, StringComparison.OrdinalIgnoreCase),
                };
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
