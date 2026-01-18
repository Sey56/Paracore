using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Computes parameter options by querying the Revit document for element names.
    /// Used for dynamic dropdown population in the UI.
    /// </summary>
    public class ParameterOptionsComputer
    {
        private readonly Document _doc;
        private static Type[]? _revitTypes;

        public ParameterOptionsComputer(Document doc)
        {
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
        }

        /// <summary>
        /// Computes options for a parameter based on its RevitElementType and optional category filter.
        /// Returns a list of element names (strings) that can be used in a dropdown.
        /// </summary>
        /// <param name="revitElementType">The Revit element type (e.g., "WallType", "Level", "FamilySymbol")</param>
        /// <param name="category">Optional category filter (e.g., "Doors", "Windows")</param>
        /// <returns>List of element names</returns>
        public List<string> ComputeOptions(string revitElementType, string category = null)
        {
            if (string.IsNullOrEmpty(revitElementType))
                return new List<string>();

            try
            {
                return revitElementType switch
                {
                    "WallType" => GetWallTypes(),
                    "FloorType" => GetFloorTypes(),
                    "RoofType" => GetRoofTypes(),
                    "CeilingType" => GetCeilingTypes(),
                    "Level" => GetLevels(),
                    "Grid" => GetGrids(),
                    "View" => GetViews(category), // category can be "FloorPlan", "Section", etc.
                    "ViewFamilyType" => GetViewFamilyTypes(),
                    "FamilySymbol" => GetFamilySymbols(category), // category is required (e.g., "Doors", "Windows")
                    "Family" => GetFamilies(category),
                    "Material" => GetMaterials(),
                    "LineStyle" => GetLineStyles(),
                    "DimensionType" => GetDimensionTypes(),
                    "TextNoteType" => GetTextNoteTypes(),
                    "FilledRegionType" => GetFilledRegionTypes(),
                    "Sheet" => GetSheets(),
                    "ViewSheet" => GetSheets(),
                    _ => GetGenericElements(revitElementType, category)
                };
            }
            catch (Exception ex)
            {
                // Log error and return empty list
                Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}");
                return new List<string>();
            }
        }

        #region Specific Element Type Methods

        private List<string> GetWallTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(WallType))
                .Cast<WallType>()
                .Select(w => w.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetFloorTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(FloorType))
                .Cast<FloorType>()
                .Select(f => f.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetRoofTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(RoofType))
                .Cast<RoofType>()
                .Select(r => r.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetCeilingTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(CeilingType))
                .Cast<CeilingType>()
                .Select(c => c.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetLevels()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(Level))
                .Cast<Level>()
                .Select(l => l.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetGrids()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(Grid))
                .Cast<Grid>()
                .Select(g => g.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetViews(string viewType = null)
        {
            var collector = new FilteredElementCollector(_doc)
                .OfClass(typeof(View))
                .Cast<View>()
                .Where(v => !v.IsTemplate); // Exclude view templates

            // Filter by view type if specified
            if (!string.IsNullOrEmpty(viewType))
            {
                collector = collector.Where(v => v.ViewType.ToString() == viewType);
            }

            return collector
                .Select(v => v.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetViewFamilyTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(ViewFamilyType))
                .Cast<ViewFamilyType>()
                .Select(vft => vft.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetFamilySymbols(string categoryName = null)
        {
            var collector = new FilteredElementCollector(_doc)
                .OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>();

            // Filter by category if specified
            if (!string.IsNullOrEmpty(categoryName))
            {
                collector = collector.Where(fs => fs.Category?.Name == categoryName);
            }

            return collector
                .Select(fs => $"{fs.FamilyName}: {fs.Name}")
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetFamilies(string categoryName = null)
        {
            var collector = new FilteredElementCollector(_doc)
                .OfClass(typeof(Family))
                .Cast<Family>();

            // Filter by category if specified
            if (!string.IsNullOrEmpty(categoryName))
            {
                collector = collector.Where(f => f.FamilyCategory?.Name == categoryName);
            }

            return collector
                .Select(f => f.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetMaterials()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(Material))
                .Cast<Material>()
                .Select(m => m.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetLineStyles()
        {
            var lineStyles = new List<string>();
            var category = _doc.Settings.Categories.get_Item(BuiltInCategory.OST_Lines);
            
            if (category != null)
            {
                foreach (Category subCat in category.SubCategories)
                {
                    lineStyles.Add(subCat.Name);
                }
            }

            return lineStyles.OrderBy(n => n).ToList();
        }

        private List<string> GetDimensionTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(DimensionType))
                .Cast<DimensionType>()
                .Select(dt => dt.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetTextNoteTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(TextNoteType))
                .Cast<TextNoteType>()
                .Select(tnt => tnt.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetFilledRegionTypes()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(FilledRegionType))
                .Cast<FilledRegionType>()
                .Select(frt => frt.Name)
                .OrderBy(n => n)
                .ToList();
        }

        private List<string> GetSheets()
        {
            return new FilteredElementCollector(_doc)
                .OfClass(typeof(ViewSheet))
                .Cast<ViewSheet>()
                .Select(s => $"{s.SheetNumber} - {s.Name}")
                .OrderBy(n => n)
                .ToList();
        }

        /// <summary>
        /// The Master Resolver: Implements the "Three Pillars" in a single, robust pass.
        /// 1. Strategy A: Class Discovery (e.g., Room, Level, Material)
        /// 2. Strategy B: BuiltInCategory Discovery (e.g., Pipe, Duct, Wall)
        /// 3. Strategy C: Localized Category Discovery (Fallback for strings)
        /// </summary>
        private List<string> GetGenericElements(string targetName, string categoryFilter = null)
        {
            try
            {
                var cleanName = targetName.Trim();
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) 
                                   ? cleanName.Substring(0, cleanName.Length - 1) 
                                   : cleanName;

                // --- STRATEGY 1: STRING-FIRST CATEGORY MATCH (The user's remembered "Magic") ---
                // We check the document's categories for a name match (localized or English)
                var matchedCategory = _doc.Settings.Categories.Cast<Category>().FirstOrDefault(c => 
                    c.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || 
                    c.Name.Equals($"{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                    c.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                    c.Name.Equals($"{singularName}s", StringComparison.OrdinalIgnoreCase));

                if (matchedCategory != null)
                {
                    var catId = matchedCategory.Id;

                    // A. Try Types (WallTypes, PipeTypes)
                    var types = new FilteredElementCollector(_doc).OfCategoryId(catId).WhereElementIsElementType()
                        .Cast<Element>().Select(e => e.Name).Distinct().OrderBy(n => n).ToList();
                    if (types.Count > 0 && !cleanName.Equals("Room", StringComparison.OrdinalIgnoreCase)) return types;

                    // B. Try Instances (Rooms, Materials, specific elements)
                    var instances = new FilteredElementCollector(_doc).OfCategoryId(catId).WhereElementIsNotElementType()
                        .Cast<Element>().Select(e => e.Name).Distinct().OrderBy(n => n).ToList();
                    if (instances.Count > 0) return instances;
                }

                // --- STRATEGY 2: BUILT-IN ENUM MATCH (Language Independent) ---
                var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                var builtin = categories.FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{cleanName}Curves", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase));

                if (builtin != default)
                {
                    var catId = new ElementId(builtin);
                    var collector = new FilteredElementCollector(_doc).OfCategoryId(catId);
                    
                    // Priority: If it's Room-related, get instances. Otherwise, try types.
                    if (cleanName.Contains("Room") || cleanName.Contains("Area") || cleanName.Contains("Space"))
                    {
                        var names = collector.WhereElementIsNotElementType().Cast<Element>().Select(e => e.Name).Distinct().ToList();
                        if (names.Count > 0) return names;
                    }

                    var types = collector.WhereElementIsElementType().Cast<Element>().Select(e => e.Name).Distinct().ToList();
                    if (types.Count > 0) return types;
                    
                    var inst = collector.WhereElementIsNotElementType().Cast<Element>().Select(e => e.Name).Distinct().ToList();
                    if (inst.Count > 0) return inst;
                }

                // --- STRATEGY 3: CLASS REFLECTION (Fallback for generic types) ---
                if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();
                var classType = _revitTypes.FirstOrDefault(t => 
                    (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)) &&
                    (t.IsSubclassOf(typeof(Element)) || t == typeof(Element)));

                if (classType != null)
                {
                    var names = new FilteredElementCollector(_doc).OfClass(classType)
                        .Cast<Element>().Select(e => e.Name).Distinct().OrderBy(n => n).ToList();
                    if (names.Count > 0) return names;
                }

                return new List<string>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Master Resolver] Fatal error for {targetName}: {ex.Message}");
                return new List<string>();
            }
        }

        #endregion
    }
}
