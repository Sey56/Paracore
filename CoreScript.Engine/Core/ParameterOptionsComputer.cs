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

            var cleanName = revitElementType.Trim();
            var singularName = cleanName.EndsWith("ies", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 3) + "y" : 
                               (cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !cleanName.EndsWith("ss", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName);

            if (_revitTypes == null)
            {
                _revitTypes = typeof(Element).Assembly.GetTypes();
            }

            var enumType = _revitTypes.FirstOrDefault(t =>
                (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) &&
                t.IsEnum);

            if (enumType != null)
            {
                return Enum.GetNames(enumType).OrderBy(n => n).ToList();
            }

            var elements = ComputeElementOptions(revitElementType, category);
            return elements.Select(GetElementIdentity).Distinct().OrderBy(n => n).ToList();
        }

        public List<Element> ComputeElementOptions(string revitElementType, string? category = null)
        {
            if (string.IsNullOrEmpty(revitElementType))
            {
                return new List<Element>();
            }

            try { return GetGenericElements(revitElementType, category).ToList(); }
            catch (Exception ex) { Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}"); return new List<Element>(); }
        }

        public static string GetElementIdentity(Element e)
        {
            if (e == null)
            {
                return "";
            }

            if (e is FamilySymbol fs)
            {
                return $"{fs.FamilyName}: {fs.Name}";
            }

            // Better FamilyInstance display (Family: Type [Mark])
            if (e is FamilyInstance fi)
            {
                string mark = fi.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString();
                string idPart = !string.IsNullOrEmpty(mark) ? $"[Mark: {mark}]" : $"[{fi.Id}]";
                return $"{fi.Symbol.FamilyName}: {fi.Name} {idPart}";
            }

            // Professional Sheet formatting
            if (e is ViewSheet s)
            {
                return $"[{s.SheetNumber}] {s.Name}";
            }

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
                        return name.Contains(val) ? name : $"{name} [{val}]";
                    }
                }
            }

            // If it's an instance (not a Type), append the ID to ensure uniqueness in the UI and Hydration.
            // Levels and Materials always have unique names in Revit, so we skip the noisy ID.
            return !(e is ElementType || e is Level || e is Material) ? $"{name} [{e.Id}]" : name;
        }

        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            // Quirk 1: Spatial Elements
            if (typeof(SpatialElement).IsAssignableFrom(targetType) || targetType.Name == "Area" || targetType.Name == "Room")
            {
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));
            }

            // Quirk 2: Element Types (Base class or specific types like WallSweepType)
            if (typeof(ElementType).IsAssignableFrom(targetType) || targetType.Name.EndsWith("Type"))
            {
                return new FilteredElementCollector(doc).WhereElementIsElementType();
            }

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
                                       
                var singularName = cleanName.EndsWith("ies", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 3) + "y" : 
                                   (cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !cleanName.EndsWith("ss", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName);

                // Enum Discovery — for types like BuiltInParameter, BuiltInCategory, etc.
                if (_revitTypes == null)
                {
                    _revitTypes = typeof(Element).Assembly.GetTypes();
                }

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
                    {
                        elements = elements.Where(e => e is ElementType);
                    }
                    else
                    {
                        elements = elements.Where(e => !(e is ElementType));
                    }

                    // Apply Optional Category Filter (e.g. from RevitElements attribute)
                    if (!string.IsNullOrEmpty(categoryFilter))
                    {
                        var filterSingular = categoryFilter.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? categoryFilter.Substring(0, categoryFilter.Length - 1) : categoryFilter;
                        elements = elements.Where(e =>
                            e.Category?.Name.Equals(categoryFilter, StringComparison.OrdinalIgnoreCase) == true ||
                            e.Category?.Name.Replace(" ", "").EndsWith(filterSingular, StringComparison.OrdinalIgnoreCase) == true ||
                            e.Category?.BuiltInCategory.ToString().Contains(categoryFilter) == true);
                    }

                    return elements;
                }

                // --- ROBUST CATEGORY DISCOVERY (V4.2.0) ---
                // Matching is lenient: exact name, singular, or with spaces removed — so
                // "Multistory Stairs" and "MultistoryStairs" both resolve to the same category.
                var baseCategoryName = cleanName;
                var baseCompact = baseCategoryName.Replace(" ", "");
                var singularCompact = singularName.Replace(" ", "");

                Category? matchedCategory = null;
                foreach (Category cat in _doc.Settings.Categories)
                {
                    var catSingular = cat.Name.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cat.Name.Substring(0, cat.Name.Length - 1) : cat.Name;
                    var catCompact = cat.Name.Replace(" ", "");
                    var catSingularCompact = catSingular.Replace(" ", "");

                    if (cat.Name.Equals(baseCategoryName, StringComparison.OrdinalIgnoreCase) || 
                        cat.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                        catSingular.Equals(baseCategoryName, StringComparison.OrdinalIgnoreCase) ||
                        catSingular.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                        catCompact.Equals(baseCompact, StringComparison.OrdinalIgnoreCase) ||
                        catCompact.Equals(singularCompact, StringComparison.OrdinalIgnoreCase) ||
                        catSingularCompact.Equals(baseCompact, StringComparison.OrdinalIgnoreCase) ||
                        catSingularCompact.Equals(singularCompact, StringComparison.OrdinalIgnoreCase))
                    {
                        matchedCategory = cat;
                        break;
                    }
                }

                ElementId? categoryId = matchedCategory?.Id;

                // Fallback to Built-in Enum mapping (covers OST_ prefix and standard Enum names)
                // The normalized comparisons make "Multistory Stairs" match OST_MultistoryStairs
                // even though that category is not present in Settings.Categories.
                if (categoryId == null)
                {
                    var builtin = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>()
                        .FirstOrDefault(c =>
                        {
                            var en = c.ToString(); // e.g. "OST_MultistoryStairs"
                            var enCompact = en.Replace("_", "").Replace(" ", ""); // "OSTMultistoryStairs"
                            var enNoPrefix = enCompact.StartsWith("OST", StringComparison.OrdinalIgnoreCase)
                                ? enCompact.Substring(3) // "MultistoryStairs"
                                : enCompact;

                            return en.Equals(baseCategoryName, StringComparison.OrdinalIgnoreCase) ||
                                   en.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                                   en.Equals($"OST_{baseCategoryName}", StringComparison.OrdinalIgnoreCase) ||
                                   en.Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                                   en.Equals($"OST_{baseCategoryName}s", StringComparison.OrdinalIgnoreCase) ||
                                   en.Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase) ||
                                   enCompact.Equals("OST" + baseCompact, StringComparison.OrdinalIgnoreCase) ||
                                   enCompact.Equals("OST" + singularCompact, StringComparison.OrdinalIgnoreCase) ||
                                   enNoPrefix.Equals(baseCompact, StringComparison.OrdinalIgnoreCase) ||
                                   enNoPrefix.Equals(singularCompact, StringComparison.OrdinalIgnoreCase);
                        });

                    if (builtin != default) categoryId = new ElementId(builtin);
                }

                if (categoryId != null)
                {
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(categoryId);
                    var results = isTypeRequested 
                        ? collector.WhereElementIsElementType().Cast<Element>().ToList()
                        : collector.WhereElementIsNotElementType().Cast<Element>().ToList();

                    // ⚠⚠ INSTANCES MEAN INSTANCES — the "automatic type fallback" that used to sit
                    //    here was REMOVED on 2026-10-14. It returned the category's ElementTypes
                    //    whenever the category had 0 instances, so `GetElements("Doors")` on a
                    //    project with no doors answered with door TYPES: objects that .Count()
                    //    counts as instances, .Delete() deletes (taking every instance of the type
                    //    with them) and .SetVal() writes to the TYPE of. One easy-to-miss INFO line
                    //    was the only signal, and the trap caught a live build on 2026-10-10.
                    //
                    //    ⚠ Types are still reachable — but only by ASKING for them:
                    //      GetElements<FamilySymbol>("Doors")  — a loadable family's symbols
                    //      GetElements<WallType>()             — a system family's types
                    //      GetElements("WallType")             — a name that is itself a type name
                    //    A category with 0 instances now returns an EMPTY list, and
                    //    ScriptApi.GetElements reports that zero instead of substituting types.
                    return results;
                }

                return Enumerable.Empty<Element>();
            }
            catch (Exception ex) { Console.WriteLine($"[OptionsComputer] Error: {ex.Message}"); return Enumerable.Empty<Element>(); }
        }

        /// <summary>
        /// True if the name matches any Revit Element subclass (exact, singular, or with spaces
        /// removed) or any BuiltInCategory name (with/without the OST_ prefix, spaces and
        /// underscores ignored). Used to distinguish "valid but empty" names from genuine typos:
        /// e.g. "MultistoryStairs" is a real class even when the document has no instances.
        /// </summary>
        public static bool IsKnownElementName(string name)
        {
            var cleanName = name.Trim();
            if (string.IsNullOrEmpty(cleanName)) return false;

            var singularName = cleanName.EndsWith("ies", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 3) + "y" :
                               (cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !cleanName.EndsWith("ss", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName);

            if (_revitTypes == null)
            {
                try { _revitTypes = typeof(Element).Assembly.GetTypes(); }
                catch { return false; } // leave null so future calls can retry
            }

            var cleanCompact = cleanName.Replace(" ", "");
            var singularCompact = singularName.Replace(" ", "");

            // Revit Element subclass names
            foreach (var t in _revitTypes)
            {
                if (!typeof(Element).IsAssignableFrom(t)) continue;
                var tName = t.Name;
                if (tName.Equals(cleanName, StringComparison.OrdinalIgnoreCase) ||
                    tName.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                    tName.Replace(" ", "").Equals(cleanCompact, StringComparison.OrdinalIgnoreCase) ||
                    tName.Replace(" ", "").Equals(singularCompact, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            // BuiltInCategory names (OST_ prefix, spaces and underscores normalized)
            foreach (var bicName in Enum.GetNames(typeof(BuiltInCategory)))
            {
                var compact = bicName.Replace("_", "").Replace(" ", "");
                var noPrefix = compact.StartsWith("OST", StringComparison.OrdinalIgnoreCase) ? compact.Substring(3) : compact;
                if (compact.Equals("OST" + cleanCompact, StringComparison.OrdinalIgnoreCase) ||
                    noPrefix.Equals(cleanCompact, StringComparison.OrdinalIgnoreCase) ||
                    noPrefix.Equals(singularCompact, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
