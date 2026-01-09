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
        private static Type[]? _revitTypes; // Static cache

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

        /// <summary>
        /// Generic method to get elements by type name.
        /// Uses reflection to find the Type and collect elements.
        /// </summary>
        private List<string> GetGenericElements(string typeName, string categoryName = null)
        {
            try
            {
                // 1. STRATEGY A: Class-Based Search (Existing)
                if (_revitTypes == null)
                {
                    var revitAssembly = typeof(Element).Assembly;
                    _revitTypes = revitAssembly.GetTypes();
                }

                var type = _revitTypes
                    .FirstOrDefault(t => t.Name.Equals(typeName, StringComparison.OrdinalIgnoreCase) && 
                                        (t.IsSubclassOf(typeof(Element)) || t == typeof(Element)));

                if (type != null)
                {
                    var collector = new FilteredElementCollector(_doc)
                        .OfClass(type)
                        .Cast<Element>();

                    if (!string.IsNullOrEmpty(categoryName))
                        collector = collector.Where(e => e.Category?.Name == categoryName);

                    var results = collector.Select(e => e.Name).Where(n => !string.IsNullOrEmpty(n)).ToList();
                    if (results.Count > 0) return results.Distinct().OrderBy(n => n).ToList();
                }

                // 2. STRATEGY B: Category-Based Search (Fallback for things like "Pipe", "Duct", "Wall")
                // Search for BuiltInCategory that matches the typeName
                var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                var targetCategory = categories.FirstOrDefault(c => 
                    c.ToString().Equals($"OST_{typeName}", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{typeName}s", StringComparison.OrdinalIgnoreCase) ||
                    c.ToString().Equals($"OST_{typeName}Curves", StringComparison.OrdinalIgnoreCase));

                if (targetCategory != default)
                {
                    // For categories, we usually want the Types (PipeTypes, WallTypes) if available
                    var typeCollector = new FilteredElementCollector(_doc)
                        .OfCategory(targetCategory)
                        .WhereElementIsElementType()
                        .Cast<Element>()
                        .Select(e => e.Name)
                        .ToList();

                    if (typeCollector.Count > 0) return typeCollector.Distinct().OrderBy(n => n).ToList();

                    // Fallback to instances if no types found
                    var instanceCollector = new FilteredElementCollector(_doc)
                        .OfCategory(targetCategory)
                        .WhereElementIsNotElementType()
                        .Cast<Element>()
                        .Select(e => e.Name)
                        .ToList();

                    if (instanceCollector.Count > 0) return instanceCollector.Distinct().OrderBy(n => n).ToList();
                }

                return new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }

        #endregion
    }
}
