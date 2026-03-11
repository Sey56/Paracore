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

        public List<string> ComputeOptions(string revitElementType, string? category = null)
        {
            var elements = ComputeElementOptions(revitElementType, category);
            return elements.Select(GetElementIdentity).Distinct().OrderBy(n => n).ToList();
        }

        public List<Element> ComputeElementOptions(string revitElementType, string? category = null)
        {
            if (string.IsNullOrEmpty(revitElementType)) return new List<Element>();
            try { return GetGenericElements(revitElementType, category).ToList(); }
            catch (Exception ex) { Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}"); return new List<Element>(); }
        }

        public static string GetElementIdentity(Element e)
        {
            if (e == null) return "";
            if (e is FamilySymbol fs) return $"{fs.FamilyName}: {fs.Name}";
            
            // Better FamilyInstance display (Family: Type [Mark])
            if (e is FamilyInstance fi)
            {
               string mark = fi.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString();
               string idPart = !string.IsNullOrEmpty(mark) ? $"[Mark: {mark}]" : $"[{fi.Id}]";
               return $"{fi.Symbol.FamilyName}: {fi.Name} {idPart}";
            }

            // Professional Sheet formatting
            if (e is ViewSheet s) return $"[{s.SheetNumber}] {s.Name}";

            string name = e.Name;
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
                    string? val = p.AsString();
                    if (!string.IsNullOrEmpty(val)) 
                    {
                        if (name.Contains(val)) return name;
                        return $"{name} [{val}]";
                    }
                }
            }

            // If it's an instance (not a Type), append the ID to ensure uniqueness in the UI and Hydration.
            // Levels and Materials always have unique names in Revit, so we skip the noisy ID.
            if (!(e is ElementType || e is Level || e is Material)) return $"{name} [{e.Id}]";

            return name;
        }

        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            // Quirk 1: Spatial Elements
            if (typeof(SpatialElement).IsAssignableFrom(targetType) || targetType.Name == "Area" || targetType.Name == "Room")
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));

            // Quirk 2: Element Types (Base class or specific types like WallSweepType)
            if (typeof(ElementType).IsAssignableFrom(targetType) || targetType.Name.EndsWith("Type"))
                return new FilteredElementCollector(doc).WhereElementIsElementType();

            // Quirk 3: Generic fallback
            try { return new FilteredElementCollector(doc).OfClass(targetType); }
            catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
        }

        private IEnumerable<Element> GetGenericElements(string targetName, string? categoryFilter = null)
        {
            try
            {
                var cleanName = targetName.Trim();

                // SPECIAL CASE: Family discovery (Loadable Families)
                if (cleanName.Equals("Family", StringComparison.OrdinalIgnoreCase))
                {
                    var familyCollector = new FilteredElementCollector(_doc).OfClass(typeof(Family));
                    var families = familyCollector.Cast<Family>();

                    if (!string.IsNullOrEmpty(categoryFilter))
                    {
                        families = families.Where(f => 
                            f.FamilyCategory?.Name.Equals(categoryFilter, StringComparison.OrdinalIgnoreCase) == true ||
                            f.FamilyCategory?.BuiltInCategory.ToString().Contains(categoryFilter) == true);
                    }

                    return families.Cast<Element>();
                }

                var isTypeRequested = cleanName.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName;

                // Enum Discovery — for types like BuiltInParameter, BuiltInCategory, etc.
                if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();
                var enumType = _revitTypes.FirstOrDefault(t =>
                    (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) &&
                    t.IsEnum);

                if (enumType != null)
                {
                    // Enums don't return elements, so we skip them here or handle them specifically if needed for filters.
                    // For now, return empty as filters usually apply to Elements.
                    return Enumerable.Empty<Element>();
                }

                // Pure Class-Based Discovery
                var classType = _revitTypes.FirstOrDefault(t => 
                    (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) && 
                    typeof(Element).IsAssignableFrom(t));

                if (classType != null)
                {
                    var collector = CreateResilientCollector(_doc, classType);
                    IEnumerable<Element> elements = collector.Cast<Element>().Where(e => classType.IsAssignableFrom(e.GetType()));

                    // Filter Types vs Instances
                    if (typeof(ElementType).IsAssignableFrom(classType) || isTypeRequested)
                        elements = elements.Where(e => e is ElementType);
                    else
                        elements = elements.Where(e => !(e is ElementType));

                    // Apply Optional Category Filter (e.g. from RevitElements attribute)
                    if (!string.IsNullOrEmpty(categoryFilter))
                    {
                        elements = elements.Where(e => 
                            e.Category?.Name.Equals(categoryFilter, StringComparison.OrdinalIgnoreCase) == true ||
                            e.Category?.BuiltInCategory.ToString().Contains(categoryFilter) == true);
                    }

                    return elements;
                }

                // FALLBACK: If it doesn't look like a class, try one last check against Built-in Categories
                var baseCategoryName = cleanName;
                if (isTypeRequested)
                {
                    if (cleanName.EndsWith("Types", StringComparison.OrdinalIgnoreCase))
                        baseCategoryName = cleanName.Substring(0, cleanName.Length - 5);
                    else if (cleanName.EndsWith("Type", StringComparison.OrdinalIgnoreCase))
                        baseCategoryName = cleanName.Substring(0, cleanName.Length - 4);
                }
                
                var builtin = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>().FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{baseCategoryName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{baseCategoryName}s", StringComparison.OrdinalIgnoreCase)); // Auto-plural fallback (Silent benefit for all)

                if (builtin != default)
                {
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(new ElementId(builtin));
                    if (isTypeRequested) return collector.WhereElementIsElementType().Cast<Element>();
                    return collector.WhereElementIsNotElementType().Cast<Element>();
                }

                return Enumerable.Empty<Element>();
            }
            catch (Exception ex) { Console.WriteLine($"[OptionsComputer] Error: {ex.Message}"); return Enumerable.Empty<Element>(); }
        }
    }
}
