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
            if (string.IsNullOrEmpty(revitElementType)) return new List<string>();
            try { return GetGenericElements(revitElementType, category); }
            catch (Exception ex) { Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}"); return new List<string>(); }
        }

        public static string GetElementIdentity(Element e)
        {
            if (e == null) return "";
            if (e is FamilySymbol fs) return $"{fs.FamilyName}: {fs.Name}";
            
            // V3 FIX: Professional Sheet formatting
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

            // V3 FIX: If it's an instance (not a Type), append the ID to ensure uniqueness in the UI and Hydration.
            // Levels and Materials always have unique names in Revit, so we skip the noisy ID.
            if (!(e is ElementType || e is Level || e is Material)) return $"{name} [{e.Id}]";

            return name;
        }

        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            // Quirk 1: Spatial Elements
            if (typeof(SpatialElement).IsAssignableFrom(targetType) || targetType.Name == "Area" || targetType.Name == "Room")
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));

            // Quirk 2: Generic fallback
            try { return new FilteredElementCollector(doc).OfClass(targetType); }
            catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
        }

        private List<string> GetGenericElements(string targetName, string? categoryFilter = null)
        {
            try
            {
                var cleanName = targetName.Trim();
                var isTypeRequested = cleanName.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName;

                // V3 CLEAN ARCHITECTURE: Pure Class-Based Discovery
                // We no longer guess categories from strings. We use the C# Type Truth.
                if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();
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

                    return elements.Select(GetElementIdentity).Distinct().OrderBy(n => n).ToList();
                }

                // FALLBACK: If it doesn't look like a class, try one last check against Built-in Categories
                var builtin = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>().FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase));

                if (builtin != default)
                {
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(new ElementId(builtin));
                    return collector.Cast<Element>().Select(GetElementIdentity).Distinct().OrderBy(n => n).ToList();
                }

                return new List<string>();
            }
            catch (Exception ex) { Console.WriteLine($"[OptionsComputer] Error: {ex.Message}"); return new List<string>(); }
        }
    }
}
