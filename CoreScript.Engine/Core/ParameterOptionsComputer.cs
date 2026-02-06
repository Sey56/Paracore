using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public class ParameterOptionsComputer
    {
        private readonly Document _doc;
        private static Type[]? _revitTypes;

        public ParameterOptionsComputer(Document doc)
        {
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
        }

        public List<string> ComputeOptions(string revitElementType, string category = null)
        {
            if (string.IsNullOrEmpty(revitElementType)) return new List<string>();
            try { return GetGenericElements(revitElementType, category); }
            catch (Exception ex) { Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}"); return new List<string>(); }
        }

        /// <summary>
        /// Gets a unique, user-friendly identity for any element.
        /// Formats: "Family: Type", "Room [101]", "Sheet - AR01", or just "Name".
        /// </summary>
        public static string GetElementIdentity(Element e)
        {
            if (e == null) return "";
            
            // Format A: Loadable Types (FamilySymbol) -> "Family Name: Type Name"
            if (e is FamilySymbol fs)
            {
                return $"{fs.FamilyName}: {fs.Name}";
            }

            string name = e.Name;

            // Universal identifying parameters
            var identityParams = new[] { 
                BuiltInParameter.ROOM_NUMBER, 
                BuiltInParameter.SHEET_NUMBER,
                BuiltInParameter.ALL_MODEL_MARK,
                BuiltInParameter.FABRICATION_PART_ITEM_NUMBER
            };

            foreach (var bip in identityParams)
            {
                var p = e.get_Parameter(bip);
                if (p != null && p.HasValue)
                {
                    string val = p.AsString();
                    if (!string.IsNullOrEmpty(val)) 
                    {
                        if (name.Contains(val)) return name;
                        return $"{name} [{val}]";
                    }
                }
            }
            return name;
        }

        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            if (typeof(SpatialElement).IsAssignableFrom(targetType) || targetType.Name == "Area" || targetType.Name == "Room")
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));

            try { return new FilteredElementCollector(doc).OfClass(targetType); }
            catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
        }

        private List<string> GetGenericElements(string targetName, string categoryFilter = null)
        {
            try
            {
                var cleanName = targetName.Trim();
                var isTypeRequested = cleanName.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName;

                // 1. CLASS REFLECTION
                if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();
                var classType = _revitTypes.FirstOrDefault(t => 
                    (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) && 
                    typeof(Element).IsAssignableFrom(t));

                if (classType != null)
                {
                    var collector = CreateResilientCollector(_doc, classType);
                    
                    IEnumerable<Element> elements = collector.Cast<Element>().Where(e => classType.IsAssignableFrom(e.GetType()));

                    if (isTypeRequested || typeof(ElementType).IsAssignableFrom(classType))
                        elements = elements.Where(e => e is ElementType);
                    else
                        elements = elements.Where(e => !(e is ElementType));

                    if (!string.IsNullOrEmpty(categoryFilter))
                    {
                        elements = elements.Where(e => 
                            e.Category?.Name.Equals(categoryFilter, StringComparison.OrdinalIgnoreCase) == true ||
                            e.Category?.BuiltInCategory.ToString().Contains(categoryFilter) == true);
                    }

                    return elements.Select(e => GetElementIdentity(e)).Distinct().OrderBy(n => n).ToList();
                }

                // 2. BUILT-IN CATEGORY FALLBACK
                var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                var builtin = categories.FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase));

                if (builtin != default)
                {
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(new ElementId(builtin));
                    if (isTypeRequested) collector.WhereElementIsElementType();
                    else collector.WhereElementIsNotElementType();

                    return collector.Cast<Element>().Select(e => GetElementIdentity(e)).Where(s => !string.IsNullOrEmpty(s)).Distinct().OrderBy(n => n).ToList();
                }

                return new List<string>();
            }
            catch (Exception ex) { Console.WriteLine($"[Master Resolver] Error: {ex.Message}"); return new List<string>(); }
        }
    }
}