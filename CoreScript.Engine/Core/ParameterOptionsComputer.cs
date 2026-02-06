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
            catch (Exception ex)
            {
                Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}");
                return new List<string>();
            }
        }

        /// <summary>
        /// A category-agnostic identity engine. Finds the best "User Name" for any Revit Element.
        /// </summary>
        public static string GetElementIdentity(Element e)
        {
            if (e == null) return "";
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
                        // Clean formatting: "Name [Number]"
                        if (name.Contains(val)) return name;
                        return $"{name} [{val}]";
                    }
                }
            }
            return name;
        }

        /// <summary>
        /// Creates a collector that is resilient to Revit's "Native Object Model" errors.
        /// </summary>
        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            // Quirk 1: Spatial Elements (Room, Area, Space) must use SpatialElement class
            if (typeof(SpatialElement).IsAssignableFrom(targetType))
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));

            // Quirk 2: Annotation Symbols / Tags often fail OfClass
            if (targetType.Name.Contains("Tag") || targetType.Name.Contains("Symbol"))
            {
                try { return new FilteredElementCollector(doc).OfClass(targetType); }
                catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
            }

            try { return new FilteredElementCollector(doc).OfClass(targetType); }
            catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
        }

        private List<string> GetGenericElements(string targetName, string categoryFilter = null)
        {
            try
            {
                var cleanName = targetName.Trim();
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName;

                // 1. Built-in Category Match
                var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                var builtin = categories.FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase));

                if (builtin != default)
                {
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(new ElementId(builtin));
                    return collector.Cast<Element>().Select(e => GetElementIdentity(e)).Where(s => !string.IsNullOrEmpty(s)).Distinct().OrderBy(n => n).ToList();
                }

                // 2. Class Reflection with Resilience
                if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();
                var classType = _revitTypes.FirstOrDefault(t => (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) && typeof(Element).IsAssignableFrom(t));

                if (classType != null)
                {
                    var collector = CreateResilientCollector(_doc, classType);
                    
                    // V3 FIX: Distinction between Instance and Type
                    if (typeof(ElementType).IsAssignableFrom(classType))
                    {
                        collector.WhereElementIsElementType();
                    }
                    else if (typeof(Element).IsAssignableFrom(classType))
                    {
                        // Standard classes like Wall, Duct, Pipe should return instances
                        if (classType == typeof(Wall) || classType == typeof(Floor) || classType.Name.Contains("Duct") || classType.Name.Contains("Pipe"))
                        {
                            collector.WhereElementIsNotElementType();
                        }
                    }

                    return collector.Cast<Element>().Where(e => classType.IsAssignableFrom(e.GetType()))
                        .Select(e => GetElementIdentity(e)).Distinct().OrderBy(n => n).ToList();
                }

                return new List<string>();
            }
            catch (Exception ex) { Console.WriteLine($"[Master Resolver] Error: {ex.Message}"); return new List<string>(); }
        }
    }
}
