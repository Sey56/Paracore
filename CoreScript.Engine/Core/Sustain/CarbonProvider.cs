using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace CoreScript.Engine.Core.Sustain
{
    /// <summary>
    /// Provides carbon emission factors for Revit materials.
    /// Initial implementation uses industry-average values (cradle-to-gate).
    /// </summary>
    public class CarbonProvider
    {
        // Dictionary of emission factors: kgCO2e per kg of material
        // Sources: Industry averages (ICE Database / Ecoinvent style)
        private static readonly Dictionary<string, double> _factorsByKeywords = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            { "Concrete", 0.12 },
            { "Steel", 2.20 },
            { "Iron", 1.90 },
            { "Aluminum", 12.0 },
            { "Timber", 0.45 },
            { "Wood", 0.45 },
            { "Plywood", 0.70 },
            { "Glass", 1.40 },
            { "Brick", 0.22 },
            { "Ceramic", 0.80 },
            { "Plastic", 2.50 },
            { "PVC", 3.10 },
            { "Copper", 4.50 },
            { "Lead", 1.60 },
            { "Zinc", 3.20 },
            { "Plaster", 0.15 },
            { "Gypsum", 0.15 },
            { "Insulation", 1.20 },
            { "Mineral Wool", 1.10 },
            { "Polystyrene", 3.40 },
            { "Asphalt", 0.05 },
            { "Gravel", 0.01 },
            { "Sand", 0.01 },
            { "Soil", 0.005 }
        };

        /// <summary>
        /// Gets the carbon intensity (kgCO2e per kg) for a given Revit material.
        /// Searches by name keywords if no exact match is found.
        /// </summary>
        public double GetIntensityPerKg(Material material)
        {
            if (material == null) return 0.15; // Standard "Generic Material" intensity

            string name = material.Name;

            // Attempt keyword match
            foreach (var kvp in _factorsByKeywords)
            {
                if (name.Contains(kvp.Key, StringComparison.OrdinalIgnoreCase))
                {
                    return kvp.Value;
                }
            }

            // Default fallback for unknown materials
            return 0.15; 
        }

        /// <summary>
        /// Gets the density of the material in kg/m3.
        /// Primarily pulls from the Thermal/Physical assets if available.
        /// </summary>
        public double GetDensity(Material material)
        {
            if (material == null) return 1800.0; // Default to a standard construction density (e.g., masonry/concrete mix) if unknown

            // Try to find structural/physical asset for density
            var structuralId = material.StructuralAssetId;
            if (structuralId != ElementId.InvalidElementId)
            {
                var pse = material.Document.GetElement(structuralId) as PropertySetElement;
                if (pse != null)
                {
                    var asset = pse.GetStructuralAsset();
                    if (asset.Density > 0) return asset.Density;
                }
            }

            // Fallback based on name keywords if no physics asset exists
            string name = material.Name.ToLower();
            if (name.Contains("steel") || name.Contains("iron")) return 7850.0;
            if (name.Contains("concrete")) return 2400.0;
            if (name.Contains("timber") || name.Contains("wood")) return 600.0;
            if (name.Contains("aluminum")) return 2700.0;
            if (name.Contains("glass")) return 2500.0;
            if (name.Contains("brick")) return 1900.0;
            if (name.Contains("insulation")) return 50.0;

            return 2400.0; // General default
        }
    }
}
