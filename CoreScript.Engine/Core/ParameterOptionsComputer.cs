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
                // 1. Specialized Methods (For unique logic)
                return revitElementType switch
                {
                    "View" => GetViews(category),
                    "FamilySymbol" => GetFamilySymbols(category),
                    "Family" => GetFamilies(category),
                    "Material" => GetMaterials(),
                    "LineStyle" => GetLineStyles(),
                    _ => ResolveTargetElements(revitElementType, category)
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}");
                return new List<string>();
            }
        }

        #region Helper Methods

        private List<string> ResolveTargetElements(string targetName, string categoryFilter = null)
        {
            // 1. Try Category Resolution (The "Magic" way)
            // This maps "Pipe" to "Pipes", "Wall" to "Walls", etc.
            var category = _doc.Settings.Categories.Cast<Category>()
                .FirstOrDefault(c => c.Name.Equals(targetName, StringComparison.OrdinalIgnoreCase) || 
                                    c.Name.Equals($"{targetName}s", StringComparison.OrdinalIgnoreCase));

            if (category != null)
            {
                var types = new FilteredElementCollector(_doc)
                    .OfCategoryId(category.Id)
                    .WhereElementIsElementType()
                    .Cast<Element>()
                    .Select(e => e.Name)
                    .Distinct()
                    .OrderBy(n => n)
                    .ToList();

                if (types.Count > 0) return types;

                // Fallback to instances if no type definitions found
                return new FilteredElementCollector(_doc)
                    .OfCategoryId(category.Id)
                    .WhereElementIsNotElementType()
                    .Cast<Element>()
                    .Select(e => e.Name)
                    .Distinct()
                    .OrderBy(n => n)
                    .ToList();
            }

            // 2. Try Reflection/Class Resolution (The "Logic" way)
            // Fallback for non-category things like Level, Material (which are also classes)
            if (_revitTypes == null)
            {
                var revitAssembly = typeof(Element).Assembly;
                _revitTypes = revitAssembly.GetTypes();
            }

            var type = _revitTypes.FirstOrDefault(t => t.Name.Equals(targetName, StringComparison.OrdinalIgnoreCase));
            if (type != null)
            {
                return new FilteredElementCollector(_doc)
                    .OfClass(type)
                    .Cast<Element>()
                    .Select(e => e.Name)
                    .Distinct()
                    .OrderBy(n => n)
                    .ToList();
            }

            return new List<string>();
        }

        private List<string> GetViews(string viewType = null)
        {
            var collector = new FilteredElementCollector(_doc)
                .OfClass(typeof(View))
                .Cast<View>()
                .Where(v => !v.IsTemplate);

            if (!string.IsNullOrEmpty(viewType))
                collector = collector.Where(v => v.ViewType.ToString().Equals(viewType, StringComparison.OrdinalIgnoreCase));

            return collector.Select(v => v.Name).OrderBy(n => n).ToList();
        }

        private List<string> GetFamilySymbols(string categoryName = null)
        {
            var collector = new FilteredElementCollector(_doc).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>();

            if (!string.IsNullOrEmpty(categoryName))
                collector = collector.Where(fs => fs.Category?.Name.Equals(categoryName, StringComparison.OrdinalIgnoreCase) == true);

            return collector.Select(fs => $"{fs.FamilyName}: {fs.Name}").OrderBy(n => n).ToList();
        }

        private List<string> GetFamilies(string categoryName = null)
        {
            var collector = new FilteredElementCollector(_doc).OfClass(typeof(Family)).Cast<Family>();

            if (!string.IsNullOrEmpty(categoryName))
                collector = collector.Where(f => f.FamilyCategory?.Name.Equals(categoryName, StringComparison.OrdinalIgnoreCase) == true);

            return collector.Select(f => f.Name).OrderBy(n => n).ToList();
        }

        private List<string> GetMaterials()
        {
            return new FilteredElementCollector(_doc).OfClass(typeof(Material)).Cast<Material>().Select(m => m.Name).OrderBy(n => n).ToList();
        }

        private List<string> GetLineStyles()
        {
            var category = _doc.Settings.Categories.get_Item(BuiltInCategory.OST_Lines);
            if (category == null) return new List<string>();
            return category.SubCategories.Cast<Category>().Select(c => c.Name).OrderBy(n => n).ToList();
        }

        #endregion
    }
}
